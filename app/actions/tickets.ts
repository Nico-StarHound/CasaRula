'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { enqueuePrintJob } from './print-jobs'

// =====================================================================
// Modelo fiscal
// =====================================================================
//
// Tres tipos de documento, persistidos en la misma tabla `tickets`:
//   - 'S' simplificada — el ticket normal
//   - 'F' completa     — con datos de cliente (NIF, razón social, dir)
//   - 'R' rectificativa — anula al 100% un ticket previo (S o F)
//
// Numeración: serie + YY + MM + correlativo 5 dígitos. Reset mensual
// por (restaurant, serie). Ejemplo: S2605 00007.
//
// Una vez emitido un ticket, NO se puede modificar ni borrar (es
// inmutable por ley). Para "deshacer" un cobro se emite una R contra
// el ticket original. Si después se quiere cobrar correctamente, se
// emite un nuevo S/F separado.
// =====================================================================

export type Serie = 'S' | 'F' | 'R'

export interface TicketItem {
  name: string
  quantity: number
  price: number
}

export interface ClienteFiscal {
  nif: string
  nombre: string
  direccion: string
}

export interface Ticket {
  id: string
  restaurant_id: string
  order_id: string | null
  // Numeración fiscal
  serie: Serie
  year: number
  month: number
  correlativo: number
  numero: string
  // Datos generales
  table_label: string | null
  staff_name: string | null
  comensales: number | null
  items: TicketItem[]
  subtotal: number
  iva: number
  total: number
  // Pago (null en rectificativas)
  payment_method: 'efectivo' | 'tarjeta' | 'mixto' | null
  efectivo_entregado: number | null
  cambio: number | null
  // Datos cliente (solo serie F)
  cliente_nif: string | null
  cliente_nombre: string | null
  cliente_direccion: string | null
  // Rectificativa
  rectifica_ticket_id: string | null
  motivo_rectificativa: string | null
  // Fechas
  opened_at: string | null
  closed_at: string | null
  created_at: string
}

// Helper: formatea el número fiscal completo a partir de las partes.
function formatNumero(serie: Serie, year: number, month: number, correlativo: number): string {
  const yy = String(year).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const corr = String(correlativo).padStart(5, '0')
  return `${serie}${yy}${mm}${corr}`
}

// Helper: pide el siguiente correlativo a la BD. Usa la RPC
// next_correlativo() que toma un advisory lock para evitar races.
async function nextCorrelativo(
  supabase: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  serie: Serie,
  year: number,
  month: number
): Promise<number> {
  const { data, error } = await supabase.rpc('next_correlativo', {
    p_restaurant_id: restaurantId,
    p_serie: serie,
    p_year: year,
    p_month: month,
  })
  if (error || data == null) {
    throw new Error(`next_correlativo failed: ${error?.message || 'no data'}`)
  }
  return data as number
}

// Helper: lee el restaurant_id activo. Lanzamos en lugar de devolver
// null para que los callers no tengan que comprobarlo cada vez —
// emitir un ticket sin restaurante es un error de sistema, no un
// estado legítimo.
async function requireRestaurantId(
  supabase: ReturnType<typeof createServiceClient>
): Promise<string> {
  const { data } = await supabase.from('restaurants').select('id').single()
  if (!data) throw new Error('No hay restaurante configurado')
  return data.id
}

// Helper: lee la config + nombre del restaurante para incluirlos en el
// ticket impreso. Cache local por llamada — el caller decide.
async function loadPrintHeader(
  supabase: ReturnType<typeof createServiceClient>,
  restaurantId: string
) {
  const [{ data: config }, { data: restaurantRow }] = await Promise.all([
    supabase
      .from('restaurant_config')
      .select('titular, nif, direccion, codigo_postal, ciudad, telefono, pie_ticket')
      .eq('restaurant_id', restaurantId)
      .single(),
    supabase.from('restaurants').select('name').eq('id', restaurantId).single(),
  ])
  return {
    name: restaurantRow?.name || 'Casa Rula',
    nif: config?.nif || null,
    direccion: config
      ? [config.direccion, config.codigo_postal, config.ciudad].filter(Boolean).join(', ')
      : null,
    telefono: config?.telefono || null,
    pie_ticket: config?.pie_ticket || null,
  }
}

