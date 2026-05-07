'use server'

// Comandas order management actions v3
import { createClient } from '@/lib/supabase/server'
import type { Table } from '@/lib/types'
import { enqueuePrintJob, type ComandaTicketItem } from './print-jobs'

interface TableWithOrder extends Table {
  hasOpenOrder: boolean
  orderTotal?: number
  comensales?: number
}

export async function getRestaurantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function getTablesForComandas(): Promise<TableWithOrder[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()

  // Get all tables
  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('label')

  if (!tables) return []

  // Get open orders
  const { data: openOrders } = await supabase
    .from('orders')
    .select('id, table_id, total, comensales')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'open')

  const orderByTable = new Map(
    (openOrders || []).map(o => [o.table_id, o])
  )

  return tables.map(table => ({
    ...table,
    hasOpenOrder: orderByTable.has(table.id),
    orderTotal: orderByTable.get(table.id)?.total || 0,
    comensales: orderByTable.get(table.id)?.comensales || undefined,
  }))
}

export interface ModifierOption {
  id: string
  name: string
  price_delta: number
}

export interface ModifierGroup {
  id: string
  name: string
  required: boolean
  multi_select: boolean
  options: ModifierOption[]
}

export interface MenuItem {
  id: string
  name: string
  price: number
  category_id: string
  is_available: boolean
  modifier_groups: ModifierGroup[]
}

export interface MenuCategory {
  id: string
  name: string
  sort_order: number
  printer_target: 'cocina' | 'barra' | 'caja' | null
  items: MenuItem[]
}

export async function getMenuWithCategories(): Promise<MenuCategory[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()

  // Use 5 separate queries for reliability (nested joins can be flaky)
  const [
    { data: categories },
    { data: items },
    { data: links },
    { data: allGroups },
    { data: allOptions }
  ] = await Promise.all([
    supabase.from('menu_categories')
      .select('id, name, sort_order, printer_target')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
    supabase.from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
      .order('sort_order'),
    supabase.from('menu_item_modifiers')
      .select('menu_item_id, group_id'),
    supabase.from('modifier_groups')
      .select('id, name, required, multi_select')
      .eq('restaurant_id', restaurantId),
    supabase.from('modifier_options')
      .select('id, group_id, name, price_delta')
  ])

  if (!categories) return []

  // Build groups with their options
  const groupsWithOptions: ModifierGroup[] = (allGroups || []).map(g => ({
    id: g.id,
    name: g.name,
    required: g.required,
    multi_select: g.multi_select,
    options: (allOptions || [])
      .filter(o => o.group_id === g.id)
      .map(o => ({ id: o.id, name: o.name, price_delta: o.price_delta }))
  }))

  // Build item -> modifier_groups map
  const modsByItem = new Map<string, ModifierGroup[]>()
  for (const link of links || []) {
    const group = groupsWithOptions.find(g => g.id === link.group_id)
    if (!group) continue
    const existing = modsByItem.get(link.menu_item_id) || []
    existing.push(group)
    modsByItem.set(link.menu_item_id, existing)
  }

  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    sort_order: cat.sort_order,
    printer_target: cat.printer_target,
    items: (items || [])
      .filter(i => i.category_id === cat.id)
      .map(i => ({
        ...i,
        modifier_groups: modsByItem.get(i.id) || []
      }))
  }))
}

export interface OrderItem {
  id: string
  name: string
  price: number
  quantity: number
  status: 'pending' | 'in_kitchen' | 'ready' | 'served' | 'cancelled'
  notes?: string
  modifier_summary?: { name: string; price: number }[]
  printer_target?: string
}

export type OrdenServicio = 'sin_orden' | 'todo_junto' | 'por_rondas' | 'uno_a_uno'

export interface Order {
  id: string
  table_id: string
  status: 'open' | 'closed' | 'paid' | 'cancelled'
  comensales: number
  total: number
  items: OrderItem[]
  cuenta_pedida?: boolean
  nota_mesa?: string | null
  orden_servicio?: OrdenServicio
  rondas?: string[][] | null
}

export async function getOpenOrder(tableId: string): Promise<Order | null> {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .single()

  if (!order) return null

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
    .neq('status', 'cancelled')
    .order('created_at')

  return {
    id: order.id,
    table_id: order.table_id,
    status: order.status,
    comensales: order.comensales || 1,
    total: order.total || 0,
    cuenta_pedida: order.cuenta_pedida || false,
    nota_mesa: order.nota_mesa || null,
    orden_servicio: order.orden_servicio || 'sin_orden',
    rondas: order.rondas || null,
    items: (items || []).map(i => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      quantity: i.quantity,
      status: i.status,
      notes: i.notes,
      modifier_summary: i.modifier_summary || [],
      printer_target: i.printer_target,
    }))
  }
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
  return { success: true }
}

