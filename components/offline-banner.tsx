'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Persistent banner shown when the browser loses network connectivity.
 * Slides in from the top, doesn't dismiss automatically — only disappears
 * when the network is back. This is critical for restaurant staff: silently
 * lost orders are far worse than an annoying banner.
 *
 * Mounted once at the layout level so it covers every authenticated page.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // navigator.onLine is unreliable as a positive signal but reliable
    // as a negative one — if it says false, we really are offline.
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-md">
      <WifiOff className="h-4 w-4" />
      Sin conexión — los cambios no se están guardando
    </div>
  )
}
