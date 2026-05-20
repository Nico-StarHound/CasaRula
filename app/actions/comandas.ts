'use server'

// Comandas order management actions v3
import { createServiceClient } from '@/lib/supabase/service'
import type { Table } from '@/lib/types'
import { enqueuePrintJob, type ComandaTicketItem } from './print-jobs'

interface TableWithOrder extends Table {
  hasOpenOrder: boolean
  orderTotal?: number
  comensales?: number
}

export async function getRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient()
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

  const supabase = createServiceClient()

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

  const supabase = createServiceClient()

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
  opened_at?: string | null
}

export async function getOpenOrder(tableId: string): Promise<Order | null> {
  const supabase = createServiceClient()

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
  const supabase = createServiceClient()
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
  return { success: true }
}

export async function setPedidaCuenta(orderId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('orders')
    .update({ cuenta_pedida: true })
    .eq('id', orderId)
  return { success: true }
}

/**
 * Enqueue a "cuenta provisional" print job — the bill we hand to diners
 * before they pay (informal, no ticket number, no payment info).
 */
export async function printCuentaProvisional(orderId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false }

  // Fetch order + items + table
  const { data: order } = await supabase
    .from('orders')
    .select('id, table_id, comensales, total')
    .eq('id', orderId)
    .single()
  if (!order) return { success: false }

  const { data: items } = await supabase
    .from('order_items')
    .select('name, quantity, price, es_invitacion')
    .eq('order_id', orderId)
    .neq('status', 'cancelled')
    .order('created_at')

  const { data: table } = order.table_id
    ? await supabase.from('tables').select('label').eq('id', order.table_id).single()
    : { data: null }

  const subtotalRaw = (items || [])
    .filter(i => !i.es_invitacion)
    .reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)
  const subtotal = subtotalRaw / 1.10
  const iva = subtotalRaw - subtotal

  await enqueuePrintJob({
    restaurantId,
    kind: 'cuenta_provisional',
    printerType: 'caja',
    orderId,
    payload: {
      table_label: table?.label || 'Mesa',
      comensales: order.comensales || 1,
      items: (items || []).map(i => ({
        name: i.name,
        quantity: i.quantity,
        price: i.es_invitacion ? 0 : Number(i.price),
      })),
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(subtotalRaw * 100) / 100,
      printed_at: new Date().toISOString(),
    },
  })

  return { success: true }
}

export async function updateOrderServiceConfig(
  orderId: string,
  config: {
    nota_mesa?: string
    orden_servicio: OrdenServicio
    rondas?: string[][] | null
  }
): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
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
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  // CONCURRENCY: if the table is ALREADY seated (another waiter beat us
  // to it), don't create a duplicate reservation. Just reuse the existing
  // open order via openOrder() below.
  const { data: existingSeated } = await supabase
    .from('reservations')
    .select('id')
    .eq('table_id', tableId)
    .eq('status', 'seated')
    .eq('date', new Date().toISOString().split('T')[0])
    .limit(1)
    .maybeSingle()

  if (!existingSeated) {
    // Fetch the table label so a walk-in without a name reads as
    // "Walk-in mesa J1" instead of the older confusing "Sin nombre".
    // The label is shown all over the UI (mapa, lista, tickets…), and
    // "Sin nombre" was making it hard to tell two walk-ins apart at a
    // glance during service.
    let walkInLabel = guestName?.trim() || ''
    if (!walkInLabel) {
      const { data: tbl } = await supabase
        .from('tables')
        .select('label')
        .eq('id', tableId)
        .maybeSingle()
      walkInLabel = tbl?.label ? `Walk-in mesa ${tbl.label}` : 'Walk-in'
    }

    // Create a seated reservation so table shows as occupied
    await supabase.from('reservations').insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      guest_name: walkInLabel,
      guest_phone: guestPhone || null,
      party_size: comensales,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      duration_minutes: 90,
      status: 'seated',
      mesa_solicitada: false,
    })
  }

  // Create the order (openOrder() will reuse an existing open one if any)
  const order = await openOrder(tableId, comensales)
  return order
}

