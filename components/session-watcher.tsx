'use client'

import { useEffect } from 'react'

const CHECK_EVERY_MS = 5 * 60 * 1000 // 5 minutes
const CHECK_ON_FOCUS_THROTTLE_MS = 30 * 1000 // also on focus, but max once every 30s

/**
 * Pings /api/auth/session periodically (and on tab focus). If the server
 * says the session is gone, we send the user to /login so they don't try
 * to take a comanda with an expired cookie and get silent failures.
 *
 * Mounted once in the (app) layout so every authenticated page gets it.
 */
export function SessionWatcher() {
  useEffect(() => {
    let lastCheckedAt = Date.now()

    const check = async () => {
      try {
        const res = await fetch('/api/auth/session', { method: 'GET', cache: 'no-store' })
        if (res.status === 401) {
          // Session expired or missing. Send to login but preserve where
          // the user was so they can resume after re-PIN.
          const next = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/login?next=${next}`
        }
      } catch {
        // network down — do nothing, no point bouncing the user offline
      }
    }

    const interval = setInterval(check, CHECK_EVERY_MS)
    const onFocus = () => {
      if (Date.now() - lastCheckedAt < CHECK_ON_FOCUS_THROTTLE_MS) return
      lastCheckedAt = Date.now()
      check()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
