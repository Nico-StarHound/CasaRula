'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { Reservation, Shift } from '@/lib/types'

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

export interface DashboardData {
  reservationCount: number
  dobladaCount: number
  totalPax: number
  freeTableCount: number
  totalTableCount: number
  upcomingReservations: Reservation[]
  completedCount: number
  noShowCount: number
  cancelledCount: number
}

export async function getDashboardData(date: string, shift: Shift): Promise<DashboardData> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) {
    return {
      reservationCount: 0,
      dobladaCount: 0,
      totalPax: 0,
      freeTableCount: 0,
      totalTableCount: 0,
      upcomingReservations: [],
      completedCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
    }
  }

  const supabase = createServiceClient()

  // 1. Fetch all tables (exclude merged)
  const { data: tables } = await supabase
    .from('tables')
    .select('id')
    .is('merged_with', null)

  const totalTableCount = tables?.length || 0

  // 2. Fetch all reservations for date
  const { data: allReservations } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('date', date)
    .order('time', { ascending: true })

  // 3. Get reservation_tables mappings for today
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

  // 4. Filter by shift for active stats
  const shiftReservations = (allReservations || []).filter(r => shiftTimeCheck(r.time, shift))
  const activeShiftReservations = shiftReservations.filter(r => r.status === 'reserved' || r.status === 'seated')

  // Count reservations
  const reservationCount = activeShiftReservations.length

  // Total PAX
  const totalPax = activeShiftReservations.reduce((sum, r) => sum + (r.party_size || 0), 0)

  // Count dobladas (tables with 2+ active reservations in shift)
  let dobladaCount = 0
  const occupiedTableIds = new Set<string>()

  for (const res of activeShiftReservations) {
    // Check junction table first
    const tableIds = reservationTablesData
      ?.filter(rt => rt.reservation_id === res.id)
      .map(rt => rt.table_id) || []
    
    // Fall back to legacy table_id
    if (tableIds.length === 0 && res.table_id) {
      tableIds.push(res.table_id)
    }

    for (const tid of tableIds) {
      occupiedTableIds.add(tid)
    }
  }

  // Count dobladas by checking each table
  for (const tableId of occupiedTableIds) {
    const junctionResIds = tableToReservations[tableId] || []
    const tableActiveRes = activeShiftReservations.filter(r => 
      junctionResIds.includes(r.id) || r.table_id === tableId
    )
    if (tableActiveRes.length >= 2) {
      dobladaCount++
    }
  }

  // Free tables
  const freeTableCount = totalTableCount - occupiedTableIds.size

  // 5. Get next 5 upcoming reservations (time > now, status = 'reserved')
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  
  const upcomingReservations = shiftReservations
    .filter(r => r.status === 'reserved' && r.time > currentTime)
    .slice(0, 5) as Reservation[]

  // 6. Day summary counts (all shifts, for the whole day)
  const completedCount = (allReservations || []).filter(r => r.status === 'completed').length
  const noShowCount = (allReservations || []).filter(r => r.status === 'no_show').length
  const cancelledCount = (allReservations || []).filter(r => r.status === 'cancelled').length

  return {
    reservationCount,
    dobladaCount,
    totalPax,
    freeTableCount,
    totalTableCount,
    upcomingReservations,
    completedCount,
    noShowCount,
    cancelledCount,
  }
}
