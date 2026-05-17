import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { BottomNav } from '@/components/bottom-nav'
import { SessionWatcher } from '@/components/session-watcher'
import { OfflineBanner } from '@/components/offline-banner'
import { createClient } from '@/lib/supabase/server'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

// Hardcoded restaurant layout matching the physical floor plan
const HARDCODED_TABLES = [
  // Jovino (2 mesas, mergeable)
  { label: 'J1', capacity: 4, zone: 'Jovino', shape: 'square', merge_group: 'jovino' },
  { label: 'J2', capacity: 4, zone: 'Jovino', shape: 'square', merge_group: 'jovino' },
  // Árboles (5 mesas)
  { label: '31', capacity: 4, zone: 'Árboles', shape: 'square' },
  { label: '32', capacity: 4, zone: 'Árboles', shape: 'square' },
  { label: '33', capacity: 4, zone: 'Árboles', shape: 'square' },
  { label: '34', capacity: 4, zone: 'Árboles', shape: 'square' },
  { label: '35', capacity: 4, zone: 'Árboles', shape: 'square' },
  // Porche Nuevo (6 mesas, some mergeable)
  { label: 'Otín', capacity: 6, zone: 'Porche Nuevo', shape: 'rectangular' },
  { label: '42', capacity: 4, zone: 'Porche Nuevo', shape: 'square', merge_group: '42-43' },
  { label: '43', capacity: 4, zone: 'Porche Nuevo', shape: 'square', merge_group: '42-43' },
  { label: '44', capacity: 4, zone: 'Porche Nuevo', shape: 'square', merge_group: '44-45' },
  { label: '45', capacity: 4, zone: 'Porche Nuevo', shape: 'square', merge_group: '44-45' },
  { label: '46', capacity: 4, zone: 'Porche Nuevo', shape: 'square' },
  // Cristal (7 mesas)
  { label: '21', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '22', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '23', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '24', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '25', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '26', capacity: 4, zone: 'Cristal', shape: 'square' },
  { label: '27', capacity: 4, zone: 'Cristal', shape: 'square' },
  // Dentro (5 mesas)
  { label: '11', capacity: 4, zone: 'Dentro', shape: 'square' },
  { label: '12', capacity: 4, zone: 'Dentro', shape: 'square' },
  { label: '13', capacity: 4, zone: 'Dentro', shape: 'square' },
  { label: '14', capacity: 4, zone: 'Dentro', shape: 'square' },
  { label: '15', capacity: 4, zone: 'Dentro', shape: 'square' },
  // Sombrilla (1 mesa)
  { label: 'Som', capacity: 6, zone: 'Sombrilla', shape: 'round' },
] as const

async function ensureRestaurantExists() {
  const supabase = await createClient()
  
  // Check if restaurant exists
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
  
  if (restaurants && restaurants.length > 0) {
    return restaurants[0].id
  }
  
  // Create default restaurant
  const { data: restaurant } = await supabase
    .from('restaurants')
    .insert({ name: 'Mi Restaurante' })
    .select()
    .single()
  
  if (!restaurant) return null
  
  // Create default floor plan
  const { data: floorPlan } = await supabase
    .from('floor_plans')
    .insert({ 
      restaurant_id: restaurant.id, 
      name: 'Planta Principal',
      is_default: true 
    })
    .select()
    .single()
  
  // Create hardcoded tables
  if (floorPlan) {
    const tablesToInsert = HARDCODED_TABLES.map((t, i) => ({
      floor_plan_id: floorPlan.id,
      label: t.label,
      capacity: t.capacity,
      zone: t.zone,
      shape: t.shape,
      merge_group: 'merge_group' in t ? t.merge_group : null,
      x: (i % 4) * 100 + 50,
      y: Math.floor(i / 4) * 100 + 50,
      width: 80,
      height: 80,
    }))
    
    await supabase.from('tables').insert(tablesToInsert)
  }
  
  return restaurant.id
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth check is enforced upstream by middleware.ts (ACCESS_RULES). We
  // intentionally do NOT re-check the JWT here — duplicating the auth
  // gate in two places risks them drifting apart over time. If middleware
  // ever stops matching on this path, the middleware matcher list is the
  // single source of truth to update.

  await ensureRestaurantExists()

  // Read the role from the session cookie so the bottom nav shows the
  // correct tabs per role. The middleware already enforces RBAC on
  // navigation, but the nav needs the role to hide / show items
  // (e.g. Ajustes is owner-only, Tickets is admin/caja).
  const layoutCookieStore = await cookies()
  const layoutToken = layoutCookieStore.get('session')?.value
  let role = ''
  if (layoutToken) {
    try {
      const { payload } = await jwtVerify(layoutToken, JWT_SECRET)
      role = (payload as { role?: string }).role || ''
    } catch {
      // ignore — middleware will have redirected already
    }
  }
  const isOwner = role === 'admin'

  return (
    <div className="h-dvh flex flex-col">
      <SessionWatcher />
      <OfflineBanner />
      <main className="flex-1 overflow-hidden min-h-0">
        {children}
      </main>
      <BottomNav isOwner={isOwner} userRole={role} />
    </div>
  )
}