export async function setPedidaCuenta(orderId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('orders')
    .update({ cuenta_pedida: true })
    .eq('id', orderId)
  return { success: true }
}

export async function updateOrderServiceConfig(
  orderId: string,
  config: {
    nota_mesa?: string
    orden_servicio: OrdenServicio
    rondas?: string[][]
  }
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('orders')
    .update({
      nota_mesa: config.nota_mesa || null,
      orden_servicio: config.orden_servicio,
      rondas: config.rondas || null
    })
    .eq('id', orderId)
  return { success: true }
}

export async function seatTableWalkIn(
  tableId: string,
  comensales: number,
  guestName?: string,
  guestPhone?: string
): Promise<Order | null> {
  const supabase = await createClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  // Create a seated reservation so table shows as occupied
  await supabase.from('reservations').insert({
    restaurant_id: restaurantId,
    table_id: tableId,
    guest_name: guestName || 'Sin nombre',
    guest_phone: guestPhone || null,
    party_size: comensales,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    duration_minutes: 90,
    status: 'seated',
    mesa_solicitada: false,
  })

  // Create the order
  const order = await openOrder(tableId, comensales)
  return order
}

export async function openOrder(tableId: string, comensales: number): Promise<Order | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = await createClient()

  // Close any existing open orders for this table (prevents stale order bug)
  await supabase
    .from('orders')
    .update({ 
      status: 'cancelled',
      closed_at: new Date().toISOString()
    })
    .eq('table_id', tableId)
    .eq('status', 'open')

  // Create fresh order
  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      status: 'open',
      comensales,
      total: 0,
    })
    .select()
    .single()

  if (error || !newOrder) return null

  return {
    id: newOrder.id,
    table_id: newOrder.table_id,
    status: newOrder.status,
    comensales: newOrder.comensales || comensales,
    total: 0,
    items: []
  }
}

export async function getOrCreateOrder(tableId: string): Promise<Order | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = await createClient()

  // Check for existing open order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .single()

  let orderId: string

  if (existingOrder) {
    orderId = existingOrder.id
  } else {
    // Create new order
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'open',
        comensales: 1,
        total: 0,
      })
      .select()
      .single()

    if (error || !newOrder) return null
    orderId = newOrder.id
  }

  // Get order with items
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .neq('status', 'cancelled')
    .order('created_at')

  if (!order) return null

  return {
    id: order.id,
    table_id: order.table_id,
    status: order.status,
    comensales: order.comensales || 1,
    total: order.total || 0,
    items: (items || []).map(i => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      quantity: i.quantity,
      status: i.status,
      notes: i.notes,
      modifier_summary: i.modifier_summary || [],
      printer_target: i.printer_target,
    }))
  }
}

export async function addItemToOrder(
  orderId: string,
  item: { name: string; price: number; quantity: number; notes?: string; printer_target?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes || null,
      printer_target: item.printer_target || null,
      status: 'pending',
    })

  if (error) return { success: false, error: error.message }

  // Update order total
  await recalculateOrderTotal(orderId)

  return { success: true }
}

export async function updateOrderItemQuantity(
  itemId: string,
  quantity: number
): Promise<{ success: boolean }> {
  const supabase = await createClient()

  if (quantity <= 0) {
    await supabase.from('order_items').delete().eq('id', itemId)
  } else {
    await supabase
      .from('order_items')
      .update({ quantity })
      .eq('id', itemId)
  }

  // Get order_id to recalculate total
  const { data: item } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('id', itemId)
    .single()

  if (item) {
    await recalculateOrderTotal(item.order_id)
  }

  return { success: true }
}

export async function updateComensales(
  orderId: string,
  comensales: number
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase.from('orders').update({ comensales }).eq('id', orderId)
  return { success: true }
}

