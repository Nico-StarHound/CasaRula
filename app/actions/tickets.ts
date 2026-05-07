'use server'

import { createClient } from '@/lib/supabase/server'

export interface TicketItem {
  name: string
  quantity: number
  price: number
}

export interface Ticket {
  id: string
  restaurant_id: string
  order_id: string | null
  numero: string
  table_label: string | null
  staff_name: string | null
  comensales: number | null
  items: TicketItem[]
  subtotal: number
  iva: number
  total: number
  payment_method: 'efectivo' | 'tarjeta' | 'mixto' | null
  efectivo_entregado: number | null
  cambio: number | null
  opened_at: string | null
  closed_at: string | null
  created_at: string
}

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
  const supabase = await createClient()
  
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .single()

  if (!restaurant) return null

  const numero = await generateTicketNumber(supabase)
  const total = data.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const subtotal = total / 1.10
  const iva = total - subtotal
  const cambio = data.efectivo_entregado 
    ? data.efectivo_entregado - total 
    : null

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      restaurant_id: restaurant.id,
      order_id: data.order_id,
      numero,
      table_label: data.table_label,
      staff_name: data.staff_name,
      comensales: data.comensales,
      items: data.items,
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
      payment_method: data.payment_method,
      efectivo_entregado: data.efectivo_entregado || null,
      cambio: cambio ? Math.round(cambio * 100) / 100 : null,
      opened_at: data.opened_at,
    })
    .select()
    .single()

  if (error || !ticket) return null

  // Mark order as paid
  await supabase
    .from('orders')
    .update({ status: 'paid', closed_at: new Date().toISOString() })
    .eq('id', data.order_id)

  return {
    ...ticket,
    items: ticket.items as TicketItem[],
    subtotal: Number(ticket.subtotal),
    iva: Number(ticket.iva),
    total: Number(ticket.total),
    efectivo_entregado: ticket.efectivo_entregado ? Number(ticket.efectivo_entregado) : null,
    cambio: ticket.cambio ? Number(ticket.cambio) : null,
  }
}

async function generateTicketNumber(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  
  const { count } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
  
  const date = new Date()
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  
  return `T${yy}${mm}${dd}${String((count || 0) + 1).padStart(3, '0')}`
}

export async function getTickets(
  limit = 50, 
  offset = 0,
  filters?: {
    search?: string
    dateFrom?: string
    dateTo?: string
  }
): Promise<Ticket[]> {
  const supabase = await createClient()
  
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

  const { data } = await query.range(offset, offset + limit - 1)
  
  return (data || []).map(ticket => ({
    ...ticket,
    items: ticket.items as TicketItem[],
    subtotal: Number(ticket.subtotal),
    iva: Number(ticket.iva),
    total: Number(ticket.total),
    efectivo_entregado: ticket.efectivo_entregado ? Number(ticket.efectivo_entregado) : null,
    cambio: ticket.cambio ? Number(ticket.cambio) : null,
  }))
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const supabase = await createClient()
  
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (!ticket) return null

  return {
    ...ticket,
    items: ticket.items as TicketItem[],
    subtotal: Number(ticket.subtotal),
    iva: Number(ticket.iva),
    total: Number(ticket.total),
    efectivo_entregado: ticket.efectivo_entregado ? Number(ticket.efectivo_entregado) : null,
    cambio: ticket.cambio ? Number(ticket.cambio) : null,
  }
}

export async function getTicketsStats(dateFrom?: string, dateTo?: string) {
  const supabase = await createClient()
  
  let query = supabase
    .from('tickets')
    .select('total, payment_method')

  if (dateFrom) {
    query = query.gte('created_at', dateFrom + 'T00:00:00')
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo + 'T23:59:59')
  }

  const { data } = await query

  if (!data) return { total: 0, count: 0, efectivo: 0, tarjeta: 0, mixto: 0 }

  return {
    total: data.reduce((sum, t) => sum + Number(t.total), 0),
    count: data.length,
    efectivo: data.filter(t => t.payment_method === 'efectivo').reduce((sum, t) => sum + Number(t.total), 0),
    tarjeta: data.filter(t => t.payment_method === 'tarjeta').reduce((sum, t) => sum + Number(t.total), 0),
    mixto: data.filter(t => t.payment_method === 'mixto').reduce((sum, t) => sum + Number(t.total), 0),
  }
}

export async function applyRefund(
  ticketId: string,
  importe: number,
  motivo?: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  await supabase
    .from('tickets')
    .update({
      devolucion_aplicada: true,
      devolucion_importe: importe,
      devolucion_motivo: motivo || null,
      devolucion_at: new Date().toISOString()
    })
    .eq('id', ticketId)

  return { success: true }
}

export async function reopenTicket(ticketId: string): Promise<{ 
  success: boolean
  table_id?: string 
}> {
  const supabase = await createClient()
  
  const { data: ticket } = await supabase
    .from('tickets')
    .select('order_id')
    .eq('id', ticketId)
    .single()

  if (!ticket?.order_id) return { success: false }

  // Get the table_id from the order
  const { data: order } = await supabase
    .from('orders')
    .select('table_id')
    .eq('id', ticket.order_id)
    .single()

  // Reopen the order
  await supabase
    .from('orders')
    .update({ status: 'open', closed_at: null })
    .eq('id', ticket.order_id)

  // Mark ticket as reopened
  await supabase
    .from('tickets')
    .update({ reabierto: true })
    .eq('id', ticketId)

  return { success: true, table_id: order?.table_id }
}