// =====================================================================
// EMITIR — el caso normal: cobro de una mesa abierta
// =====================================================================
export async function emitirTicket(args: {
  order_id: string
  serie: 'S' | 'F'           // sólo S o F en emisión normal; R va aparte
  table_label: string
  staff_name: string
  comensales: number
  items: TicketItem[]
  payment_method: 'efectivo' | 'tarjeta' | 'mixto'
  efectivo_entregado?: number
  opened_at?: string
  cliente?: ClienteFiscal | null   // obligatorio si serie === 'F'
}): Promise<Ticket | null> {
  const supabase = createServiceClient()

  if (args.serie === 'F' && !args.cliente) {
    throw new Error('Factura completa requiere datos de cliente (NIF, nombre, dirección)')
  }

  const restaurantId = await requireRestaurantId(supabase)

  // Calcular números fiscales
  const total = args.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const subtotal = total / 1.10
  const iva = total - subtotal
  const cambio = args.efectivo_entregado != null
    ? args.efectivo_entregado - total
    : null

  // Numeración
  const now = new Date()
  const year = now.getFullYear() % 100
  const month = now.getMonth() + 1
  const correlativo = await nextCorrelativo(supabase, restaurantId, args.serie, year, month)
  const numero = formatNumero(args.serie, year, month, correlativo)

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      restaurant_id: restaurantId,
      order_id: args.order_id,
      serie: args.serie,
      year,
      month,
      correlativo,
      numero,
      table_label: args.table_label,
      staff_name: args.staff_name,
      comensales: args.comensales,
      items: args.items,
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
      payment_method: args.payment_method,
      efectivo_entregado: args.efectivo_entregado ?? null,
      cambio: cambio != null ? Math.round(cambio * 100) / 100 : null,
      cliente_nif: args.cliente?.nif ?? null,
      cliente_nombre: args.cliente?.nombre ?? null,
      cliente_direccion: args.cliente?.direccion ?? null,
      opened_at: args.opened_at,
    })
    .select()
    .single()

  if (error || !ticket) {
    console.error('[emitirTicket] insert failed:', error)
    return null
  }

  // Mark order as paid
  await supabase
    .from('orders')
    .update({ status: 'paid', closed_at: new Date().toISOString() })
    .eq('id', args.order_id)

  // Encolar impresión del ticket fiscal
  const header = await loadPrintHeader(supabase, restaurantId)
  await enqueuePrintJob({
    restaurantId,
    kind: 'factura',
    printerType: 'caja',
    orderId: args.order_id,
    ticketId: ticket.id,
    payload: {
      numero: ticket.numero,
      serie: ticket.serie,
      table_label: args.table_label,
      staff_name: args.staff_name,
      comensales: args.comensales,
      items: args.items,
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
      payment_method: args.payment_method,
      efectivo_entregado: args.efectivo_entregado ?? null,
      cambio: cambio != null ? Math.round(cambio * 100) / 100 : null,
      cliente: args.cliente ?? null,
      printed_at: new Date().toISOString(),
      restaurant: header,
    },
  })

  return parseTicket(ticket)
}

// Alias retrocompatible con la API vieja. Algunos callers (caja page,
// printers/tickets, etc.) llaman a createTicket — los migramos a
// emitirTicket en el siguiente paso. Mientras tanto, esto sigue
// funcionando y siempre emite simplificada.
export async function createTicket(data: {
  order_id: string
  table_label: string
  staff_name: string
  comensales: number
  items: TicketItem[]
  payment_method: 'efectivo' | 'tarjeta' | 'mixto'
  efectivo_entregado?: number
  opened_at?: string
}): Promise<Ticket | null> {
  return emitirTicket({ ...data, serie: 'S' })
}

