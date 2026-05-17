import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

/**
 * GET /api/auth/logout
 *
 * Clears the session cookie and bounces to /login. Used by the
 * IdleLogout client component, which does `window.location.href = ...`
 * — that's why we expose this as a GET route instead of relying on the
 * existing `logout()` server action (server actions are POST and need
 * a form submission, awkward to call from a setTimeout).
 *
 * The `reason` query param is optional and we surface it on the login
 * screen so staff understand why they got bounced (e.g. "idle").
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  cookieStore.delete('session')

  const reason = request.nextUrl.searchParams.get('reason')
  const loginUrl = new URL('/login', request.url)
  if (reason) loginUrl.searchParams.set('reason', reason)

  return NextResponse.redirect(loginUrl)
}
