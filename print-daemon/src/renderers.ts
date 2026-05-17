// Ticket renderers — turn a print_job payload into ESC/POS bytes.

import { ESCPOS } from './escpos.js'
import { createCanvas, type SKRSContext2D, type Canvas } from '@napi-rs/canvas'
import {
  createTicketCanvas,
  canvasToMonoBitmap,
  drawText,
  drawHr,
  drawWrappedText,
  drawRow,
  space,
  PRINT_WIDTH_PX,
  type CursorState,
} from './image-renderer.js'

interface ComandaItem {
  name: string
  quantity: number
  notes?: string | null
  modifiers?: { name: string }[]
}

interface ComandaPayload {
  table_label: string
  staff_name: string | null
  comensales: number
  nota_mesa: string | null
  urgente: boolean
  items: ComandaItem[]
  printed_at: string
}

interface ClienteFiscal {
  nif: string
  nombre: string
  direccion: string
}

interface FacturaPayload {
  numero: string
  // 'S' (simplificada) o 'F' (completa). Determina el título impreso
  // y si se renderiza el bloque de datos de cliente.
  serie?: 'S' | 'F'
  table_label: string
  staff_name: string | null
  comensales: number
  items: { name: string; quantity: number; price: number }[]
  subtotal: number
  iva: number
  total: number
  payment_method: 'efectivo' | 'tarjeta' | 'mixto'
  efectivo_entregado: number | null
  cambio: number | null
  cliente?: ClienteFiscal | null
  printed_at: string
  restaurant: {
    name: string
    nif?: string | null
    direccion?: string | null
    telefono?: string | null
    pie_ticket?: string | null
  }
}

interface AnulacionPayload {
  table_label: string
  staff_name: string | null
  motivo: string | null
  items: { name: string; quantity: number }[]
  printed_at: string
}

interface RectificativaPayload {
  numero: string
  original_numero: string
  table_label: string | null
  staff_name: string | null
  comensales: number | null
  // Items con quantity NEGATIVA; price es el original sin negar.
  items: { name: string; quantity: number; price: number }[]
  // Importes negativos (subtotal, iva y total son negativos).
  subtotal: number
  iva: number
  total: number
  motivo: string
  cliente?: ClienteFiscal | null
  printed_at: string
  restaurant: {
    name: string
    nif?: string | null
    direccion?: string | null
    telefono?: string | null
    pie_ticket?: string | null
  }
}

interface CuentaProvisionalPayload {
  table_label: string
  comensales: number
  items: { name: string; quantity: number; price: number }[]
  subtotal: number
  iva: number
  total: number
  printed_at: string
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtTimeShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function money(n: number): string {
  return n.toFixed(2) + ' €'
}

// =====================================================================
// Comanda (cocina or barra) — rendered as image with proper typography.
// Design: NO destination header (mesa is the header), all uppercase,
// notes-on-top with inverted band, urgente as huge inverted black band.
// =====================================================================
export function renderComanda(payload: ComandaPayload, _kind: 'cocina' | 'barra'): ESCPOS {
  // First pass: estimate the height we need. We over-allocate generously
  // and trim later — canvas can't grow dynamically.
  // Rough budget: 80 (urgente) + 130 (mesa+meta) + 100 (nota) + 90 per item + 60 (footer)
  const approxHeight =
    (payload.urgente ? 90 : 0) +
    160 + // mesa block + meta line
    (payload.nota_mesa ? 130 : 0) +
    payload.items.reduce((sum, i) => {
      const modLines = (i.modifiers?.length || 0) + (i.notes ? 1 : 0)
      return sum + 70 + modLines * 38
    }, 0) +
    80

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 24 }

  // ── URGENTE band (full-width inverted) ──
  if (payload.urgente) {
    drawText(ctx, cursor, '*** URGENTE ***', {
      size: 44,
      bold: true,
      align: 'center',
      invert: true,
      invertPaddingY: 12,
    })
    space(cursor, 18)
  }

  // ── MESA at the top, MASSIVE ──
  drawText(ctx, cursor, `MESA ${payload.table_label}`, {
    size: 80,
    bold: true,
    align: 'center',
  })
  space(cursor, 8)

  // ── Meta line: pax · staff · time ──
  const meta = `${payload.comensales} PAX  ·  ${(payload.staff_name || '—').toUpperCase()}  ·  ${fmtTimeShort(payload.printed_at)}`
  drawText(ctx, cursor, meta, { size: 26, align: 'center' })

