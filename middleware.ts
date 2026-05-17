import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// JWT_SECRET must match what /api/auth/session uses
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

// Role-based access control. Each route prefix lists who can enter it.
// 'any' means any authenticated role.
// The most specific prefix wins, so order matters (longest first).
const ACCESS_RULES: Array<{ prefix: string; allowed: 'any' | string[] }> = [
  // Cocina-only
  { prefix: '/cocina',          allowed: ['cocina', 'admin'] },

  // Admin-only
  { prefix: '/admin',           allowed: ['admin'] },
  { prefix: '/ajustes',         allowed: ['admin'] },
  { prefix: '/dashboard',       allowed: ['admin', 'caja', 'camarero'] },

  // Caja + admin (no analytics, but everything else)
  { prefix: '/tickets',         allowed: ['admin', 'caja', 'camarero'] },

  // Staff (admin, caja, camarero — NOT cocina)
  { prefix: '/comandas',        allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/caja',            allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/mapa',            allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/lista',           allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/reservas',        allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/espera',          allowed: ['admin', 'caja', 'camarero'] },
  { prefix: '/clientes',        allowed: ['admin', 'caja', 'camarero'] },
]

// Where each role goes by default if they hit a forbidden page or root
function homeForRole(role: string): string {
  if (role === 'cocina') return '/cocina'
  return '/mapa'
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Find the most specific rule that matches
  const rule = ACCESS_RULES.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  if (!rule) {
    // Path not protected by RBAC (login, api, static, etc.)
    return NextResponse.next()
  }

  // Read session cookie
  const token = request.cookies.get('session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verify JWT
  let payload: { staffId?: string; restaurantId?: string; role?: string }
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    payload = verified.payload as typeof payload
  } catch {
    // Invalid/expired token → back to login
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('session')
    return res
  }

  const role = payload.role || ''

  // Authorized?
  if (rule.allowed !== 'any' && !rule.allowed.includes(role)) {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  return NextResponse.next()
}

// Limit middleware to relevant paths. We don't want it running on every static asset.
export const config = {
  matcher: [
    '/admin/:path*',
    '/cocina/:path*',
    '/ajustes/:path*',
    '/dashboard/:path*',
    '/tickets/:path*',
    '/comandas/:path*',
    '/caja/:path*',
    '/mapa/:path*',
    '/lista/:path*',
    '/reservas/:path*',
    '/espera/:path*',
    '/clientes/:path*',
  ],
}