export async function openOrder(tableId: string, comensales: number): Promise<Order | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = createServiceClient()

  // CONCURRENCY: if there's already an open order for this table, reuse it
  // (do NOT cancel and recreate — that was destroying in-progress work when
  // two staff members touched the same table in parallel). Only the
  // comensales count may need updating.
  const { data: existing } = await supabase
    .from('orders')
    .select('id, comensales, total, items:order_items(*)')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Update comensales if it changed (e.g. party grew/shrank at the door)
    if (existing.comensales !== comensales) {
      await supabase
        .from('orders')
        .update({ comensales })
        .eq('id', existing.id)
    }
    return {
      id: existing.id,
      table_id: tableId,
      status: 'open',
      comensales,
      total: Number(existing.total) || 0,
      items: (existing.items || []) as unknown as OrderItem[],
    }
  }

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

  const supabase = createServiceClient()

  // Validate that the table actually exists and belongs to this restaurant.
  // Without this, hitting /comandas/tomar/<random-uuid> would silently create
  // a junk order row pointing nowhere.
  const { data: table } = await supabase
    .from('tables')
    .select('id')
    .eq('id', tableId)
    .maybeSingle()
  if (!table) return null

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
  item: { name: string; price: number; quantity: number; notes?: string; printer_target?: string; menu_item_id?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()

  // Resolve printer_target: explicit > inherited from category > 'cocina' default.
  // We always look it up if missing so the UI doesn't have to remember to pass it.
  let printerTarget: string = item.printer_target || ''
  if (!printerTarget && item.menu_item_id) {
    const { data } = await supabase
      .from('menu_items')
      .select('menu_categories(printer_target)')
      .eq('id', item.menu_item_id)
      .single()
    // @ts-expect-error nested select type
    printerTarget = data?.menu_categories?.printer_target || ''
  }
  if (!printerTarget) {
    // Last resort: send to cocina (everything goes there if the menu has no destinos set)
    printerTarget = 'cocina'
  }

  const { error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      menu_item_id: item.menu_item_id || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes || null,
      printer_target: printerTarget,
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
  const supabase = createServiceClient()

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
  const supabase = createServiceClient()
  await supabase.from('orders').update({ comensales }).eq('id', orderId)
  return { success: true }
}

export async function sendToKitchen(orderId: string): Promise<{ success: boolean; cocina: boolean; barra: boolean }> {
  const supabase = createServiceClient()
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
  //
  // If any enqueue fails (Supabase down, network blip, printer not
  // configured for that type) we return success:false so the UI can
  // warn the camarero. The items are already marked in_kitchen in the
  // DB so the KDS will still display them — kitchen staff can still
  // cook — but the camarero needs to know the paper ticket may not
  // have been queued and verbally let the kitchen know.
  let allEnqueued = true
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
      const r = await enqueuePrintJob({
        restaurantId,
        kind: 'comanda_cocina',
        printerType: 'cocina',
        orderId,
        payload: { ...baseMeta, items: buildPayload(cocinaItems) },
      })
      if (!r.success) allEnqueued = false
    }

    if (barraItems.length > 0) {
      const r = await enqueuePrintJob({
        restaurantId,
        kind: 'comanda_barra',
        printerType: 'barra',
        orderId,
        payload: { ...baseMeta, items: buildPayload(barraItems) },
      })
      if (!r.success) allEnqueued = false
    }
  }

  return {
    success: allEnqueued,
    cocina: cocinaItems.length > 0,
    barra: barraItems.length > 0
  }
}

async function recalculateOrderTotal(orderId: string) {
  const supabase = createServiceClient()

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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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
  const supabase = createServiceClient()
  
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

// Revertir un "Listo". Devuelve el item a 'in_kitchen' y opcionalmente
// lo restituye a la cola de preparación con su posición previa. Lo
// usa el botón "Deshacer" del KDS cuando el cocinero se equivoca.
//
// NOTA fiscal: no toca tickets ni order totals — el item sigue
// existiendo en el order, sólo cambia su estado de servicio. Marcar
// listo no genera ningún registro fiscal, así que deshacerlo es
// completamente seguro.
export async function restoreItemToKitchen(
  itemId: string,
  opts?: { restoreToQueueAt?: string; restoreToQueuePosition?: number }
): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('order_items')
    .update({
      status: 'in_kitchen',
      ready_at: null,
      in_prep_queue_at: opts?.restoreToQueueAt ?? null,
      prep_queue_position: opts?.restoreToQueuePosition ?? null,
    })
    .eq('id', itemId)
  return { success: true }
}

