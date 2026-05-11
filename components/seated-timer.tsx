'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SeatedTimerProps {
  /** ISO timestamp when the table was seated (typically order.opened_at) */
  startedAt: string | null | undefined
  /** Optional className for the wrapper */
  className?: string
}

/**
 * Live timer showing how long a table has been seated.
 * Updates every 30s (we don't need second-level precision for a restaurant).
 * Color shifts to amber after 1h30m and red after 2h30m so staff notice
 * tables that have been sitting too long.
 */
export function SeatedTimer({ startedAt, className }: SeatedTimerProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    // Tick every 30s — table timings don't need seconds.
    const interval = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [startedAt])

  if (!startedAt) return null

  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const elapsedMin = Math.max(0, Math.floor((now - start) / 60000))

  const hours = Math.floor(elapsedMin / 60)
  const minutes = elapsedMin % 60
  const label = hours > 0
    ? `${hours}h ${minutes.toString().padStart(2, '0')}m`
    : `${minutes}m`

  // Color thresholds: green < 1h30m, amber 1h30m-2h30m, red > 2h30m
  const color =
    elapsedMin >= 150 ? 'text-red-600 dark:text-red-400'
    : elapsedMin >= 90  ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground'

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color, className)}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
  )
}
