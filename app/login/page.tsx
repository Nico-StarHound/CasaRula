import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PinLogin } from '@/components/pin-login'

export const runtime = 'nodejs'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
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

  // Translate the optional ?reason= query (set by /api/auth/logout) into
  // a human-readable banner so the user knows why they're back here.
  const { reason } = await searchParams
  const infoMessage =
    reason === 'idle'
      ? 'Sesión cerrada por inactividad. Vuelve a introducir tu PIN.'
      : null

  // Get restaurant name for the login screen.
  // NOTE: in earlier development we auto-seeded a restaurant + admin user
  // (PIN 1551) on the login page so we could iterate fast. That code was
  // removed before production because it (a) hardcoded a publicly-known
  // PIN, and (b) recreated state we don't want recreated by accident.
  // Initial setup is now done by running scripts/001_create_tables.sql
  // and using the /admin endpoint with a properly chosen admin PIN.
  const supabase = await createClient()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .limit(1)
    .single()

  return <PinLogin restaurantName={restaurant?.name || 'Casa Rula'} infoMessage={infoMessage} />
}
