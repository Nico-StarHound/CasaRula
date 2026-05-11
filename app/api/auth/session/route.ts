import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'

export const runtime = 'nodejs'

// Don't import createClient from supabase/server — it uses cookies() which conflicts
// Use a standalone supabase client for this route
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pin } = body

    if (!pin || pin.length !== 4) {
      return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Get restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .select('*')
      .limit(1)
      .single()

    if (restError || !restaurant) {
      return NextResponse.json({ error: 'Restaurante no configurado' }, { status: 400 })
    }

    // Get all staff
    const { data: staffList, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('restaurant_id', restaurant.id)

    if (staffError || !staffList || staffList.length === 0) {
      return NextResponse.json({ error: 'No hay usuarios configurados' }, { status: 400 })
    }

    // Find staff with matching PIN
    for (const staff of staffList) {
      const isValid = await bcrypt.compare(pin, staff.pin_hash)
      if (isValid) {
        const token = await new SignJWT({
          staffId: staff.id,
          restaurantId: restaurant.id,
          role: staff.role,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('24h')
          .sign(JWT_SECRET)

        // Use raw Set-Cookie header — no framework magic
        const response = NextResponse.json({ success: true, role: staff.role })
        response.headers.set(
          'Set-Cookie',
          `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${request.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`
        )

        return response
      }
    }

    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  } catch (err) {
    return NextResponse.json(
      { error: `Error interno: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.headers.set(
    'Set-Cookie',
    'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  )
  return response
}
