'use server'

import { createClient } from '@/lib/supabase/server'
import { hashPin, verifyPin, createSession, clearSession, getSessionData } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Restaurant, Staff, Session } from '@/lib/types'

export async function checkSetupRequired(): Promise<boolean> {
  const supabase = await createClient()
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
  
  return !restaurants || restaurants.length === 0
}

export async function setupRestaurant(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const restaurantName = formData.get('restaurantName') as string
  const ownerName = formData.get('ownerName') as string
  const pin = formData.get('pin') as string
  const confirmPin = formData.get('confirmPin') as string

  if (!restaurantName || !ownerName || !pin) {
    return { error: 'Todos los campos son requeridos' }
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return { error: 'El PIN debe ser de 4 dígitos' }
  }

  if (pin !== confirmPin) {
    return { error: 'Los PINs no coinciden' }
  }

  const supabase = await createClient()

  // Check if already setup
  const { data: existingRestaurants } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)

  if (existingRestaurants && existingRestaurants.length > 0) {
    return { error: 'El restaurante ya está configurado' }
  }

  // Create restaurant
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .insert({ name: restaurantName })
    .select()
    .single()

  if (restaurantError || !restaurant) {
    return { error: 'Error al crear el restaurante' }
  }

  // Create default floor plan
  const { data: floorPlan, error: floorPlanError } = await supabase
    .from('floor_plans')
    .insert({ 
      restaurant_id: restaurant.id, 
      name: 'Salón Principal',
      is_default: true 
    })
    .select()
    .single()

  if (floorPlanError) {
    return { error: 'Error al crear el plano' }
  }

  // Hash PIN and create owner
  const pinHash = await hashPin(pin)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      restaurant_id: restaurant.id,
      name: ownerName,
      pin_hash: pinHash,
      role: 'dueno'
    })
    .select()
    .single()

  if (staffError || !staff) {
    return { error: 'Error al crear el usuario' }
  }

  // Create session
  await createSession(staff as Staff, restaurant as Restaurant)
  
  return { success: true }
}

export async function login(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const pin = formData.get('pin') as string

  if (!pin || pin.length !== 4) {
    return { error: 'PIN inválido' }
  }

  const supabase = await createClient()

  // Get restaurant
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .limit(1)
    .single()

  if (!restaurant) {
    return { error: 'Restaurante no configurado' }
  }

  // Get all staff and check PIN
  const { data: staffList } = await supabase
    .from('staff')
    .select('*')
    .eq('restaurant_id', restaurant.id)

  if (!staffList || staffList.length === 0) {
    return { error: 'No hay usuarios configurados' }
  }

  // Find staff with matching PIN
  for (const staff of staffList) {
    const isValid = await verifyPin(pin, staff.pin_hash)
    if (isValid) {
      await createSession(staff as Staff, restaurant as Restaurant)
      return { success: true }
    }
  }

  return { error: 'PIN incorrecto' }
}

export async function logout(): Promise<void> {
  await clearSession()
  redirect('/')
}

export async function getSession(): Promise<Session | null> {
  const sessionData = await getSessionData()
  if (!sessionData) return null

  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('id', sessionData.staffId)
    .single()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', sessionData.restaurantId)
    .single()

  if (!staff || !restaurant) return null

  return { staff: staff as Staff, restaurant: restaurant as Restaurant }
}