  // ── Nota de mesa (UP TOP — allergies must be seen before cooking) ──
  if (payload.nota_mesa) {
    space(cursor, 16)
    drawText(ctx, cursor, ' NOTA MESA ', {
      size: 26,
      bold: true,
      align: 'center',
      invert: true,
      invertPaddingY: 8,
    })
    space(cursor, 8)
    drawWrappedText(ctx, cursor, payload.nota_mesa.toUpperCase(), {
      size: 32,
      bold: true,
      align: 'left',
      paddingX: 24,
    })
  }

  drawHr(ctx, cursor, { thickness: 3, marginY: 16 })

  // ── Items ──
  for (const item of payload.items) {
    drawWrappedText(ctx, cursor, `${item.quantity}x  ${item.name.toUpperCase()}`, {
      size: 36,
      bold: true,
      align: 'left',
      paddingX: 16,
    })

    const modList: string[] = []
    if (item.modifiers) modList.push(...item.modifiers.map(m => m.name))
    if (item.notes) modList.push(item.notes)

    for (const mod of modList) {
      drawWrappedText(ctx, cursor, `»  ${mod.toUpperCase()}`, {
        size: 26,
        bold: false,
        align: 'left',
        paddingX: 16,
        indentX: 40,
      })
    }
    space(cursor, 16)
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 8 })
  space(cursor, 40) // bottom feed before cut

  // Trim canvas to actual height used (cursor.y) — we may have over-allocated.
  // Easiest path: create a new canvas of exact height and copy. Skipping this
  // is fine for now; the bitmap converter just sends extra white rows which
  // the printer feeds blank. We'll trim later if it wastes paper.
  const usedHeight = Math.min(approxHeight, Math.ceil(cursor.y))
  const trimmed = trimCanvas(canvas, usedHeight)

  // Convert to bitmap and wrap with ESC/POS init + cut commands.
  const { bitmap, width, height } = canvasToMonoBitmap(trimmed)
  const e = new ESCPOS()
  e.init()
  e.rasterImageEscStar(bitmap, width, height)
  e.feed(2).cut()
  return e
}

// Helper: trim a canvas to a smaller height (returns a new canvas).
function trimCanvas(src: Canvas, newHeight: number): Canvas {
  const trimmed = createCanvas(src.width, newHeight)
  const tctx = trimmed.getContext('2d') as SKRSContext2D
  tctx.fillStyle = 'white'
  tctx.fillRect(0, 0, src.width, newHeight)
  tctx.drawImage(src, 0, 0)
  return trimmed
}

// =====================================================================
// Anulación — rendered as image. Big "ANULACION" header in inverted
// black band so kitchen sees it across the pass.
// =====================================================================
export function renderAnulacion(payload: AnulacionPayload): ESCPOS {
  // Height budget: header band + meta + 100/item + motivo block + footer
  const approxHeight =
    140 + // ANULACION band
    160 + // mesa + meta
    payload.items.reduce((s, i) => s + 60, 0) +
    (payload.motivo ? 140 : 0) +
    140

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 20 }

  // ── ANULACION band (inverted) — impossible to miss from across the kitchen
  const bandH = 96
  ctx.fillStyle = 'black'
  ctx.fillRect(0, cursor.y, PRINT_WIDTH_PX, bandH)
  ctx.fillStyle = 'white'
  ctx.font = `bold 56px Inter Bold`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText('ANULACION', PRINT_WIDTH_PX / 2, cursor.y + 18)
  ctx.fillStyle = 'black'
  cursor.y += bandH + 18

  // ── Mesa + meta
  drawText(ctx, cursor, `Mesa ${payload.table_label}`, { size: 42, bold: true, align: 'left' })
  drawText(ctx, cursor, `${payload.staff_name || '—'}  ·  ${fmtTime(payload.printed_at)}`, {
    size: 20, align: 'left',
  })
  drawHr(ctx, cursor, { thickness: 2, marginY: 14 })

  // ── Items to retire — big and clear, "RETIRAR Nx Item"
  for (const item of payload.items) {
    drawText(ctx, cursor, `RETIRAR  ${item.quantity}x  ${item.name.toUpperCase()}`, {
      size: 32, bold: true, align: 'left',
    })
    space(cursor, 4)
  }

  // ── Motivo (if provided)
  if (payload.motivo) {
    space(cursor, 8)
    drawText(ctx, cursor, 'Motivo:', { size: 22, bold: true, align: 'left' })
    drawWrappedText(ctx, cursor, payload.motivo, { size: 22, align: 'left', paddingX: 24 })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 18 })
  space(cursor, 30)

  const trimmed = trimCanvas(canvas, Math.min(approxHeight, Math.ceil(cursor.y)))
  const { bitmap, width, height } = canvasToMonoBitmap(trimmed)
  const e = new ESCPOS()
  e.init()
  e.rasterImageEscStar(bitmap, width, height)
  e.feed(2).cut()
  return e
}

