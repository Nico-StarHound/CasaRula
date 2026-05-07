// Ticket renderers — turn a print_job payload into ESC/POS bytes.

import { ESCPOS, LINE_WIDTH } from './escpos.js'
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

interface FacturaPayload {
  numero: string
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
// Anulación
// =====================================================================
export function renderAnulacion(payload: AnulacionPayload): ESCPOS {
  const e = new ESCPOS()
  e.init()

  e.align('center').bold(true).size(2, 2)
  e.line('** ANULACION **')
  e.resetSize().bold(false)
  e.align('left')
  e.hr('=')

  e.bold(true).size(2, 1).line(`Mesa ${payload.table_label}`).resetSize().bold(false)
  e.line(`${payload.staff_name || '—'}  ·  ${fmtTime(payload.printed_at)}`)
  e.hr('=')

  for (const item of payload.items) {
    e.bold(true).size(1, 2)
    e.line(`RETIRAR  ${item.quantity}x  ${item.name}`)
    e.resetSize().bold(false)
  }

  if (payload.motivo) {
    e.newline()
    e.bold(true).line('Motivo:').bold(false)
    e.line(payload.motivo)
  }

  e.hr('-')
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
    itemCount * 42 + // items
    260 + // totals + TOTAL band + payment
    180 + // footer
    160

  const { canvas, ctx } = createTicketCanvas(approxHeight)
  const cursor: CursorState = { y: 28 }

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

  // ── Ticket meta (two-column)
  drawRow(ctx, cursor, 'Ticket:', payload.numero, { size: 22 })
  drawRow(ctx, cursor, 'Fecha:', fmtTime(payload.printed_at), { size: 22 })
  drawRow(ctx, cursor, 'Mesa:', `${payload.table_label} · ${payload.comensales} pax`, { size: 22 })
  if (payload.staff_name) {
    drawRow(ctx, cursor, 'Atiende:', payload.staff_name, { size: 22 })
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Items: qty | name | price (3-column manual layout)
  for (const item of payload.items) {
    drawItemRow(ctx, cursor, item)
  }

  drawHr(ctx, cursor, { dashed: true, marginY: 14 })

  // ── Totals
  drawRow(ctx, cursor, 'Base imponible', money(payload.subtotal), { size: 24 })
  drawRow(ctx, cursor, 'IVA (10%)', money(payload.iva), { size: 24 })
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
  drawText(ctx, cursor, 'IVA 10% incluido', { size: 18, align: 'center' })
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
// Cuenta provisional (preview, no payment info)
// =====================================================================
export function renderCuentaProvisional(payload: CuentaProvisionalPayload): ESCPOS {
  const e = new ESCPOS()
  e.init()

  e.align('center').bold(true).size(2, 2)
  e.line('CUENTA')
  e.resetSize().bold(false)

  e.align('left').hr('=')

  e.row(`Mesa: ${payload.table_label}`, `${payload.comensales} pax`)
  e.line(fmtTime(payload.printed_at))
  e.hr('-')

  for (const item of payload.items) {
    const lineTotal = item.price * item.quantity
    const left = `${item.quantity}x ${item.name}`
    const right = money(lineTotal)
    if (left.length + right.length + 1 > LINE_WIDTH) {
      e.line(left)
      e.row('', right)
    } else {
      e.row(left, right)
    }
  }

  e.hr('-')
  e.row('Subtotal:', money(payload.subtotal))
  e.row('IVA (10%):', money(payload.iva))
  e.bold(true).size(1, 2)
  e.row('TOTAL:', money(payload.total))
  e.resetSize().bold(false)

  e.newline()
  e.align('center').line('* No es factura *').align('left')

  e.feed(3).cut()
  return e
}
