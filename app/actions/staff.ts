'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from './auth'
import { hashPin } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { Staff, StaffRole } from '@/lib/types'

export async function getStaff(): Promise<Staff[]> {
  const session = await getSession()
  if (!session || session.staff.role !== 'dueno') return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('staff')
    .select('id, restaurant_id, name, role, created_at')
    .eq('restaurant_id', session.restaurant.id)
    .order('created_at', { ascending: true })

  return (data || []) as Staff[]
}

export async function createStaff(formData: FormData): Promise<{ error?: string; staff?: Staff }> {
  const session = await getSession()
  if (!session || session.staff.role !== 'dueno') return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const pin = formData.get('pin') as string
  const role = formData.get('role') as StaffRole

  if (!name || !pin || !role) {
    return { error: 'Todos los campos son requeridos' }
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return { error: 'El PIN debe ser de 4 dígitos' }
  }

  const pinHash = await hashPin(pin)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staff')
    .insert({
      restaurant_id: session.restaurant.id,
      name,
      pin_hash: pinHash,
      role,
    })
    .select('id, restaurant_id, name, role, created_at')
    .single()

  if (error) return { error: 'Error al crear el usuario' }

  revalidatePath('/ajustes')
  return { staff: data as Staff }
}

export async function updateStaffPin(
  staffId: string,
  newPin: string
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.staff.role !== 'dueno') return { error: 'No autorizado' }

  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return { error: 'El PIN debe ser de 4 dígitos' }
  }

  const pinHash = await hashPin(newPin)

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff')
    .update({ pin_hash: pinHash })
    .eq('id', staffId)
    .eq('restaurant_id', session.restaurant.id)

  if (error) return { error: 'Error al actualizar el PIN' }

  revalidatePath('/ajustes')
  return {}
}

export async function deleteStaff(staffId: string): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.staff.role !== 'dueno') return { error: 'No autorizado' }

  // Prevent deleting yourself
  if (staffId === session.staff.id) {
    return { error: 'No puedes eliminarte a ti mismo' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', staffId)
    .eq('restaurant_id', session.restaurant.id)

  if (error) return { error: 'Error al eliminar el usuario' }

  revalidatePath('/ajustes')
  return {}
}
