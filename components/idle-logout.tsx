'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// How long (ms) of complete user inactivity before we logout. 15 minutes
// is a balance between annoying the staff and protecting the device
// when it gets left unattended on a table. We give them 30s of warning
// before actually logging out so they can extend the session.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const WARN_BEFORE_MS = 30 * 1000

// Roles for which auto-logout is enforced. The kitchen screen (cocina)
// is mounted display-on permanently and rarely tapped — we don't want
// to log the cook out mid-service just because nobody touched the
// screen for 15 min. The admin dashboard also stays open on a desk.
// Camarero / caja / reservas are the ones at risk of being left on a
// table or counter unattended.
const ROLES_WITH_IDLE_LOGOUT = ['camarero', 'caja', 'reservas']

interface IdleLogoutProps {
  role: string | null
}

export function IdleLogout({ role }: IdleLogoutProps) {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARN_BEFORE_MS / 1000)
  const lastActivityRef = useRef(Date.now())

  // Bail out for roles where auto-logout would be more annoying than
  // useful. We still attach the listener to update activity so if the
  // role changes later we have fresh data.
  const enabled = role !== null && ROLES_WITH_IDLE_LOGOUT.includes(role)

  useEffect(() => {
    if (!enabled) return

    const resetActivity = () => {
      lastActivityRef.current = Date.now()
      if (warning) setWarning(false)
    }

    // Listen to anything that means the user is using the device.
    // pointerdown covers taps and mouse clicks; keydown for keyboards;
    // touchstart for older Android browsers; visibilitychange so coming
    // back to the tab counts as activity.
    const events = ['pointerdown', 'keydown', 'touchstart', 'visibilitychange']
    events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }))

    const tick = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      const remaining = IDLE_TIMEOUT_MS - idleMs

      if (remaining <= 0) {
        // Logout. We don't call /api/auth/logout here because that
        // would race with the warning state; instead we navigate to a
        // logout endpoint that clears the cookie server-side.
        window.location.href = '/api/auth/logout?reason=idle'
        return
      }
      if (remaining <= WARN_BEFORE_MS) {
        setWarning(true)
        setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)))
      }
    }, 1000)

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity))
      clearInterval(tick)
    }
  }, [enabled, warning])

  if (!enabled || !warning) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-sm w-full p-6 text-center space-y-4">
        <h2 className="text-xl font-semibold">¿Sigues aquí?</h2>
        <p className="text-sm text-muted-foreground">
          La sesión se cerrará en <strong>{secondsLeft}s</strong> por inactividad.
          Toca para continuar.
        </p>
        <div className="flex gap-2 justify-center">
          <Button
            variant="outline"
            onClick={() => { window.location.href = '/api/auth/logout' }}
          >
            Cerrar sesión
          </Button>
          <Button
            onClick={() => {
              lastActivityRef.current = Date.now()
              setWarning(false)
            }}
          >
            Seguir
          </Button>
        </div>
      </div>
    </div>
  )
}
