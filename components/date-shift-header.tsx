'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { ShiftTabs, getCurrentShift } from '@/components/shift-tabs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { es } from 'date-fns/locale'
import type { Shift } from '@/lib/types'

interface DateShiftHeaderProps {
  date: Date
  onDateChange: (date: Date) => void
  shift: Shift
  onShiftChange: (shift: Shift) => void
  showShiftTabs?: boolean
}

function formatDisplayDate(date: Date, compact: boolean): string {
  if (compact) {
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function DateShiftHeader({ 
  date, 
  onDateChange, 
  shift, 
  onShiftChange,
  showShiftTabs = true
}: DateShiftHeaderProps) {
  const isMobile = useIsMobile()
  const [calendarOpen, setCalendarOpen] = useState(false)

  const handlePrevDay = () => {
    onDateChange(new Date(date.getTime() - 86400000))
  }

  const handleNextDay = () => {
    onDateChange(new Date(date.getTime() + 86400000))
  }

  const handleSelectDate = (newDate: Date | undefined) => {
    if (newDate) {
      onDateChange(newDate)
      setCalendarOpen(false)
    }
  }

  const calendarContent = (
    <Calendar
      mode="single"
      selected={date}
      onSelect={handleSelectDate}
      locale={es}
      initialFocus
    />
  )

  const dateButton = (
    <button 
      className="text-sm font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors min-w-[90px] text-center"
    >
      {formatDisplayDate(date, isMobile)}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Date Row */}
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {isMobile ? (
          <Drawer open={calendarOpen} onOpenChange={setCalendarOpen}>
            <DrawerTrigger asChild>
              {dateButton}
            </DrawerTrigger>
            <DrawerContent>
              <div className="p-4 pb-8 flex justify-center">
                {calendarContent}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              {dateButton}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              {calendarContent}
            </PopoverContent>
          </Popover>
        )}
        
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextDay}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Shift Tabs Row */}
      {showShiftTabs && (
        <ShiftTabs value={shift} onChange={onShiftChange} className="w-full" />
      )}
    </div>
  )
}

export { getCurrentShift }
