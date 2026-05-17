import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { hashPin } from '@/lib/auth'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { restaurantName, ownerName, pin } = body
  
  if (!restaurantName || !ownerName || !pin) {
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
  }
  
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos' }, { status: 400 })
  }
  
  const supabase = createServiceClient()
  
  // Check if restaurant already exists
  const { data: existingRestaurant } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
    
  if (existingRestaurant) {
    return NextResponse.json({ error: 'El restaurante ya está configurado' }, { status: 400 })
  }
  
  // Create restaurant
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .insert({ name: restaurantName })
    .select()
    .single()
    
  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: 'Error al crear el restaurante' }, { status: 500 })
  }
  
  // Create owner staff
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
    // Rollback restaurant creation
    await supabase.from('restaurants').delete().eq('id', restaurant.id)
    return NextResponse.json({ error: 'Error al crear el usuario' }, { status: 500 })
  }
  
  // Create default floor plan
  await supabase
    .from('floor_plans')
    .insert({
      restaurant_id: restaurant.id,
      name: 'Principal',
      is_default: true
    })
  
  // Create session token
  const token = await new SignJWT({ 
    staffId: staff.id, 
    restaurantId: restaurant.id,
    role: staff.role 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)
  
  // Use cookies() from next/headers for reliable cookie setting
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  
  return NextResponse.json({ success: true })
}
