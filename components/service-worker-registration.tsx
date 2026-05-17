'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker (public/sw.js) on the client.
 *
 * Chrome's PWA installability heuristic requires:
 *   - manifest.webmanifest with name + icons >=192px + start_url + display
 *   - HTTPS
 *   - a registered service worker with a fetch handler
 *
 * Without the SW, Chrome silently hides the "Install app" / "Add to home
 * screen" menu item. This component is what flips that switch.
 *
 * Mounted once at the root layout so every page registers it.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Register quietly — don't surface errors to the user, this is a
    // best-effort enhancement (PWA install). The app works perfectly
    // without it.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // ignore — could be Safari private mode, dev tooling, etc.
      })
  }, [])

  return null
}
