'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Reservation, ReservationStatus } from '@/lib/types'

async function getRestaurantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function getReservations(date: string): Promise<Reservation[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('reservations')
    .select(`
      *,
      table:tables(*),
      guest:guests(*)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('date', date)
    .order('time', { ascending: true })

  return (data || []) as Reservation[]
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('reservations')
    .select(`
      *,
      table:tables(*),
      guest:guests(*)
    `)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!data) return null

  // Fetch table_ids from junction table
  const { data: junctionData } = await supabase
    .from('reservation_tables')
    .select('table_id')
    .eq('reservation_id', id)

  const table_ids = junctionData?.map(r => r.table_id) || (data.table_id ? [data.table_id] : [])

  return { ...data, table_ids } as Reservation
}

// Helper to enrich reservations with table_ids
export async function enrichReservationsWithTableIds(reservations: Reservation[]): Promise<Reservation[]> {
  if (reservations.length === 0) return reservations

  const supabase = await createClient()
  const reservationIds = reservations.map(r => r.id)

  const { data: junctionData } = await supabase
    .from('reservation_tables')
    .select('reservation_id, table_id')
    .in('reservation_id', reservationIds)

  // Group table_ids by reservation_id
  const tableIdsByReservation: Record<string, string[]> = {}
  for (const row of junctionData || []) {
    if (!tableIdsByReservation[row.reservation_id]) {
      tableIdsByReservation[row.reservation_id] = []
    }
    tableIdsByReservation[row.reservation_id].push(row.table_id)
  }

  // Enrich reservations
  return reservations.map(r => ({
    ...r,
    table_ids: tableIdsByReservation[r.id] || (r.table_id ? [r.table_id] : [])
  }))
}

export async function createReservation(formData: FormData): Promise<{ error?: string; reservation?: Reservation }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const guestName = formData.get('guestName') as string
  const guestPhone = formData.get('guestPhone') as string
  const partySize = parseInt(formData.get('partySize') as string) || 2
  const date = formData.get('date') as string
  const time = formData.get('time') as string
  const tableId = formData.get('tableId') as string | null
  const tableIdsRaw = formData.get('tableIds') as string | null
  const tableIds = tableIdsRaw ? tableIdsRaw.split(',').filter(Boolean) : (tableId ? [tableId] : [])
  const notes = formData.get('notes') as string
  const walkIn = formData.get('walkIn') === 'true'
  const mesaSolicitada = formData.get('mesaSolicitada') === 'true'

  if (!guestName || !date || !time) {
    return { error: 'Nombre, fecha y hora son requeridos' }
  }

  const supabase = await createClient()

  // Check if guest exists by phone
  let guestId: string | null = null
  if (guestPhone) {
    const { data: existingGuest } = await supabase
      .from('guests')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('phone', guestPhone)
      .single()

    if (existingGuest) {
      guestId = existingGuest.id
    } else {
      // Create new guest
      const { data: newGuest } = await supabase
        .from('guests')
        .insert({
          restaurant_id: restaurantId,
          name: guestName,
          phone: guestPhone,
          visit_count: 1,
        })
        .select()
        .single()
      
      if (newGuest) {
        guestId = newGuest.id
      }
    }
  }

  const status: ReservationStatus = walkIn ? 'seated' : 'reserved'

  // Use first table as primary (backwards compatibility)
  const primaryTableId = tableIds.length > 0 ? tableIds[0] : null

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurantId,
      table_id: primaryTableId,
      guest_id: guestId,
      guest_name: guestName,
      guest_phone: guestPhone || null,
      party_size: partySize,
      date,
      time,
      status,
      notes: notes || null,
      mesa_solicitada: mesaSolicitada,
    })
    .select()
    .single()

  if (error) return { error: 'Error al crear la reserva' }

  // If multiple tables, insert into junction table
  if (tableIds.length > 0 && data) {
    const junctionRows = tableIds.map(tid => ({
      reservation_id: data.id,
      table_id: tid,
    }))
    await supabase.from('reservation_tables').insert(junctionRows)
  }

  revalidatePath('/lista')
  revalidatePath('/mapa')
  return { reservation: data as Reservation }
}

export async function updateReservation(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const guestName = formData.get('guestName') as string
  const guestPhone = formData.get('guestPhone') as string
  const partySize = parseInt(formData.get('partySize') as string) || 2
  const date = formData.get('date') as string
  const time = formData.get('time') as string
  const notes = formData.get('notes') as string
  const mesaSolicitada = formData.get('mesaSolicitada') === 'true'

  if (!guestName || !date || !time) {
    return { error: 'Nombre, fecha y hora son requeridos' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .update({
      guest_name: guestName,
      guest_phone: guestPhone || null,
      party_size: partySize,
      date,
      time,
      notes: notes || null,
      mesa_solicitada: mesaSolicitada,
    })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al actualizar la reserva' }

  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function updateReservationStatus(
  id: string, 
  status: ReservationStatus
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()

  // If marking as no_show, increment guest's no_show_count
  if (status === 'no_show') {
    const { data: reservation } = await supabase
      .from('reservations')
      .select('guest_id')
      .eq('id', id)
      .single()

    if (reservation?.guest_id) {
      const { data: guest } = await supabase
        .from('guests')
        .select('no_show_count')
        .eq('id', reservation.guest_id)
        .single()

      if (guest) {
        await supabase
          .from('guests')
          .update({ no_show_count: (guest.no_show_count || 0) + 1 })
          .eq('id', reservation.guest_id)
      }
    }
  }

  const { error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al actualizar la reserva' }

  revalidatePath('/lista')
  revalidatePath('/mapa')
  revalidatePath('/clientes')
  return {}
}

export async function changeReservationTable(
  reservationId: string,
  newTableId: string
): Promise<{ error?: string; swapped?: boolean; message?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()

  // Get the reservation being moved
  const { data: movingRes, error: fetchError } = await supabase
    .from('reservations')
    .select('id, table_id, time, status')
    .eq('id', reservationId)
    .single()

  if (!movingRes) return { error: 'Reserva no encontrada' }

  const originalTableId = movingRes.table_id

  // Check if destination table has conflicting reservations (active ones)
  const { data: conflicting, error: conflictError } = await supabase
    .from('reservations')
    .select('id, table_id, time, status, guest_name')
    .eq('table_id', newTableId)
    .eq('restaurant_id', restaurantId)
    .not('status', 'in', '(cancelled,completed,no_show)')
    .neq('id', reservationId)

  let swapped = false
  if (conflicting && conflicting.length > 0) {
    // SWAP: move conflicting reservations to original table
    const conflictingIds = conflicting.map(r => r.id)
    
    // Update conflicting reservations to point to original table
    const { error: swapError } = await supabase
      .from('reservations')
      .update({ table_id: originalTableId })
      .in('id', conflictingIds)

    // Update junction table for conflicting reservations
    for (const cId of conflictingIds) {
      await supabase.from('reservation_tables').delete().eq('reservation_id', cId)
      if (originalTableId) {
        await supabase.from('reservation_tables').insert({ reservation_id: cId, table_id: originalTableId })
      }
    }
    
    swapped = true
  }

  // Move the original reservation to new table
  const { error: moveError } = await supabase
    .from('reservations')
    .update({ table_id: newTableId })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)

  if (moveError) return { error: 'Error al cambiar la mesa' }

  // Update junction table for original reservation
  await supabase.from('reservation_tables').delete().eq('reservation_id', reservationId)
  await supabase.from('reservation_tables').insert({ reservation_id: reservationId, table_id: newTableId })

  revalidatePath('/lista')
  revalidatePath('/mapa')
  
  return { 
    swapped,
    message: swapped 
      ? 'Mesas intercambiadas correctamente'
      : 'Reserva movida a la nueva mesa'
  }
}

export async function changeReservationTables(
  reservationId: string,
  tableIds: string[]
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const primaryTableId = tableIds.length > 0 ? tableIds[0] : null

  // Update primary table_id
  const { error } = await supabase
    .from('reservations')
    .update({ table_id: primaryTableId })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al cambiar las mesas' }

  // Update junction table
  await supabase.from('reservation_tables').delete().eq('reservation_id', reservationId)
  if (tableIds.length > 0) {
    const junctionRows = tableIds.map(tid => ({
      reservation_id: reservationId,
      table_id: tid,
    }))
    await supabase.from('reservation_tables').insert(junctionRows)
  }

  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

export async function deleteReservation(id: string): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al eliminar la reserva' }

  revalidatePath('/lista')
  revalidatePath('/mapa')
  return {}
}

// Waitlist actions
export async function addToWaitlist(data: {
  guest_name: string
  party_size: number
  phone?: string
  notes?: string
  date: string
}): Promise<{ success: boolean; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  const { error } = await supabase.from('reservations').insert({
    restaurant_id: restaurantId,
    guest_name: data.guest_name,
    party_size: data.party_size,
    guest_phone: data.phone || null,
    notes: data.notes || null,
    date: data.date,
    time,
    status: 'confirmed',
    is_waitlist: true,
    table_id: null
  })

  if (error) return { success: false, error: 'Error al añadir a la lista de espera' }

  revalidatePath('/lista')
  return { success: true }
}

export async function assignTableFromWaitlist(
  reservationId: string,
  tableId: string
): Promise<{ success: boolean; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .update({ is_waitlist: false, table_id: tableId })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)

  if (error) return { success: false, error: 'Error al asignar mesa' }

  // Add to junction table
  await supabase.from('reservation_tables').insert({
    reservation_id: reservationId,
    table_id: tableId
  })

  revalidatePath('/lista')
  revalidatePath('/mapa')
  return { success: true }
}

export async function removeFromWaitlist(reservationId: string): Promise<{ success: boolean; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)

  if (error) return { success: false, error: 'Error al eliminar de la lista de espera' }

  revalidatePath('/lista')
  return { success: true }
}
