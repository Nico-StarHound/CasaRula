// Ticket renderers — turn a print_job payload into ESC/POS bytes.

import { ESCPOS, LINE_WIDTH } from './escpos.js'

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

function money(n: number): string {
  return n.toFixed(2) + ' €'
}

// =====================================================================
// Comanda (cocina or barra)
// =====================================================================
export function renderComanda(payload: ComandaPayload, kind: 'cocina' | 'barra'): Buffer {
  const e = new ESCPOS()
  e.init()

  // Header — big title with destination
  e.align('center').bold(true).size(2, 2)
  e.line(kind === 'cocina' ? 'COCINA' : 'BARRA')
  e.resetSize().bold(false)

  if (payload.urgente) {
    e.bold(true).size(2, 1).line('*** URGENTE ***').resetSize().bold(false)
  }

  e.align('left')
  e.hr('=')

  // Mesa + comensales (big so cocina sees it from across the room)
  e.bold(true).size(2, 2)
  e.line(`Mesa ${payload.table_label}`)
  e.resetSize().bold(false)
  e.line(`${payload.comensales} pax  ·  ${payload.staff_name || '—'}`)
  e.line(fmtTime(payload.printed_at))

  if (payload.nota_mesa) {
    e.newline()
    e.bold(true).line('Nota mesa:').bold(false)
    e.line(payload.nota_mesa)
  }

  e.hr('=')

  // Items — big so they're readable
  for (const item of payload.items) {
    e.bold(true).size(1, 2)
    e.line(`${item.quantity}x  ${item.name}`)
    e.resetSize().bold(false)

    if (item.modifiers && item.modifiers.length > 0) {
      for (const m of item.modifiers) {
        e.line(`   - ${m.name}`)
      }
    }
    if (item.notes) {
      e.line(`   ! ${item.notes}`)
    }
    e.newline()
  }

  e.hr('-')
  e.feed(2).cut()

  return e.build()
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