// =====================================================================
// Pase / columna "En barra"
// =====================================================================
//
// Items con status='ready' pero todavía no recogidos por el camarero.
// Vienen ordenados por ready_at descendente (los recién marcados
// arriba), que es lo que el camarero quiere ver: lo último que ha
// salido empuja a lo anterior hacia abajo.

export interface PassItem {
  id: string
  name: string
  quantity: number
  ready_at: string | null
  table_label: string | null
}

export async function getPassItems(): Promise<PassItem[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('order_items')
    .select(`
      id, name, quantity, ready_at,
      order:orders!inner (
        restaurant_id,
        table:tables ( label )
      )
    `)
    .eq('status', 'ready')
    .is('picked_from_pass_at', null)
    .order('ready_at', { ascending: false })

  type Row = {
    id: string
    name: string
    quantity: number
    ready_at: string | null
    order: { restaurant_id: string; table: { label: string } | null } | null
  }

  return ((data || []) as unknown as Row[])
    .filter(r => r.order?.restaurant_id === restaurantId)
    .map(r => ({
      id: r.id,
      name: r.name,
      quantity: r.quantity,
      ready_at: r.ready_at,
      table_label: r.order?.table?.label ?? null,
    }))
}

// Marca un item como recogido del pase. status -> 'served',
// picked_from_pass_at = now. Lo dispara el camarero tocando la fila
// en la columna lateral "En barra".
export async function markItemPicked(itemId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('order_items')
    .update({
      status: 'served',
      picked_from_pass_at: new Date().toISOString(),
    })
    .eq('id', itemId)
  return { success: true }
}

// "Limpiar todo" del pase: marca como recogidos TODOS los items que
// ahora mismo están listos esperando. Lo dispara el botón "Limpiar
// todo" de la PassColumn, tras un modal de confirmación. Se hace en
// una sola UPDATE filtrada por estado, no item por item.
export async function markAllPassItemsPicked(): Promise<{ success: boolean; count: number }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: true, count: 0 }

  const supabase = createServiceClient()

  // Necesitamos filtrar por restaurant_id, pero ese campo vive en
  // orders, no en order_items. Buscamos primero los ids candidatos.
  const { data: candidates } = await supabase
    .from('order_items')
    .select('id, order:orders!inner ( restaurant_id )')
    .eq('status', 'ready')
    .is('picked_from_pass_at', null)

  type Row = { id: string; order: { restaurant_id: string } | null }
  const ids = ((candidates || []) as unknown as Row[])
    .filter(r => r.order?.restaurant_id === restaurantId)
    .map(r => r.id)

  if (ids.length === 0) return { success: true, count: 0 }

  await supabase
    .from('order_items')
    .update({
      status: 'served',
      picked_from_pass_at: new Date().toISOString(),
    })
    .in('id', ids)

  return { success: true, count: ids.length }
}

export async function markItemReady(itemId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  // Marca el item como ready y lo saca de la cola de preparación al
  // mismo tiempo. Marcar listo desde la cola O desde la lista
  // izquierda hace exactamente lo mismo (un solo item, un solo
  // estado) — son dos vistas de la misma fila.
  //
  // Buscamos primero el order_id antes de actualizar, porque tras
  // el UPDATE puede no estar fácilmente accesible para el siguiente
  // paso (limpiar reclamada_at del order).
  const { data: row } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('id', itemId)
    .single()

  await supabase
    .from('order_items')
    .update({
      status: 'ready',
      ready_at: new Date().toISOString(),
      in_prep_queue_at: null,
      prep_queue_position: null,
    })
    .eq('id', itemId)

  // Auto-clear de la reclamación: marcar ready CUALQUIER item de la
  // mesa quita el estado reclamada. La idea es que sacar comida =
  // estamos atendiendo el problema, así que el indicador rojo del
  // KDS desaparece. Si la mesa no estaba reclamada, este update es
  // idempotente.
  if (row?.order_id) {
    await supabase
      .from('orders')
      .update({ reclamada_at: null })
      .eq('id', row.order_id)
      .not('reclamada_at', 'is', null)
  }

  return { success: true }
}