// =====================================================================
// Factura simplificada (ticket de venta) — rendered as image
// =====================================================================
export function renderFactura(payload: FacturaPayload): ESCPOS {
  // Estimate height
  const itemCount = payload.items.length
  const approxHeight =
    280 + // header (name, NIF, dirección, tel)
    180 + // ticket meta
    (payload.cliente ? 160 : 0) + // cliente block (only for completa)
    itemCount * 42 + // items
    260 + // totals + TOTAL band + payment
    180 + // footer
    160

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 28 }

  const isCompleta = payload.serie === 'F'

  // ── Header
  drawText(ctx, cursor, payload.restaurant.name, { size: 56, bold: true, align: 'center' })
  space(cursor, 4)
  if (payload.restaurant.nif) {
    drawText(ctx, cursor, `NIF: ${payload.restaurant.nif}`, { size: 20, align: 'center' })
  }
  if (payload.restaurant.direccion) {
    drawWrappedText(ctx, cursor, payload.restaurant.direccion, {
      size: 20,
      align: 'center',
      paddingX: 24,
    })
  }
  if (payload.restaurant.telefono) {
    drawText(ctx, cursor, `Tel: ${payload.restaurant.telefono}`, { size: 20, align: 'center' })
  }

  drawHr(ctx, cursor, { thickness: 2, marginY: 18 })

  // ── Tipo de documento: muy visible arriba.
  // Texto exigido por art. 6/7 del RD 1619/2012: la factura debe
  // identificarse explícitamente. Las simplificadas (S) llevan
  // "FACTURA SIMPLIFICADA" y las completas (F) "FACTURA".
  // Tamaño grande para que el cliente lo identifique de un vistazo.
  drawText(
    ctx, cursor,
    isCompleta ? 'FACTURA' : 'FACTURA SIMPLIFICADA',
    { size: 36, bold: true, align: 'center' }
  )
  space(cursor, 8)

  // ── Ticket meta (two-column)
  // "Número y serie" + "Fecha de expedición" son obligatorios.
  drawRow(ctx, cursor, 'Nº:', payload.numero, { size: 22 })
  drawRow(ctx, cursor, 'Fecha:', fmtTime(payload.printed_at), { size: 22 })
  drawRow(ctx, cursor, 'Mesa:', `${payload.table_label} · ${payload.comensales} pax`, { size: 22 })
  if (payload.staff_name) {
    drawRow(ctx, cursor, 'Atiende:', payload.staff_name, { size: 22 })
  }

  // ── Bloque cliente (solo factura completa)
  // Datos requeridos por art. 6.1.d) RD 1619/2012:
  // nombre/razón social, NIF y domicilio del destinatario.
  if (payload.cliente) {
    drawHr(ctx, cursor, { dashed: true, marginY: 14 })
    drawText(ctx, cursor, 'CLIENTE', { size: 20, bold: true, align: 'left' })
    drawRow(ctx, cursor, 'NIF:', payload.cliente.nif, { size: 22 })
    drawRow(ctx, cursor, 'Nombre:', payload.cliente.nombre, { size: 22 })
    drawWrappedText(ctx, cursor, payload.cliente.direccion, {
      size: 20, align: 'left', paddingX: 24,
    })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Items: qty | name | price (3-column manual layout)
  // "Descripción de las operaciones" — art. 6.1.f) / 7.1.d).
  for (const item of payload.items) {
    drawItemRow(ctx, cursor, item)
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Totales con desglose IVA por tipo impositivo.
  // Para que sea válida como factura (completa o simplificada
  // cualificada con derecho a deducción), la AEAT exige el tipo
  // impositivo aplicado y la cuota repercutida desglosada. Hoy todo
  // va al 10% (hostelería); cuando metamos categorías con IVA 21%
  // (alcohol, refrescos) habrá que desglosar por base de cada tipo.
  // De momento línea única "IVA 10%".
  drawRow(ctx, cursor, 'Base imponible', money(payload.subtotal), { size: 24 })
  drawRow(ctx, cursor, 'Tipo IVA', '10%', { size: 22 })
  drawRow(ctx, cursor, 'Cuota IVA', money(payload.iva), { size: 24 })
  space(cursor, 6)

  // TOTAL — inverted band, big
  drawTotalBand(ctx, cursor, 'TOTAL', money(payload.total))
  space(cursor, 16)

  // ── Payment
  const pago = payload.payment_method === 'efectivo' ? 'Efectivo'
             : payload.payment_method === 'tarjeta' ? 'Tarjeta'
             : 'Mixto'
  drawRow(ctx, cursor, 'Pago:', pago, { size: 22 })
  if (payload.efectivo_entregado != null) {
    drawRow(ctx, cursor, 'Entregado:', money(payload.efectivo_entregado), { size: 22 })
  }
  if (payload.cambio != null) {
    drawRow(ctx, cursor, 'Cambio:', money(payload.cambio), { size: 22 })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 18 })

  // ── Footer
  drawText(ctx, cursor, payload.restaurant.pie_ticket || '¡Gracias por su visita!', {
    size: 22, bold: true, align: 'center',
  })
  space(cursor, 4)
  // Mención legal: el IVA está incluido en los precios (régimen
  // general de IVA en hostelería al 10%). Si en el futuro el
  // restaurante pasara a recargo de equivalencia u otro régimen
  // especial habría que cambiar este texto — se podría hacer un
  // campo en restaurant_config.
  drawText(ctx, cursor, 'IVA incluido en los precios', { size: 18, align: 'center' })
  // Recordatorio para el cliente. Conviene a efectos de defensa
  // ante incidencias y para el régimen sancionador de la AEAT.
  drawText(ctx, cursor, 'Conserve este documento', { size: 16, align: 'center' })
  space(cursor, 30)

  const trimmed = trimCanvas(canvas, Math.min(approxHeight, Math.ceil(cursor.y)))
  const { bitmap, width, height } = canvasToMonoBitmap(trimmed)
  const e = new ESCPOS()
  e.init()
  e.rasterImageEscStar(bitmap, width, height)
  e.feed(2).cut()
  return e
}

