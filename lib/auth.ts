import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { Session, Staff, Restaurant } from './types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

export async function createSession(staff: Staff, restaurant: Restaurant, ip?: string): Promise<string> {
  const token = await new SignJWT({ 
    staffId: staff.id, 
    restaurantId: restaurant.id,
    role: staff.role,
    ip: ip || 'unknown',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)
  
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
  
  return token
}

export async function getSessionData(): Promise<{ staffId: string; restaurantId: string; role: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  
  if (!token) return null
  
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as { staffId: string; restaurantId: string; role: string }
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
