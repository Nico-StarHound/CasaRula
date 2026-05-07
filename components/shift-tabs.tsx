'use client'

import { cn } from '@/lib/utils'
import type { Shift } from '@/lib/types'
import { SHIFT_CONFIG } from '@/lib/types'

// Helper function for client-side use
export function getCurrentShift(): Shift {
  const now = new Date()
  const hours = now.getHours()
  return hours < 17 ? 'comida' : 'cena'
}

interface ShiftTabsProps {
  value: Shift
  onChange: (shift: Shift) => void
  className?: string
}

export function ShiftTabs({ value, onChange, className }: ShiftTabsProps) {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted p-0.5', className)} suppressHydrationWarning>
      {(['comida', 'cena'] as const).map((shiftOption) => (
        <button
          key={shiftOption}
          type="button"
          onClick={() => onChange(shiftOption)}
          suppressHydrationWarning
          className={cn(
            'flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all',
            value === shiftOption
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {SHIFT_CONFIG[shiftOption].label}
        </button>
      ))}
    </div>
  )
}