// 3-column item row: qty (left) · name (mid) · price (right)
function drawItemRow(
  ctx: SKRSContext2D,
  cursor: CursorState,
  item: { name: string; quantity: number; price: number }
) {
  const size = 26
  const lineHeight = Math.round(size * 1.18)
  const padX = 24
  const qtyColX = padX
  const nameColX = padX + 54
  const lineTotal = item.price * item.quantity

  ctx.font = `bold ${size}px Inter Bold`
  ctx.fillStyle = 'black'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`${item.quantity}x`, qtyColX, cursor.y)

  // Name — wrap if necessary inside the available column
  const priceStr = money(lineTotal)
  ctx.font = `bold ${size}px Inter Bold`
  const priceW = ctx.measureText(priceStr).width
  const nameMaxW = PRINT_WIDTH_PX - nameColX - padX - priceW - 12

  ctx.font = `bold ${size}px Inter Bold`
  const words = item.name.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? current + ' ' + w : w
    if (ctx.measureText(test).width <= nameMaxW) {
      current = test
    } else {
      if (current) lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], nameColX, cursor.y + i * lineHeight)
  }

  // Price right-aligned, on the first line
  ctx.textAlign = 'right'
  ctx.fillText(priceStr, PRINT_WIDTH_PX - padX, cursor.y)

  cursor.y += lineHeight * Math.max(1, lines.length) + 4
}

function drawTotalBand(ctx: SKRSContext2D, cursor: CursorState, label: string, value: string) {
  const size = 36
  const padY = 12
  const padX = 24
  const bandH = size + padY * 2
  ctx.fillStyle = 'black'
  ctx.fillRect(0, cursor.y, PRINT_WIDTH_PX, bandH)
  ctx.fillStyle = 'white'
  ctx.font = `bold ${size}px Inter Bold`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(label, padX, cursor.y + padY)
  ctx.textAlign = 'right'
  ctx.fillText(value, PRINT_WIDTH_PX - padX, cursor.y + padY)
  ctx.fillStyle = 'black'
  cursor.y += bandH
}