// =====================================================================
// RECTIFICAR — anulación total de un ticket existente
// =====================================================================
//
// Emite una R con importes negativos referenciando al ticket original.
// No toca el ticket original (es inmutable). El saldo neto de la pareja
// es 0. Si se quiere cobrar correctamente después, hay que emitir un
// nuevo ticket con emitirTicket().
//
// Reglas:
//   - No se puede rectificar una rectificativa.
//   - No se puede rectificar un ticket ya rectificado (sería doble
//     anulación, contablemente inválido).
// =====================================================================
export async function rectificarTicket(
  ticketOriginalId: string,
  motivo: string
): Promise<{ success: boolean; ticket?: Ticket; error?: string }> {
  const supabase = createServiceClient()
  const restaurantId = await requireRestaurantId(supabase)

  const { data: original } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketOriginalId)
    .single()

  if (!original) return { success: false, error: 'Ticket no encontrado' }
  if (original.serie === 'R') return { success: false, error: 'No se puede rectificar una rectificativa' }

  // ¿Ya estaba rectificado?
  const { count: prevRectificativas } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('rectifica_ticket_id', ticketOriginalId)
  if ((prevRectificativas ?? 0) > 0) {
    return { success: false, error: 'Este ticket ya tiene una rectificativa emitida' }
  }

  const now = new Date()
  const year = now.getFullYear() % 100
  const month = now.getMonth() + 1
  const correlativo = await nextCorrelativo(supabase, restaurantId, 'R', year, month)
  const numero = formatNumero('R', year, month, correlativo)

  // Items con cantidad NEGATIVA. Importes negativos para que el saldo
  // contable cuadre. Esto es la representación estándar de una factura
  // rectificativa por anulación total.
  const negItems: TicketItem[] = (original.items as TicketItem[]).map(it => ({
    ...it,
    quantity: -Math.abs(it.quantity),
  }))

  const { data: rectif, error } = await supabase
    .from('tickets')
    .insert({
      restaurant_id: restaurantId,
      order_id: original.order_id,
      serie: 'R',
      year,
      month,
      correlativo,
      numero,
      table_label: original.table_label,
      staff_name: original.staff_name,
      comensales: original.comensales,
      items: negItems,
      subtotal: -Number(original.subtotal),
      iva: -Number(original.iva),
      total: -Number(original.total),
      payment_method: null,
      efectivo_entregado: null,
      cambio: null,
      cliente_nif: original.cliente_nif,
      cliente_nombre: original.cliente_nombre,
      cliente_direccion: original.cliente_direccion,
      rectifica_ticket_id: original.id,
      motivo_rectificativa: motivo,
    })
    .select()
    .single()

  if (error || !rectif) {
    console.error('[rectificarTicket] insert failed:', error)
    return { success: false, error: error?.message || 'No se pudo emitir la rectificativa' }
  }

  // Encolar impresión
  const header = await loadPrintHeader(supabase, restaurantId)
  await enqueuePrintJob({
    restaurantId,
    kind: 'rectificativa',
    printerType: 'caja',
    orderId: original.order_id,
    ticketId: rectif.id,
    payload: {
      numero: rectif.numero,
      original_numero: original.numero,
      table_label: original.table_label,
      staff_name: original.staff_name,
      comensales: original.comensales,
      items: negItems,
      subtotal: -Number(original.subtotal),
      iva: -Number(original.iva),
      total: -Number(original.total),
      motivo,
      cliente: original.cliente_nif
        ? {
            nif: original.cliente_nif,
            nombre: original.cliente_nombre,
            direccion: original.cliente_direccion,
          }
        : null,
      printed_at: new Date().toISOString(),
      restaurant: header,
    },
  })

  return { success: true, ticket: parseTicket(rectif) }
}

// =====================================================================
// CONVERTIR A COMPLETA — cliente vuelve pidiendo factura con NIF
// =====================================================================
//
// Caso: ya existe un ticket S (o F) cobrado. El cliente vuelve pidiendo
// factura con sus datos fiscales. Hacemos en una sola operación:
//   1. Emitir R rectificando el ticket original (al 100%, anulación)
//   2. Emitir F nueva con los mismos items + datos cliente
// Resultado contable: saldo 0 (R cancela el original) + F nueva que
// es el justificante fiscal real del cliente.
//
// La función fuerza serie='F' en la emisión final. El total cobrado no
// cambia (sigue siendo lo que pagó el cliente).
// =====================================================================
export async function convertirAFactura(
  ticketOriginalId: string,
  cliente: ClienteFiscal
): Promise<{ success: boolean; rectificativa?: Ticket; completa?: Ticket; error?: string }> {
  const supabase = createServiceClient()

  const { data: original } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketOriginalId)
    .single()

  if (!original) return { success: false, error: 'Ticket no encontrado' }
  if (original.serie === 'R') {
    return { success: false, error: 'No se puede convertir una rectificativa' }
  }
  if (original.serie === 'F') {
    return { success: false, error: 'Este ticket ya es factura completa' }
  }

  // 1. Rectificar el original
  const rect = await rectificarTicket(ticketOriginalId, 'Conversión a factura completa')
  if (!rect.success) return { success: false, error: rect.error }

  // 2. Emitir F con los mismos items y mismo método de pago
  const items = original.items as TicketItem[]
  const completa = await emitirTicket({
    order_id: original.order_id,
    serie: 'F',
    table_label: original.table_label,
    staff_name: original.staff_name,
    comensales: original.comensales,
    items,
    payment_method: original.payment_method,
    efectivo_entregado: original.efectivo_entregado ?? undefined,
    opened_at: original.opened_at,
    cliente,
  })

  if (!completa) {
    return {
      success: false,
      error: 'Rectificativa emitida pero falló la factura completa. Reintenta desde tickets.',
      rectificativa: rect.ticket,
    }
  }

  return { success: true, rectificativa: rect.ticket, completa }
}

