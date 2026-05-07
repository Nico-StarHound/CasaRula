// Ticket renderers — turn a print_job payload into ESC/POS bytes.

import { ESCPOS, LINE_WIDTH } from './escpos.js'
import { createCanvas, type SKRSContext2D, type Canvas } from '@napi-rs/canvas'
import {
  createTicketCanvas,
  canvasToMonoBitmap,
  drawText,
  drawHr,
  drawWrappedText,
  space,
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
export function renderComanda(payload: ComandaPayload, _kind: 'cocina' | 'barra'): Buffer {
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
  e.rasterImage(bitmap, width, height)
  e.feed(2).cut()
  return e.build()
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
export function renderAnulacion(payload: AnulacionPayload): Buffer {
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

  return e.build()
}

// =====================================================================
// Factura simplificada (ticket)
// =====================================================================
export function renderFactura(payload: FacturaPayload): Buffer {
  const e = new ESCPOS()
  e.init()

  // Header
  e.align('center').bold(true).size(2, 2)
  e.line(payload.restaurant.name)
  e.resetSize().bold(false)

  if (payload.restaurant.nif) e.line(`NIF: ${payload.restaurant.nif}`)
  if (payload.restaurant.direccion) e.line(payload.restaurant.direccion)
  if (payload.restaurant.telefono) e.line(`Tel: ${payload.restaurant.telefono}`)

  e.align('left').hr('=')

  // Ticket meta
  e.row(`Ticket: ${payload.numero}`, fmtTime(payload.printed_at))
  e.row(`Mesa: ${payload.table_label}`, `${payload.comensales} pax`)
  if (payload.staff_name) e.line(`Atiende: ${payload.staff_name}`)

  e.hr('-')

  // Items
  // Format: "qty x name ............. price"
  for (const item of payload.items) {
    const lineTotal = item.price * item.quantity
    const left = `${item.quantity}x ${item.name}`
    const right = money(lineTotal)

    if (left.length + right.length + 1 > LINE_WIDTH) {
      // Name too long — wrap
      e.line(left)
      e.row('', right)
    } else {
      e.row(left, right)
    }
  }

  e.hr('-')

  // Totals
  e.row('Subtotal:', money(payload.subtotal))
  e.row('IVA (10%):', money(payload.iva))
  e.bold(true).size(1, 2)
  e.row('TOTAL:', money(payload.total))
  e.resetSize().bold(false)

  e.newline()
  e.row('Pago:', payload.payment_method.toUpperCase())
  if (payload.efectivo_entregado != null) {
    e.row('Entregado:', money(payload.efectivo_entregado))
  }
  if (payload.cambio != null) {
    e.row('Cambio:', money(payload.cambio))
  }

  if (payload.restaurant.pie_ticket) {
    e.newline()
    e.align('center').line(payload.restaurant.pie_ticket).align('left')
  }

  e.feed(3).cut()

  return e.build()
}

// =====================================================================
// Cuenta provisional (preview, no payment info)
// =====================================================================
export function renderCuentaProvisional(payload: CuentaProvisionalPayload): Buffer {
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
  return e.build()
}
