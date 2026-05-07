'use server'

import { createClient } from '@/lib/supabase/server'

export interface KitchenItem {
  id: string
  name: string
  quantity: number
  notes?: string
  status: 'in_kitchen' | 'ready'
}

export interface KitchenOrder {
  orderId: string
  tableId: string
  tableLabel: string
  sentAt: string
  items: KitchenItem[]
}

export async function getKitchenOrders(): Promise<KitchenOrder[]> {
  const supabase = await createClient()

  // Get restaurant ID
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()

  if (!restaurant) return []

  // Get all order_items that are in_kitchen or ready, with their orders
  const { data: items } = await supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      name,
      quantity,
      notes,
      status,
      sent_at,
      printer_target,
      orders!inner (
        id,
        table_id,
        status
      )
    `)
    .in('status', ['in_kitchen', 'ready'])
    .eq('printer_target', 'cocina')
    .eq('orders.status', 'open')
    .order('sent_at', { ascending: true })

  if (!items || items.length === 0) return []

  // Get table labels
  const tableIds = [...new Set(items.map((i: any) => i.orders.table_id))]
  const { data: tables } = await supabase
    .from('tables')
    .select('id, label')
    .in('id', tableIds)

  const tableMap = new Map((tables || []).map(t => [t.id, t.label]))

  // Group items by order
  const orderMap = new Map<string, KitchenOrder>()

  for (const item of items as any[]) {
    const orderId = item.order_id
    const tableId = item.orders.table_id

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        orderId,
        tableId,
        tableLabel: tableMap.get(tableId) || 'Mesa',
        sentAt: item.sent_at,
        items: []
      })
    }

    orderMap.get(orderId)!.items.push({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status
    })
  }

  return Array.from(orderMap.values())
}

export async function markItemReady(itemId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()

  // Toggle between in_kitchen and ready
  const { data: item } = await supabase
    .from('order_items')
    .select('status')
    .eq('id', itemId)
    .single()

  const newStatus = item?.status === 'ready' ? 'in_kitchen' : 'ready'

  await supabase
    .from('order_items')
    .update({ 
      status: newStatus,
      ready_at: newStatus === 'ready' ? new Date().toISOString() : null
    })
    .eq('id', itemId)

  return { success: true }
}