// =====================================================================
// LECTURA
// =====================================================================

export async function getTickets(
  limit = 50,
  offset = 0,
  filters?: {
    search?: string
    dateFrom?: string
    dateTo?: string
    serie?: Serie
  }
): Promise<Ticket[]> {
  const supabase = createServiceClient()

  let query = supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.search) {
    query = query.or(`numero.ilike.%${filters.search}%,table_label.ilike.%${filters.search}%`)
  }
  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
  }
  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo + 'T23:59:59')
  }
  if (filters?.serie) {
    query = query.eq('serie', filters.serie)
  }

  const { data } = await query.range(offset, offset + limit - 1)
  return (data || []).map(parseTicket)
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const supabase = createServiceClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()
  if (!ticket) return null
  return parseTicket(ticket)
}

export async function getTicketsStats(dateFrom?: string, dateTo?: string) {
  const supabase = createServiceClient()
  let query = supabase
    .from('tickets')
    .select('total, payment_method, serie')
  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00')
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

  const { data } = await query

  if (!data) return { total: 0, count: 0, efectivo: 0, tarjeta: 0, mixto: 0 }

  // Stats de facturación: sumamos S y F (cobros reales). Las R restan
  // automáticamente por tener `total` negativo, así que el saldo neto
  // queda bien aunque las metamos en la suma sin filtrar.
  return {
    total: data.reduce((sum, t) => sum + Number(t.total), 0),
    count: data.filter(t => t.serie !== 'R').length,
    efectivo: data.filter(t => t.payment_method === 'efectivo').reduce((sum, t) => sum + Number(t.total), 0),
    tarjeta: data.filter(t => t.payment_method === 'tarjeta').reduce((sum, t) => sum + Number(t.total), 0),
    mixto: data.filter(t => t.payment_method === 'mixto').reduce((sum, t) => sum + Number(t.total), 0),
  }
}

// =====================================================================
// LEGACY — devoluciones y reapertura
// =====================================================================
//
// Las dejo por retrocompatibilidad con el panel /tickets existente,
// pero el flujo correcto a partir de ahora es rectificarTicket(). En
// una sesión futura migraremos los botones de "devolución" a R.
// =====================================================================