export async function sendToKitchen(orderId: string): Promise<{ success: boolean; cocina: boolean; barra: boolean }> {
  const supabase = await createClient()
  const restaurantId = await getRestaurantId()

  // Get pending order items with their printer targets
  const { data: pendingItems } = await supabase
    .from('order_items')
    .select(`
      id,
      name,
      quantity,
      printer_target,
      menu_item_id
    `)
    .eq('order_id', orderId)
    .eq('status', 'pending')

  if (!pendingItems || pendingItems.length === 0) {
    return { success: true, cocina: false, barra: false }
  }

  // Group items by printer_target (default to 'cocina' if null)
  const cocinaItems: typeof pendingItems = []
  const barraItems: typeof pendingItems = []

  for (const item of pendingItems) {
    const target = item.printer_target || 'cocina'
    if (target === 'barra') {
      barraItems.push(item)
    } else {
      cocinaItems.push(item)
    }
  }

  // Mark all pending items as in_kitchen
  await supabase
    .from('order_items')
    .update({ status: 'in_kitchen', sent_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('status', 'pending')

  // Get table + order metadata for the print payload
  const { data: order } = await supabase
    .from('orders')
    .select('table_id, comensales, nota_mesa, urgente, staff_id')
    .eq('id', orderId)
    .single()

  const { data: table } = await supabase
    .from('tables')
    .select('label')
    .eq('id', order?.table_id)
    .single()

  const { data: staff } = order?.staff_id
    ? await supabase.from('staff').select('name').eq('id', order.staff_id).single()
    : { data: null }

  const tableLabel = table?.label || 'Mesa'
  const printedAt = new Date().toISOString()

  // Enqueue print jobs (the daemon picks them up via Realtime).
  // We enqueue ONE job per destination that has items.
  if (restaurantId) {
    const buildPayload = (items: typeof pendingItems): ComandaTicketItem[] =>
      items.map(i => ({
        name: i.name,
        quantity: i.quantity,
        notes: null, // notes/modifiers are on the row, but we keep payload minimal here
      }))

    const baseMeta = {
      table_label: tableLabel,
      staff_name: staff?.name || null,
      comensales: order?.comensales || 1,
      nota_mesa: order?.nota_mesa || null,
      urgente: order?.urgente || false,
      printed_at: printedAt,
    }

    if (cocinaItems.length > 0) {
      await enqueuePrintJob({
        restaurantId,
        kind: 'comanda_cocina',
        printerType: 'cocina',
        orderId,
        payload: { ...baseMeta, items: buildPayload(cocinaItems) },
      })
    }

    if (barraItems.length > 0) {
      await enqueuePrintJob({
        restaurantId,
        kind: 'comanda_barra',
        printerType: 'barra',
        orderId,
        payload: { ...baseMeta, items: buildPayload(barraItems) },
      })
    }
  }

  return { 
    success: true, 
    cocina: cocinaItems.length > 0, 
    barra: barraItems.length > 0 
  }
}

async function recalculateOrderTotal(orderId: string) {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('order_items')
    .select('price, quantity, es_invitacion')
    .eq('order_id', orderId)
    .neq('status', 'cancelled')

  // Exclude invited items from total
  const total = (items || [])
    .filter(i => !i.es_invitacion)
    .reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)

  await supabase.from('orders').update({ total }).eq('id', orderId)
}

export async function cancelOrderItem(
  itemId: string,
  motivo?: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  // Get the item details before updating (need order_id, status, name, qty, target)
  const { data: item } = await supabase
    .from('order_items')
    .select('order_id, name, quantity, status, printer_target')
    .eq('id', itemId)
    .single()

  // Update item status to cancelled
  await supabase
    .from('order_items')
    .update({ 
      status: 'cancelled',
      notes: motivo || null
    })
    .eq('id', itemId)

  if (item) {
    // Recalculate order total
    await recalculateOrderTotal(item.order_id)

    // If item was already sent to kitchen/bar, fire an "anulación" ticket
    // so cocina/barra knows to retire the dish.
    const wasSent = item.status === 'in_kitchen' || item.status === 'ready' || item.status === 'served'
    if (wasSent) {
      const restaurantId = await getRestaurantId()
      const target = (item.printer_target === 'barra' ? 'barra' : 'cocina') as 'cocina' | 'barra'

      // Get table label + staff for context
      const { data: order } = await supabase
        .from('orders')
        .select('table_id, staff_id')
        .eq('id', item.order_id)
        .single()

      const { data: table } = order?.table_id
        ? await supabase.from('tables').select('label').eq('id', order.table_id).single()
        : { data: null }

      const { data: staff } = order?.staff_id
        ? await supabase.from('staff').select('name').eq('id', order.staff_id).single()
        : { data: null }

      if (restaurantId) {
        await enqueuePrintJob({
          restaurantId,
          kind: 'anulacion',
          printerType: target,
          orderId: item.order_id,
          payload: {
            table_label: table?.label || 'Mesa',
            staff_name: staff?.name || null,
            motivo: motivo || null,
            items: [{ name: item.name, quantity: item.quantity }],
            printed_at: new Date().toISOString(),
          },
        })
      }
    }
  }

  return { success: true }
}

export async function updateOrderItemNote(
  itemId: string,
  note: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  await supabase
    .from('order_items')
    .update({ notes: note })
    .eq('id', itemId)
    .eq('status', 'pending') // only pending items

  return { success: true }
}

export async function applyDiscount(
  orderId: string,
  tipo: 'porcentaje' | 'importe',
  valor: number,
  motivo?: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  await supabase
    .from('orders')
    .update({ 
      descuento_tipo: tipo,
      descuento_valor: valor,
      descuento_motivo: motivo || null
    })
    .eq('id', orderId)

  return { success: true }
}

export async function removeDiscount(orderId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  await supabase
    .from('orders')
    .update({ 
      descuento_tipo: null,
      descuento_valor: null,
      descuento_motivo: null
    })
    .eq('id', orderId)

  return { success: true }
}

export async function markAsInvitation(
  itemIds: string[],
  motivo?: string
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  await supabase
    .from('order_items')
    .update({ 
      es_invitacion: true,
      invitacion_motivo: motivo || null
    })
    .in('id', itemIds)

  // Get order_id from first item and recalculate
  const { data: item } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('id', itemIds[0])
    .single()

  if (item) {
    await recalculateOrderTotal(item.order_id)
  }

  return { success: true }
}

export async function removeInvitation(itemId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  const { data: item } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('id', itemId)
    .single()

  await supabase
    .from('order_items')
    .update({ 
      es_invitacion: false,
      invitacion_motivo: null
    })
    .eq('id', itemId)

  if (item) {
    await recalculateOrderTotal(item.order_id)
  }

  return { success: true }
}

export async function releaseTableAfterPayment(tableId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  
  // Find only the most recently seated reservation
  // (not all seated ones — table could be doblada)
  const { data: reservation } = await supabase
    .from('reservations')
    .select('id')
    .eq('table_id', tableId)
    .eq('status', 'seated')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (reservation) {
    await supabase
      .from('reservations')
      .update({ status: 'completed' })
      .eq('id', reservation.id)
  }

  return { success: true }
}

// ========== KDS (Kitchen Display System) ==========

export async function markItemReady(itemId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('order_items')
    .update({ status: 'ready', ready_at: new Date().toISOString() })
    .eq('id', itemId)
  return { success: true }
}

export async function markAllItemsReady(orderId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('order_items')
    .update({ status: 'ready', ready_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('status', 'in_kitchen')
  return { success: true }
}

export async function updateKdsPosition(itemId: string, position: number): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('order_items')
    .update({ kds_position: position })
    .eq('id', itemId)
  return { success: true }
}

export async function setOrderUrgente(orderId: string, urgente: boolean): Promise<{ success: boolean }> {
  const supabase = await createClient()
  await supabase
    .from('orders')
    .update({ urgente })
    .eq('id', orderId)
  return { success: true }
}

export interface KdsItem {
  id: string
  name: string
  quantity: number
  notes: string | null
  status: string
  sent_at: string | null
  kds_position: number
  modifier_summary: { name: string; price: number }[] | null
  order: {
    id: string
    nota_mesa: string | null
    urgente: boolean
    comensales: number
    table: { id: string; label: string } | null
  } | null
}

export async function getKdsItems(): Promise<KdsItem[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  
  const { data: items } = await supabase
    .from('order_items')
    .select(`
      id, name, quantity, notes, status,
      sent_at, kds_position, modifier_summary,
      order:orders (
        id, nota_mesa, urgente, comensales,
        table:tables ( id, label )
      )
    `)
    .eq('status', 'in_kitchen')
    .order('kds_position', { ascending: true })

  return (items || []) as unknown as KdsItem[]
}

export async function getOrderForCaja(tableId: string): Promise<{
  order: Order | null
  table: { label: string; zone: string } | null
  discount: { tipo: string; valor: number; motivo: string | null } | null
} | null> {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, tables(label, zone)')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .single()

  if (!order) return null

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
    .neq('status', 'cancelled')
    .order('created_at')

  return {
    order: {
      id: order.id,
      table_id: order.table_id,
      status: order.status,
      comensales: order.comensales || 1,
      total: order.total || 0,
      items: (items || []).map(i => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity,
        status: i.status,
        notes: i.notes,
        modifier_summary: i.modifier_summary || [],
        printer_target: i.printer_target,
        es_invitacion: i.es_invitacion || false,
        invitacion_motivo: i.invitacion_motivo,
      }))
    },
    table: order.tables ? { label: order.tables.label, zone: order.tables.zone } : null,
    discount: order.descuento_tipo ? {
      tipo: order.descuento_tipo,
      valor: Number(order.descuento_valor),
      motivo: order.descuento_motivo
    } : null
  }
}