export async function markAllItemsReady(orderId: string): Promise<{
  success: boolean
  affected: Array<{ id: string; in_prep_queue_at: string | null; prep_queue_position: number | null }>
}> {
  const supabase = createServiceClient()
  // Snapshot ANTES de actualizar — necesitamos saber qué items
  // estaban en cola y dónde, para poder restituirlos exactamente
  // como estaban si el cocinero hace Deshacer.
  const { data: snapshot } = await supabase
    .from('order_items')
    .select('id, in_prep_queue_at, prep_queue_position')
    .eq('order_id', orderId)
    .eq('status', 'in_kitchen')

  await supabase
    .from('order_items')
    .update({
      status: 'ready',
      ready_at: new Date().toISOString(),
      in_prep_queue_at: null,
      prep_queue_position: null,
    })
    .eq('order_id', orderId)
    .eq('status', 'in_kitchen')

  // Auto-clear de la reclamación tras "Mesa lista".
  await supabase
    .from('orders')
    .update({ reclamada_at: null })
    .eq('id', orderId)
    .not('reclamada_at', 'is', null)

  return { success: true, affected: snapshot || [] }
}

// =====================================================================
// Reclamación de mesa
// =====================================================================
//
// El camarero pulsa "Reclamar mesa" en el sheet de mesa del mapa.
// Setea reclamada_at = now, encola un ticket de aviso en cocina, y
// el KDS sube la mesa al top con pill rojo "ATENCIÓN".
//
// Cooldown de 30s server-side: si se reclama una mesa que ya fue
// reclamada hace <30s, no encolamos otro ticket ni actualizamos el
// timestamp. La mesa sigue marcada. Esto evita spam de impresoras
// cuando un camarero pulsa varias veces por ansiedad.

const RECLAMACION_COOLDOWN_MS = 30_000

export async function reclamarMesa(
  orderId: string
): Promise<{ success: boolean; printed: boolean; reason?: string }> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()

  // Leer estado actual del order + mesa + staff para el payload.
  const { data: order } = await supabase
    .from('orders')
    .select('id, table_id, reclamada_at, staff_id')
    .eq('id', orderId)
    .single()

  if (!order) {
    return { success: false, printed: false, reason: 'Order no encontrado' }
  }

  // Cooldown check. Si ya está reclamada y hace <30s, no-op (silencio).
  if (order.reclamada_at) {
    const last = new Date(order.reclamada_at).getTime()
    const elapsed = Date.now() - last
    if (elapsed < RECLAMACION_COOLDOWN_MS) {
      return { success: true, printed: false, reason: 'cooldown' }
    }
  }

  const now = new Date().toISOString()
  await supabase
    .from('orders')
    .update({ reclamada_at: now })
    .eq('id', orderId)

  // Encolar ticket de aviso en cocina. Si no hay restaurantId
  // (impossible aquí, pero defensivo) saltamos el print.
  if (restaurantId) {
    const { data: table } = await supabase
      .from('tables')
      .select('label')
      .eq('id', order.table_id)
      .single()

    const { data: staff } = order.staff_id
      ? await supabase.from('staff').select('name').eq('id', order.staff_id).single()
      : { data: null }

    await enqueuePrintJob({
      restaurantId,
      kind: 'reclamacion',
      printerType: 'cocina',
      orderId,
      payload: {
        table_label: table?.label || 'Mesa',
        staff_name: staff?.name || null,
        printed_at: now,
      },
    })
  }

  return { success: true, printed: true }
}

// "Visto" desde la card del KDS — limpia el estado sin marcar nada
// listo. Útil cuando el cocinero ve la reclamación, ya está al
// tanto, y quiere quitarse el rojo del KDS pero no tiene aún el
// plato listo.
export async function clearReclamacion(
  orderId: string
): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('orders')
    .update({ reclamada_at: null })
    .eq('id', orderId)
  return { success: true }
}

// =====================================================================
// Cola de preparación
// =====================================================================

