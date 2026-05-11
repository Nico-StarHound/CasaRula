import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PinLogin } from '@/components/pin-login'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

async function ensureSeeded() {
  const supabase = await createClient()
  
  // Check if restaurant exists
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
  
  let restaurantId: string | null = null
  
  if (restaurants && restaurants.length > 0) {
    restaurantId = restaurants[0].id
  } else {
    // Create restaurant
    const { data: restaurant } = await supabase
      .from('restaurants')
      .insert({ name: 'Casa Rula' })
      .select()
      .single()
    
    if (restaurant) {
      restaurantId = restaurant.id
      
      // Create default floor plan
      await supabase
        .from('floor_plans')
        .insert({ 
          restaurant_id: restaurant.id, 
          name: 'Planta Principal',
          is_default: true 
        })
    }
  }
  
  if (!restaurantId) return
  
  // Check if any staff exist
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .limit(1)
  
  if (!existingStaff || existingStaff.length === 0) {
    const pinHash = await bcrypt.hash('1551', 10)
    await supabase.from('staff').insert({
      restaurant_id: restaurantId,
      name: 'Nico',
      pin_hash: pinHash,
      role: 'admin',
    })
  }
}

export default async function LoginPage() {
  // Ensure restaurant and admin user exist
  await ensureSeeded()
  
  // If already authenticated, skip login and go to app
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const role = (payload as { role?: string }).role || ''
      redirect(role === 'cocina' ? '/cocina' : '/mapa')
    } catch {
      // Token invalid, show login page
    }
  }

  // Get restaurant name for the login screen
  const supabase = await createClient()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .limit(1)
    .single()

  return <PinLogin restaurantName={restaurant?.name || 'Casa Rula'} />
}