// =====================================================================
// Cuenta provisional — rendered as image. Same look-and-feel as the
// factura so customers asking "la cuenta" get a clean ticket; only
// difference is no payment block + "No es factura" disclaimer.
// =====================================================================
export function renderCuentaProvisional(payload: CuentaProvisionalPayload): ESCPOS {
  const itemCount = payload.items.length
  const approxHeight =
    150 + // CUENTA header
    150 + // meta
    itemCount * 44 + // items
    220 + // totals + TOTAL band
    160 + // footer
    160

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 28 }

  // ── Header
  // "Cuenta provisional" o "Pre-cuenta" — DEBE quedar claro que no es
  // una factura. Por ley (art. 6/7 RD 1619/2012), un documento que no
  // sea factura no puede confundirse con una. Por eso ponemos el aviso
  // arriba en banda invertida — imposible de confundir incluso por un
  // cliente apresurado, y "no es factura" repetido en pie.
  const bandH = 70
  ctx.fillStyle = 'black'
  ctx.fillRect(0, cursor.y, PRINT_WIDTH_PX, bandH)
  ctx.fillStyle = 'white'
  ctx.font = `bold 36px Inter Bold`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText('CUENTA PROVISIONAL', PRINT_WIDTH_PX / 2, cursor.y + 18)
  ctx.fillStyle = 'black'
  cursor.y += bandH + 8
  drawText(ctx, cursor, 'No es factura · Sin validez fiscal', {
    size: 18, align: 'center',
  })
  drawHr(ctx, cursor, { thickness: 2, marginY: 14 })

  // ── Meta
  drawRow(ctx, cursor, 'Mesa:', `${payload.table_label} · ${payload.comensales} pax`, { size: 22 })
  drawRow(ctx, cursor, 'Fecha:', fmtTime(payload.printed_at), { size: 22 })

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Items (re-uses drawItemRow from the factura section)
  for (const item of payload.items) {
    drawItemRow(ctx, cursor, item)
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Totals — mismo formato que la factura para que cuadre con lo
  // que pagarán, pero sin valor fiscal.
  drawRow(ctx, cursor, 'Base imponible', money(payload.subtotal), { size: 24 })
  drawRow(ctx, cursor, 'Tipo IVA', '10%', { size: 22 })
  drawRow(ctx, cursor, 'Cuota IVA', money(payload.iva), { size: 24 })
  space(cursor, 6)
  drawTotalBand(ctx, cursor, 'TOTAL', money(payload.total))

  drawHr(ctx, cursor, { dashed: true, marginY: 18 })

  // Recordatorio inequívoco al final, así también si el cliente solo
  // mira el pie sabe que esto no le sirve como justificante de gasto.
  drawText(ctx, cursor, 'ESTE DOCUMENTO NO ES UNA FACTURA', { size: 22, bold: true, align: 'center' })
  drawText(ctx, cursor, 'Solicítela en caja al hacer el pago.', {
    size: 18, align: 'center',
  })
  space(cursor, 30)

  const trimmed = trimCanvas(canvas, Math.min(approxHeight, Math.ceil(cursor.y)))
  const { bitmap, width, height } = canvasToMonoBitmap(trimmed)
  const e = new ESCPOS()
  e.init()
  e.rasterImageEscStar(bitmap, width, height)
  e.feed(2).cut()
  return e
}

