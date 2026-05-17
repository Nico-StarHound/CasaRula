'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { Printer, PrinterType } from '@/lib/types'

async function getRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export async function listPrinters(): Promise<Printer[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('printers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  return (data || []) as Printer[]
}

/**
 * Resolve the active printer for a given type. Returns null if none is
 * configured/enabled — callers can decide whether to fall back to a
 * default or just refuse to enqueue. Used both by the app (to stamp
 * print_jobs.printer_id at enqueue time) and as a safety lookup.
 */
export async function getActivePrinterByType(type: PrinterType): Promise<Printer | null> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('printers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('type', type)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()
  return (data as Printer) || null
}

type PrinterInput = {
  name: string
  type: PrinterType
  ip: string
  port?: number
  enabled?: boolean
}

function validate(input: PrinterInput): string | null {
  if (!input.name?.trim()) return 'El nombre es obligatorio'
  if (!input.ip?.trim()) return 'La IP es obligatoria'
  // Loose IPv4 check — strict enough to catch obvious mistakes, lax enough
  // to allow hostnames if someone uses one.
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const hostname = /^[a-zA-Z0-9.-]+$/
  if (!ipv4.test(input.ip) && !hostname.test(input.ip)) return 'IP/host no válido'
  const port = input.port ?? 9100
  if (port < 1 || port > 65535) return 'Puerto fuera de rango (1–65535)'
  return null
}

export async function createPrinter(input: PrinterInput): Promise<{ error?: string; printer?: Printer }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'Restaurante no configurado' }
  const err = validate(input)
  if (err) return { error: err }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('printers')
    .insert({
      restaurant_id: restaurantId,
      name: input.name.trim(),
      type: input.type,
      ip: input.ip.trim(),
      port: input.port ?? 9100,
      enabled: input.enabled ?? true,
    })
    .select()
    .single()

  if (error) {
    // The unique partial index error message is opaque; translate it.
    if (error.code === '23505') {
      return { error: `Ya hay una impresora activa de tipo "${input.type}". Desactívala primero.` }
    }
    return { error: error.message }
  }
  revalidatePath('/ajustes')
  return { printer: data as Printer }
}

export async function updatePrinter(
  id: string,
  patch: Partial<PrinterInput>
): Promise<{ error?: string }> {
  const supabase = createServiceClient()

  // Validate only the fields being changed
  const validateForUpdate = (): string | null => {
    if (patch.name !== undefined && !patch.name.trim()) return 'El nombre es obligatorio'
    if (patch.ip !== undefined) {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
      const hostname = /^[a-zA-Z0-9.-]+$/
      if (!ipv4.test(patch.ip) && !hostname.test(patch.ip)) return 'IP/host no válido'
    }
    if (patch.port !== undefined && (patch.port < 1 || patch.port > 65535)) {
      return 'Puerto fuera de rango (1–65535)'
    }
    return null
  }
  const err = validateForUpdate()
  if (err) return { error: err }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) updateData.name = patch.name.trim()
  if (patch.type !== undefined) updateData.type = patch.type
  if (patch.ip !== undefined) updateData.ip = patch.ip.trim()
  if (patch.port !== undefined) updateData.port = patch.port
  if (patch.enabled !== undefined) updateData.enabled = patch.enabled

  const { error } = await supabase
    .from('printers')
    .update(updateData)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya hay una impresora activa de ese tipo. Desactívala primero.' }
    }
    return { error: error.message }
  }
  revalidatePath('/ajustes')
  return {}
}

export async function deletePrinter(id: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('printers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/ajustes')
  return {}
}
