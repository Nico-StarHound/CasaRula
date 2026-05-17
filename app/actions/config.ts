'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { RestaurantConfig } from '@/lib/types'

async function getRestaurantId(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('restaurants').select('id').single()
  return data?.id || null
}

export async function getRestaurantConfig(): Promise<RestaurantConfig | null> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return null

  const { data } = await supabase
    .from('restaurant_config')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single()

  return data
}

export async function updateRestaurantConfig(
  config: Partial<Omit<RestaurantConfig, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'No restaurant found' }

  const { data: existing } = await supabase
    .from('restaurant_config')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .single()

  if (existing) {
    // Update existing config
    const { error } = await supabase
      .from('restaurant_config')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) return { success: false, error: error.message }
  } else {
    // Create new config
    const { error } = await supabase
      .from('restaurant_config')
      .insert({
        restaurant_id: restaurantId,
        ...config,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

export async function uploadLogo(base64: string): Promise<{ url?: string; error?: string }> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'No restaurant found' }

  try {
    const filename = `logo-${restaurantId}-${Date.now()}.png`
    
    // Extract base64 data (remove data:image/png;base64, prefix)
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(base64Data, 'base64')

    // Upload to Supabase Storage
    // Note: Create 'logos' bucket in Supabase dashboard with public access
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(filename, buffer, { 
        contentType: 'image/png', 
        upsert: true 
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return { error: uploadError.message }
    }

    const { data: urlData } = supabase.storage
      .from('logos')
      .getPublicUrl(filename)

    // Update restaurant config with logo URL
    await supabase
      .from('restaurant_config')
      .update({ 
        logo_url: urlData.publicUrl, 
        updated_at: new Date().toISOString() 
      })
      .eq('restaurant_id', restaurantId)

    return { url: urlData.publicUrl }
  } catch (err) {
    console.error('Logo upload error:', err)
    return { error: 'Failed to upload logo' }
  }
}

export async function getRestaurantName(): Promise<string> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('restaurants').select('name').single()
  return data?.name || ''
}

export async function updateRestaurantName(name: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'No restaurant found' }

  const { error } = await supabase
    .from('restaurants')
    .update({ name })
    .eq('id', restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