// =====================================================================
// Factura rectificativa
// =====================================================================
//
// Anula al 100% un ticket anterior. Importes y cantidades negativos.
// El header lleva una banda roja/invertida "RECTIFICATIVA" para que
// sea inconfundible, y referencia al número original.
//
// Se rige por las mismas reglas fiscales que la simplificada/completa
// para la AEAT, así que repetimos el bloque de datos del restaurante
// y, si el original era completa, los datos del cliente.
// =====================================================================
export function renderRectificativa(payload: RectificativaPayload): ESCPOS {
  const itemCount = payload.items.length
  const approxHeight =
    280 + // header restaurante
    140 + // banda RECTIFICATIVA
    220 + // meta + referencia al original
    (payload.cliente ? 160 : 0) +
    itemCount * 42 +
    260 + // totales + TOTAL band negativo
    220 + // motivo + footer
    160

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 28 }

  // ── Header restaurante (igual que factura)
  drawText(ctx, cursor, payload.restaurant.name, { size: 56, bold: true, align: 'center' })
  space(cursor, 4)
  if (payload.restaurant.nif) {
    drawText(ctx, cursor, `NIF: ${payload.restaurant.nif}`, { size: 20, align: 'center' })
  }
  if (payload.restaurant.direccion) {
    drawWrappedText(ctx, cursor, payload.restaurant.direccion, {
      size: 20, align: 'center', paddingX: 24,
    })
  }
  drawHr(ctx, cursor, { thickness: 2, marginY: 14 })

  // ── Banda RECTIFICATIVA invertida — el cliente tiene que ver al
  // segundo qué documento tiene en la mano.
  const bandH = 80
  ctx.fillStyle = 'black'
  ctx.fillRect(0, cursor.y, PRINT_WIDTH_PX, bandH)
  ctx.fillStyle = 'white'
  ctx.font = `bold 44px Inter Bold`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText('FACTURA RECTIFICATIVA', PRINT_WIDTH_PX / 2, cursor.y + 18)
  ctx.fillStyle = 'black'
  cursor.y += bandH + 14

  // ── Meta + referencia al original
  drawRow(ctx, cursor, 'Nº:', payload.numero, { size: 22 })
  drawRow(ctx, cursor, 'Fecha:', fmtTime(payload.printed_at), { size: 22 })
  drawRow(ctx, cursor, 'Rectifica:', payload.original_numero, { size: 22 })
  if (payload.table_label) {
    drawRow(ctx, cursor, 'Mesa:', payload.table_label, { size: 22 })
  }

  // ── Cliente si lo había (original era completa)
  if (payload.cliente) {
    drawHr(ctx, cursor, { dashed: true, marginY: 14 })
    drawText(ctx, cursor, 'CLIENTE', { size: 20, bold: true, align: 'left' })
    drawRow(ctx, cursor, 'NIF:', payload.cliente.nif, { size: 22 })
    drawRow(ctx, cursor, 'Nombre:', payload.cliente.nombre, { size: 22 })
    drawWrappedText(ctx, cursor, payload.cliente.direccion, {
      size: 20, align: 'left', paddingX: 24,
    })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Items con cantidades negativas. Reutilizamos drawItemRow pero
  // pasando price negativo para que el total de línea salga negativo
  // y se vea claramente que es una devolución contable.
  for (const item of payload.items) {
    drawItemRow(ctx, cursor, {
      name: item.name,
      // quantity ya viene negativa, pero le ponemos un Math.abs para
      // que el "Nx" se lea bien, y dejamos el signo en el precio
      // total de línea (que es quantity*price, negativo).
      quantity: Math.abs(item.quantity),
      price: -Math.abs(item.price),
    })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Totales (negativos)
  // Mismo desglose IVA que la factura original. Las rectificativas
  // por anulación total invierten todos los importes a negativo, lo
  // que contablemente cancela la factura original.
  drawRow(ctx, cursor, 'Base imponible', money(payload.subtotal), { size: 24 })
  drawRow(ctx, cursor, 'Tipo IVA', '10%', { size: 22 })
  drawRow(ctx, cursor, 'Cuota IVA', money(payload.iva), { size: 24 })
  space(cursor, 6)
  drawTotalBand(ctx, cursor, 'TOTAL', money(payload.total))
  space(cursor, 16)

  // ── Causa de la rectificación (art. 15 RD 1619/2012)
  // Texto requerido: las facturas rectificativas deben indicar el
  // motivo y los datos identificativos de la factura rectificada.
  drawHr(ctx, cursor, { dashed: true, marginY: 12 })
  drawText(ctx, cursor, 'Tipo: Anulación total', { size: 20, bold: true, align: 'left' })
  drawText(ctx, cursor, 'Motivo:', { size: 22, bold: true, align: 'left' })
  drawWrappedText(ctx, cursor, payload.motivo, { size: 22, align: 'left', paddingX: 24 })

  drawHr(ctx, cursor, { dashed: true, marginY: 18 })
  drawText(ctx, cursor, 'Este documento anula la factura', {
    size: 18, align: 'center',
  })
  drawText(ctx, cursor, `nº ${payload.original_numero}.`, {
    size: 18, align: 'center',
  })
  space(cursor, 30)

  const trimmed = trimCanvas(canvas, Math.min(approxHeight, Math.ceil(cursor.y)))
  const { bitmap, width, height } = canvasToMonoBitmap(trimmed)
  const e = new ESCPOS()
  e.init()
  e.rasterImageEscStar(bitmap, width, height)
  e.feed(2).cut()
  return e
}
