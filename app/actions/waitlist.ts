'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { WaitlistEntry, WaitlistStatus } from '@/lib/types'

async function getRestaurantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function getWaitlist(): Promise<WaitlistEntry[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('waitlist')
    .select(`
      *,
      guest:guests(*)
    `)
    .eq('restaurant_id', restaurantId)
    .in('status', ['waiting', 'notified'])
    .order('created_at', { ascending: true })

  return (data || []) as WaitlistEntry[]
}

export async function addToWaitlist(formData: FormData): Promise<{ error?: string; entry?: WaitlistEntry }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const guestName = formData.get('guestName') as string
  const guestPhone = formData.get('guestPhone') as string
  const partySize = parseInt(formData.get('partySize') as string) || 2
  const quotedWait = parseInt(formData.get('quotedWait') as string) || null
  const notes = formData.get('notes') as string

  if (!guestName) {
    return { error: 'Nombre es requerido' }
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
    }
  }

  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      restaurant_id: restaurantId,
      guest_id: guestId,
      guest_name: guestName,
      guest_phone: guestPhone || null,
      party_size: partySize,
      quoted_wait_minutes: quotedWait,
      status: 'waiting',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return { error: 'Error al agregar a la lista de espera' }

  revalidatePath('/espera')
  return { entry: data as WaitlistEntry }
}

export async function updateWaitlistStatus(
  id: string, 
  status: WaitlistStatus
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('waitlist')
    .update({ status })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al actualizar el estado' }

  revalidatePath('/espera')
  return {}
}

export async function removeFromWaitlist(id: string): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al eliminar de la lista de espera' }

  revalidatePath('/espera')
  return {}
}

export async function seatFromWaitlist(
  waitlistId: string,
  tableId: string
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = await createClient()

  // Get waitlist entry
  const { data: entry } = await supabase
    .from('waitlist')
    .select('*')
    .eq('id', waitlistId)
    .single()

  if (!entry) return { error: 'Entrada no encontrada' }

  // Create a seated reservation
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  const { error: resError } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      guest_id: entry.guest_id,
      guest_name: entry.guest_name,
      guest_phone: entry.guest_phone,
      party_size: entry.party_size,
      date: today,
      time,
      status: 'seated',
      notes: entry.notes,
    })

  if (resError) return { error: 'Error al crear la reserva' }

  // Update waitlist status
  await supabase
    .from('waitlist')
    .update({ status: 'seated' })
    .eq('id', waitlistId)

  // Update guest visit count
  if (entry.guest_id) {
    const { data: guest } = await supabase
      .from('guests')
      .select('visit_count')
      .eq('id', entry.guest_id)
      .single()
    
    if (guest) {
      await supabase
        .from('guests')
        .update({ visit_count: (guest.visit_count || 0) + 1 })
        .eq('id', entry.guest_id)
    }
  }

  revalidatePath('/espera')
  revalidatePath('/mapa')
  revalidatePath('/reservas')
  return {}
}
