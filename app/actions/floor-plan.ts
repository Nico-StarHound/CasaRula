'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FloorPlan, Table, TableShape, TableZone, Shift } from '@/lib/types'

/**
 * Checks if a reservation time falls within the given shift.
 * Comida: 12:00-16:59, Cena: 17:00-03:59
 */
function checkTimeInShift(time: string, shift: Shift): boolean {
  const hour = parseInt(time.split(':')[0], 10)
  return shift === 'comida' 
    ? (hour >= 12 && hour < 17)
    : (hour >= 17 || hour < 4)
}

async function getRestaurantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function getFloorPlans(): Promise<FloorPlan[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('floor_plans')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })

  return (data || []) as FloorPlan[]
}

export async function getTables(): Promise<Table[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('tables')
    .select('*')
    .is('merged_with', null)
    .order('label', { ascending: true })

  return (data || []) as Table[]
}

export async function getFloorPlanWithTables(floorPlanId: string) {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = await createClient()
  
  const { data: floorPlan } = await supabase
    .from('floor_plans')
    .select('*')
    .eq('id', floorPlanId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!floorPlan) return null

  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('floor_plan_id', floorPlanId)
    .order('created_at', { ascending: true })

  return { floorPlan: floorPlan as FloorPlan, tables: (tables || []) as Table[] }
}

export async function getDefaultFloorPlan() {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = await createClient()
  
  const { data: floorPlan } = await supabase
    .from('floor_plans')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_default', true)
    .single()

  if (!floorPlan) {
    // Fallback to first floor plan
    const { data: firstPlan } = await supabase
      .from('floor_plans')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    
    return firstPlan as FloorPlan | null
  }

  return floorPlan as FloorPlan
}

export async function createFloorPlan(name: string): Promise<{ error?: string; floorPlan?: FloorPlan }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  if (!name) return { error: 'Nombre requerido' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('floor_plans')
    .insert({
      restaurant_id: restaurantId,
      name,
      is_default: false,
    })
    .select()
    .single()

  if (error) return { error: 'Error al crear el plano' }

  revalidatePath('/mapa')
  revalidatePath('/lista')
  return { floorPlan: data as FloorPlan }
}

export async function deleteFloorPlan(floorPlanId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  
  // Delete all tables first (cascade should handle this, but being explicit)
  await supabase
    .from('tables')
    .delete()
    .eq('floor_plan_id', floorPlanId)
  
  const { error } = await supabase
    .from('floor_plans')
    .delete()
    .eq('id', floorPlanId)

  if (error) return { error: 'Error al eliminar el plano' }

  revalidatePath('/mapa')
  revalidatePath('/ajustes')
  return {}
}

export async function createTable(
  floorPlanId: string,
  tableData: {
    label: string
    capacity: number
    shape: TableShape
    zone: TableZone
    x: number
    y: number
    width: number
    height: number
  }
): Promise<{ error?: string; table?: Table }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tables')
    .insert({
      floor_plan_id: floorPlanId,
      ...tableData,
    })
    .select()
    .single()

  if (error) return { error: 'Error al crear la mesa' }

  revalidatePath('/mapa')
  revalidatePath('/lista')
  return { table: data as Table }
}

export async function updateTable(
  tableId: string,
  updates: Partial<Omit<Table, 'id' | 'floor_plan_id' | 'created_at'>>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)

  if (error) return { error: 'Error al actualizar la mesa' }

  revalidatePath('/mapa')
  revalidatePath('/lista')
  return {}
}

export async function deleteTable(tableId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tables')
    .delete()
    .eq('id', tableId)

  if (error) return { error: 'Error al eliminar la mesa' }

  revalidatePath('/mapa')
  revalidatePath('/lista')
  return {}
}

export async function updateTableZonePosition(
  tableId: string,
  zoneX: number,
  zoneY: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tables')
    .update({ zone_x: zoneX, zone_y: zoneY })
    .eq('id', tableId)

  if (error) return { error: 'Error al actualizar posición' }

  revalidatePath('/mapa')
  revalidatePath('/lista')
  return {}
}

export async function getTablesWithStatus(floorPlanId: string, date: string, shift: Shift) {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  
  // Get all tables (exclude merged tables)
  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('floor_plan_id', floorPlanId)
    .is('merged_with', null)

  if (!tables) return []

  // Get today's reservations
  const { data: allReservations } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('date', date)
    .in('status', ['reserved', 'seated'])

  // Get all reservation_tables mappings for today's reservations
  const reservationIds = (allReservations || []).map(r => r.id)
  const { data: reservationTablesData } = await supabase
    .from('reservation_tables')
    .select('reservation_id, table_id')
    .in('reservation_id', reservationIds)

  // Build map: table_id -> reservation_ids
  const tableToReservations: Record<string, string[]> = {}
  for (const rt of reservationTablesData || []) {
    if (!tableToReservations[rt.table_id]) {
      tableToReservations[rt.table_id] = []
    }
    tableToReservations[rt.table_id].push(rt.reservation_id)
  }

  // Filter reservations by shift — but ALWAYS keep 'seated' ones regardless.
  // A seated reservation means people are physically at the table right now,
  // even if their time doesn't fall inside the currently viewed shift (e.g.
  // a walk-in seated at 16:30 while viewing "cena", or a lunch that's
  // running long). Hiding them would paint the table green even though
  // it's occupied.
  const reservations = allReservations?.filter(r => 
    r.status === 'seated' || checkTimeInShift(r.time, shift)
  ) || []

  // Compute status for each table
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  return tables.map(table => {
    // Find ALL reservations for this table via junction table OR legacy table_id
    const junctionReservationIds = tableToReservations[table.id] || []
    const tableReservations = reservations.filter(r => 
      junctionReservationIds.includes(r.id) || r.table_id === table.id
    )
    const isDoblada = tableReservations.length > 1

    if (table.is_blocked) {
      return { 
        ...table, 
        status: 'blocked' as const,
        all_shift_reservations: tableReservations,
        is_doblada: isDoblada
      }
    }
    
    if (tableReservations.length === 0) {
      return { 
        ...table, 
        status: 'available' as const,
        all_shift_reservations: [],
        is_doblada: false
      }
    }

    // Check if any reservation is currently seated
    const seatedReservation = tableReservations.find(r => r.status === 'seated')
    if (seatedReservation) {
      return { 
        ...table, 
        status: 'seated' as const, 
        current_reservation: seatedReservation,
        all_shift_reservations: tableReservations,
        is_doblada: isDoblada
      }
    }

    // Check if there's a current or upcoming reservation in this shift
    const sortedReservations = tableReservations
      .filter(r => r.status === 'reserved')
      .sort((a, b) => a.time.localeCompare(b.time))

    // Find the currently active or next upcoming reservation
    const currentOrNext = sortedReservations.find(r => {
      const endTime = addMinutes(r.time, r.duration_minutes || 90)
      return currentTime <= endTime
    })

    if (currentOrNext) {
      return { 
        ...table, 
        status: 'reserved' as const, 
        current_reservation: currentOrNext,
        all_shift_reservations: tableReservations,
        is_doblada: isDoblada
      }
    }

    // All reservations in this shift are in the past
    return { 
      ...table, 
      status: 'available' as const,
      all_shift_reservations: tableReservations,
      is_doblada: isDoblada
    }
  })
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m + minutes
  const newH = Math.floor(totalMinutes / 60) % 24
  const newM = totalMinutes % 60
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`
}
