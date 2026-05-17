'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { Guest } from '@/lib/types'

async function getRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function getGuests(search?: string): Promise<Guest[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = createServiceClient()
  let query = supabase
    .from('guests')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('visit_count', { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data } = await query.limit(100)
  return (data || []) as Guest[]
}

export async function getGuest(id: string): Promise<Guest | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('guests')
    .select('*')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single()

  return data as Guest | null
}

export async function lookupGuestByPhone(phone: string): Promise<Guest | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('guests')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('phone', phone)
    .single()

  return data as Guest | null
}

export async function searchGuestsByPhone(query: string): Promise<Guest[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  // Strip everything except digits
  const digits = query.replace(/\D/g, '')
  if (digits.length < 3) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('guests')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .ilike('phone', `%${digits}%`)
    .order('visit_count', { ascending: false })
    .limit(5)

  return (data || []) as Guest[]
}

export async function createGuest(formData: FormData): Promise<{ error?: string; guest?: Guest }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const notes = formData.get('notes') as string
  const tagsStr = formData.get('tags') as string

  if (!name) {
    return { error: 'Nombre es requerido' }
  }

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('guests')
    .insert({
      restaurant_id: restaurantId,
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      tags,
      visit_count: 0,
    })
    .select()
    .single()

  if (error) return { error: 'Error al crear el cliente' }

  revalidatePath('/clientes')
  return { guest: data as Guest }
}

export async function updateGuest(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const notes = formData.get('notes') as string
  const tagsStr = formData.get('tags') as string

  if (!name) {
    return { error: 'Nombre es requerido' }
  }

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('guests')
    .update({
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      tags,
    })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al actualizar el cliente' }

  revalidatePath('/clientes')
  return {}
}

export async function deleteGuest(id: string): Promise<{ error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no encontrado' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('guests')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: 'Error al eliminar el cliente' }

  revalidatePath('/clientes')
  return {}
}

export async function toggleVip(guestId: string, isVip: boolean): Promise<{ success: boolean }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false }

  const supabase = createServiceClient()
  await supabase
    .from('guests')
    .update({ is_vip: isVip })
    .eq('id', guestId)
    .eq('restaurant_id', restaurantId)

  revalidatePath('/clientes')
  return { success: true }
}
