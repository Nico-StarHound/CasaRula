'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { Table, Reservation, Shift, TableZone, TableStatus } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

/** Shift time check - Comida: 12:00-16:59, Cena: 17:00-03:59 */
function shiftTimeCheck(timeStr: string, targetShift: Shift): boolean {
  const hourNum = parseInt(timeStr.split(':')[0], 10)
  if (targetShift === 'comida') {
    return hourNum >= 12 && hourNum < 17
  }
  return hourNum >= 17 || hourNum < 4
}

async function getRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export interface ListaTableRow {
  table: Table
  status: TableStatus
  currentReservation: Reservation | null
  allShiftReservations: Reservation[]
  isDoblada: boolean
}

export interface ListaData {
  rows: ListaTableRow[]
  groupedByZone: Record<TableZone, ListaTableRow[]>
}

export async function getListaData(date: string, shift: Shift): Promise<ListaData> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { rows: [], groupedByZone: {} as Record<TableZone, ListaTableRow[]> }

  const supabase = createServiceClient()
  
  // Get all tables (exclude merged tables)
  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .is('merged_with', null)
    .order('label', { ascending: true })

  if (!tables) return { rows: [], groupedByZone: {} as Record<TableZone, ListaTableRow[]> }

  // Get all reservations for this date (not cancelled), including guest info for VIP
  const { data: allReservations } = await supabase
    .from('reservations')
    .select('*, guest:guests(id, name, is_vip)')
    .eq('restaurant_id', restaurantId)
    .eq('date', date)
    .neq('status', 'cancelled')
    .order('time', { ascending: true })

  // Get all reservation_tables mappings
  const reservationIds = (allReservations || []).map(r => r.id)
  const { data: reservationTablesData } = await supabase
    .from('reservation_tables')
    .select('reservation_id, table_id')
    .in('reservation_id', reservationIds)

  // Build map: table_id -> reservation_ids
  const tableToReservations: Record<string, string[]> = {}
  // Also build map: reservation_id -> table_ids
  const reservationToTables: Record<string, string[]> = {}
  for (const rt of reservationTablesData || []) {
    if (!tableToReservations[rt.table_id]) {
      tableToReservations[rt.table_id] = []
    }
    tableToReservations[rt.table_id].push(rt.reservation_id)
    if (!reservationToTables[rt.reservation_id]) {
      reservationToTables[rt.reservation_id] = []
    }
    reservationToTables[rt.reservation_id].push(rt.table_id)
  }

  // Filter reservations by shift, exclude waitlist, and enrich with table_ids
  const shiftReservations = (allReservations?.filter(r => 
    shiftTimeCheck(r.time, shift) && !r.is_waitlist
  ) || []).map(r => ({
    ...r,
    table_ids: reservationToTables[r.id] || (r.table_id ? [r.table_id] : [])
  }))

  // Current time for determining status
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  // Build rows
  const rows: ListaTableRow[] = tables.map(table => {
    // Get all reservations for this table via junction OR legacy table_id
    const junctionReservationIds = tableToReservations[table.id] || []
    const tableReservations = shiftReservations.filter(r => 
      junctionReservationIds.includes(r.id) || r.table_id === table.id
    )
    
    // Determine status and current reservation
    let status: TableStatus = 'available'
    let currentReservation: Reservation | null = null

    if (table.is_blocked) {
      status = 'blocked'
    } else {
      // Find seated or active reservation
      const seated = tableReservations.find(r => r.status === 'seated')
      if (seated) {
        status = 'seated'
        currentReservation = seated
      } else {
        // Find reservation that covers current time
        const activeRes = tableReservations.find(r => {
          if (r.status !== 'reserved') return false
          const endTime = addMinutes(r.time, r.duration_minutes)
          return currentTime >= r.time && currentTime <= endTime
        })
        if (activeRes) {
          status = 'reserved'
          currentReservation = activeRes
        } else {
          // Find next upcoming reservation
          const upcoming = tableReservations.find(r => r.status === 'reserved' && r.time > currentTime)
          if (upcoming) {
            status = 'reserved'
            currentReservation = upcoming
          }
        }
      }
    }

    return {
      table,
      status,
      currentReservation,
      allShiftReservations: tableReservations,
      isDoblada: tableReservations.filter(r => r.status === 'reserved' || r.status === 'seated').length > 1,
    }
  })

  // Sort by zone order, then by table label
  rows.sort((a, b) => {
    const zoneA = ZONE_ORDER.indexOf(a.table.zone as TableZone)
    const zoneB = ZONE_ORDER.indexOf(b.table.zone as TableZone)
    if (zoneA !== zoneB) return zoneA - zoneB
    return a.table.label.localeCompare(b.table.label, undefined, { numeric: true })
  })

  // Group by zone
  const groupedByZone = {} as Record<TableZone, ListaTableRow[]>
  for (const zone of ZONE_ORDER) {
    groupedByZone[zone] = rows.filter(r => r.table.zone === zone)
  }

  return { rows, groupedByZone }
}

export async function seatTable(reservationId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'seated' })
    .eq('id', reservationId)

  if (error) return { error: 'Error al sentar' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function markNoShow(reservationId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'no_show' })
    .eq('id', reservationId)

  if (error) return { error: 'Error al marcar no-show' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function cancelReservation(reservationId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)

  if (error) return { error: 'Error al cancelar' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function releaseTable(reservationId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'completed' })
    .eq('id', reservationId)

  if (error) return { error: 'Error al liberar mesa' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function blockTable(tableId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tables')
    .update({ is_blocked: true })
    .eq('id', tableId)

  if (error) return { error: 'Error al bloquear mesa' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function unblockTable(tableId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tables')
    .update({ is_blocked: false })
    .eq('id', tableId)

  if (error) return { error: 'Error al desbloquear mesa' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function createWalkIn(
  tableId: string, 
  partySize: number,
  guestName: string = 'Walk-in'
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = createServiceClient()
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  const { error } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      guest_name: guestName,
      party_size: partySize,
      date,
      time,
      status: 'seated',
      duration_minutes: 90,
    })

  if (error) return { error: 'Error al crear walk-in' }
  
  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m + minutes
  const newH = Math.floor(totalMinutes / 60) % 24
  const newM = totalMinutes % 60
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`
}

export async function getWaitlist(date: string): Promise<Reservation[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('reservations')
    .select('*, guest:guests(id, name, is_vip)')
    .eq('restaurant_id', restaurantId)
    .eq('date', date)
    .eq('is_waitlist', true)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  return (data || []) as Reservation[]
}