export async function applyRefund(
  ticketId: string,
  importe: number,
  motivo?: string
): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('tickets')
    .update({
      devolucion_aplicada: true,
      devolucion_importe: importe,
      devolucion_motivo: motivo || null,
      devolucion_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
  return { success: true }
}

export async function reopenTicket(ticketId: string): Promise<{
  success: boolean
  table_id?: string
}> {
  const supabase = createServiceClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('order_id')
    .eq('id', ticketId)
    .single()
  if (!ticket?.order_id) return { success: false }
  const { data: order } = await supabase
    .from('orders')
    .select('table_id')
    .eq('id', ticket.order_id)
    .single()
  await supabase
    .from('orders')
    .update({ status: 'open', closed_at: null })
    .eq('id', ticket.order_id)
  await supabase
    .from('tickets')
    .update({ reabierto: true })
    .eq('id', ticketId)
  return { success: true, table_id: order?.table_id }
}

// =====================================================================
// PARSER — convierte el row de Supabase al tipo TS estricto
// =====================================================================
function parseTicket(t: Record<string, unknown>): Ticket {
  return {
    id: t.id as string,
    restaurant_id: t.restaurant_id as string,
    order_id: (t.order_id as string | null) ?? null,
    serie: t.serie as Serie,
    year: t.year as number,
    month: t.month as number,
    correlativo: t.correlativo as number,
    numero: t.numero as string,
    table_label: (t.table_label as string | null) ?? null,
    staff_name: (t.staff_name as string | null) ?? null,
    comensales: (t.comensales as number | null) ?? null,
    items: t.items as TicketItem[],
    subtotal: Number(t.subtotal),
    iva: Number(t.iva),
    total: Number(t.total),
    payment_method: (t.payment_method as Ticket['payment_method']) ?? null,
    efectivo_entregado: t.efectivo_entregado != null ? Number(t.efectivo_entregado) : null,
    cambio: t.cambio != null ? Number(t.cambio) : null,
    cliente_nif: (t.cliente_nif as string | null) ?? null,
    cliente_nombre: (t.cliente_nombre as string | null) ?? null,
    cliente_direccion: (t.cliente_direccion as string | null) ?? null,
    rectifica_ticket_id: (t.rectifica_ticket_id as string | null) ?? null,
    motivo_rectificativa: (t.motivo_rectificativa as string | null) ?? null,
    opened_at: (t.opened_at as string | null) ?? null,
    closed_at: (t.closed_at as string | null) ?? null,
    created_at: t.created_at as string,
  }
}

// =====================================================================
// REIMPRIMIR — vuelve a encolar un ticket ya emitido
// =====================================================================
//
// Útil cuando el cliente perdió el papel, o cuando hubo un atasco en
// la térmica y la cajera quiere reintentar. No emite ticket nuevo (no
// hay coste fiscal), solo encola el mismo payload original al daemon.
//
// Se respeta el tipo original: una rectificativa se reimprime como
// rectificativa, una completa como completa, etc.
// =====================================================================
export async function reimprimirTicket(
  ticketId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { success: false, error: 'Ticket no encontrado' }

  const restaurantId = ticket.restaurant_id
  const header = await loadPrintHeader(supabase, restaurantId)

  // Choose the right print kind based on serie.
  const kind = ticket.serie === 'R' ? 'rectificativa' : 'factura'

  // Build payload from the ticket row (mirror of emitirTicket/rectificar).
  const items = ticket.items as TicketItem[]
  const cliente = ticket.cliente_nif
    ? {
        nif: ticket.cliente_nif,
        nombre: ticket.cliente_nombre,
        direccion: ticket.cliente_direccion,
      }
    : null

  let payload: Record<string, unknown>
  if (ticket.serie === 'R') {
    // Need the original ticket's numero to label "Rectifica:".
    const { data: original } = ticket.rectifica_ticket_id
      ? await supabase
          .from('tickets')
          .select('numero')
          .eq('id', ticket.rectifica_ticket_id)
          .single()
      : { data: null }
    payload = {
      numero: ticket.numero,
      original_numero: original?.numero || '?',
      table_label: ticket.table_label,
      staff_name: ticket.staff_name,
      comensales: ticket.comensales,
      items,
      subtotal: Number(ticket.subtotal),
      iva: Number(ticket.iva),
      total: Number(ticket.total),
      motivo: ticket.motivo_rectificativa || '',
      cliente,
      printed_at: new Date().toISOString(),
      restaurant: header,
    }
  } else {
    payload = {
      numero: ticket.numero,
      serie: ticket.serie,
      table_label: ticket.table_label,
      staff_name: ticket.staff_name,
      comensales: ticket.comensales,
      items,
      subtotal: Number(ticket.subtotal),
      iva: Number(ticket.iva),
      total: Number(ticket.total),
      payment_method: ticket.payment_method,
      efectivo_entregado: ticket.efectivo_entregado != null
        ? Number(ticket.efectivo_entregado) : null,
      cambio: ticket.cambio != null ? Number(ticket.cambio) : null,
      cliente,
      printed_at: new Date().toISOString(),
      restaurant: header,
    }
  }

  await enqueuePrintJob({
    restaurantId,
    kind,
    printerType: 'caja',
    orderId: ticket.order_id,
    ticketId: ticket.id,
    payload,
  })

  return { success: true }
}