// Añade un item a la cola de preparación. Posición = max actual + 1
// (el más recién tocado al final). Si ya estaba en la cola, no hace
// nada — toques repetidos no la desordenan.
export async function addItemToPrepQueue(itemId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('order_items')
    .select('in_prep_queue_at')
    .eq('id', itemId)
    .single()

  if (existing?.in_prep_queue_at) {
    // Ya está en cola — toque repetido, ignoramos.
    return { success: true }
  }

  // Calcular siguiente posición. Usamos DOUBLE para poder insertar
  // entre dos sin renumerar (drag-drop). Nuevo item va al final.
  const { data: maxRow } = await supabase
    .from('order_items')
    .select('prep_queue_position')
    .not('prep_queue_position', 'is', null)
    .order('prep_queue_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPos = (maxRow?.prep_queue_position ?? 0) + 1

  await supabase
    .from('order_items')
    .update({
      in_prep_queue_at: new Date().toISOString(),
      prep_queue_position: nextPos,
    })
    .eq('id', itemId)

  return { success: true }
}

// Quita un item de la cola sin marcarlo listo. Caso: cocinero tocó
// sin querer. No cambia el status (sigue in_kitchen).
export async function removeItemFromPrepQueue(itemId: string): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('order_items')
    .update({
      in_prep_queue_at: null,
      prep_queue_position: null,
    })
    .eq('id', itemId)
  return { success: true }
}

// Reordena la cola. Recibe el array completo de itemIds en el nuevo
// orden y les asigna posiciones 1..N. Es la forma menos error-prone
// de manejar drag-drop: el cliente reorganiza visualmente y manda el
// orden final, en lugar de calcular fracciones en el cliente.
export async function reorderPrepQueue(itemIds: string[]): Promise<{ success: boolean }> {
  if (itemIds.length === 0) return { success: true }
  const supabase = createServiceClient()
  // Postgres no tiene un UPDATE batch elegante para "asigna estos
  // valores a estos ids"; iteramos. Para una cola típica (< 30 items
  // simultáneos) es trivial. Si la cola creciera mucho, se podría
  // construir una sola query con CASE WHEN.
  await Promise.all(
    itemIds.map((id, idx) =>
      supabase
        .from('order_items')
        .update({ prep_queue_position: idx + 1 })
        .eq('id', id)
    )
  )
  return { success: true }
}

export async function updateKdsPosition(itemId: string, position: number): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
  await supabase
    .from('order_items')
    .update({ kds_position: position })
    .eq('id', itemId)
  return { success: true }
}

export async function setOrderUrgente(orderId: string, urgente: boolean): Promise<{ success: boolean }> {
  const supabase = createServiceClient()
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
  // Cola de preparación. Si in_prep_queue_at !== null, el item está
  // activado por el cocinero y debe aparecer en la columna derecha
  // del KDS + resaltado en azul en la izquierda. Ver scripts/007.
  in_prep_queue_at: string | null
  prep_queue_position: number | null
  modifier_summary: { name: string; price: number }[] | null
  order: {
    id: string
    nota_mesa: string | null
    urgente: boolean
    comensales: number
    // Modo y rondas configuradas en la comanda. Permiten al KDS
    // mostrar a qué ronda pertenece cada item (badge "RONDA 1",
    // "RONDA 2"...) y al cocinero seguir el orden que pidió la
    // camarera.
    orden_servicio: OrdenServicio
    rondas: string[][] | null
    // Reclamación de mesa. Si !== null, el camarero la marcó como
    // "necesita atención". Se sube al top del KDS con pill rojo
    // 'ATENCIÓN'. Se limpia al markItemReady de cualquier item de la
    // mesa o manualmente con clearReclamacion.
    reclamada_at: string | null
    table: { id: string; label: string } | null
  } | null
}

export async function getKdsItems(): Promise<KdsItem[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = createServiceClient()

  const { data: items } = await supabase
    .from('order_items')
    .select(`
      id, name, quantity, notes, status,
      sent_at, kds_position, modifier_summary,
      in_prep_queue_at, prep_queue_position,
      order:orders (
        id, nota_mesa, urgente, comensales,
        orden_servicio, rondas, reclamada_at,
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
  const supabase = createServiceClient()

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
