'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Shift, TableZone, Reservation } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

interface Table {
  id: string
  label: string
  zone: TableZone
}

interface TimelineViewProps {
  reservations: Reservation[]
  tables: Table[]
  turno: Shift
  selectedDate: Date
  waitlist?: Reservation[]
}

const SHIFT_CONFIG = {
  comida: { startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
  cena: { startHour: 20, startMinute: 30, endHour: 24, endMinute: 30 },
}

const STATUS_COLORS: Record<string, { bg: string; border: string; opacity?: string; textColor?: string; lineThrough?: boolean }> = {
  confirmed: { bg: 'bg-amber-100', border: 'border-amber-300', textColor: 'text-amber-800' },
  pending: { bg: 'bg-amber-100', border: 'border-amber-300', textColor: 'text-amber-800' },
  reserved: { bg: 'bg-amber-100', border: 'border-amber-300', textColor: 'text-amber-800' },
  late: { bg: 'bg-red-100', border: 'border-red-300', textColor: 'text-red-700' },
  seated: { bg: 'bg-blue-100', border: 'border-blue-300', textColor: 'text-blue-800' },
  completed: { bg: 'bg-gray-100', border: 'border-gray-200', opacity: 'opacity-60', textColor: 'text-gray-500' },
  no_show: { bg: 'bg-red-100', border: 'border-red-300', opacity: 'opacity-50', textColor: 'text-red-400', lineThrough: true },
  cancelled: { bg: 'bg-gray-50', border: 'border-gray-200', opacity: 'opacity-30', textColor: 'text-gray-400', lineThrough: true },
}

// Late detection helper
const isLate = (time: string, status: string, selectedDate: Date) => {
  const today = new Date()
  const isToday = selectedDate.toISOString().split('T')[0] === today.toISOString().split('T')[0]
  if (!isToday) return false
  if (status !== 'reserved') return false
  const [h, m] = time.split(':').map(Number)
  const resMinutes = h * 60 + m
  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  return nowMinutes > resMinutes + 5
}

function timeToMinutes(time: string, startHour: number, startMinute: number): number {
  const [h, m] = time.split(':').map(Number)
  // Handle times after midnight for cena shift
  const adjustedHour = h < startHour ? h + 24 : h
  return (adjustedHour - startHour) * 60 + (m - startMinute)
}

function generateTimeSlots(shift: Shift): string[] {
  const config = SHIFT_CONFIG[shift]
  const slots: string[] = []
  let hour = config.startHour
  let minute = config.startMinute

  while (hour < config.endHour || (hour === config.endHour && minute <= config.endMinute)) {
    const displayHour = hour >= 24 ? hour - 24 : hour
    slots.push(`${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)
    minute += 30
    if (minute >= 60) {
      minute = 0
      hour += 1
    }
  }
  return slots
}

export function TimelineView({ reservations, tables, turno, selectedDate, waitlist = [] }: TimelineViewProps) {
  const config = SHIFT_CONFIG[turno]
  const totalMinutes = 240 // 4 hours
  const timeSlots = useMemo(() => generateTimeSlots(turno), [turno])

  // Group tables by zone
  const tablesByZone = useMemo(() => {
    const grouped: Record<TableZone, Table[]> = {} as Record<TableZone, Table[]>
    for (const zone of ZONE_ORDER) {
      grouped[zone] = tables.filter(t => t.zone === zone)
    }
    return grouped
  }, [tables])

  // Map reservations to tables
  const reservationsByTable = useMemo(() => {
    const map = new Map<string, Reservation[]>()
    for (const res of reservations) {
      // Handle linked tables
      const tableIds = res.table_ids || (res.table_id ? [res.table_id] : [])
      for (const tableId of tableIds) {
        const existing = map.get(tableId) || []
        existing.push(res)
        map.set(tableId, existing)
      }
    }
    return map
  }, [reservations])

  // Check if we should show current time indicator
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    )
  }, [selectedDate])

  const currentTimePosition = useMemo(() => {
    if (!isToday) return null
    const now = new Date()
    const currentMinutes = timeToMinutes(
      `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      config.startHour,
      config.startMinute
    )
    if (currentMinutes < 0 || currentMinutes > totalMinutes) return null
    return (currentMinutes / totalMinutes) * 100
  }, [isToday, config.startHour, config.startMinute, totalMinutes])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b">
        <h2 className="text-sm font-medium text-muted-foreground">Timeline</h2>
      </div>

      {/* Timeline Grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-[800px]">
          {/* Fixed left column: Zone/Table labels */}
          <div className="w-[100px] flex-shrink-0 border-r bg-background sticky left-0 z-10">
            {/* Empty header cell */}
            <div className="h-10 border-b" />
            
            {ZONE_ORDER.map((zone) => {
              const zoneTables = tablesByZone[zone]
              if (!zoneTables || zoneTables.length === 0) return null
              
              return (
                <div key={zone}>
                  {/* Zone label */}
                  <div className="h-6 px-2 flex items-center bg-muted/50 border-b">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                      {zone}
                    </span>
                  </div>
                  {/* Table rows */}
                  {zoneTables.map((table) => (
                    <div
                      key={table.id}
                      className="h-12 px-2 flex items-center border-b"
                    >
                      <span className="text-sm font-medium">{table.label}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            
            {/* Waitlist label row */}
            {waitlist.length > 0 && (
              <div className="border-t-2 border-dashed border-gray-300">
                <div className="h-6 px-2 flex items-center bg-muted/50 border-b">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Espera
                  </span>
                </div>
                <div className="h-12 px-2 flex items-center border-b">
                  <span className="text-sm text-muted-foreground">{waitlist.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable right area: Time grid + reservation blocks */}
          <div className="flex-1 relative">
            {/* Time header */}
            <div className="h-10 flex border-b sticky top-0 bg-background z-10">
              {timeSlots.map((slot, i) => (
                <div
                  key={slot}
                  className="flex-1 min-w-[60px] border-r border-gray-100 flex items-center justify-center"
                >
                  <span className="text-xs text-muted-foreground">{slot}</span>
                </div>
              ))}
            </div>

            {/* Grid rows */}
            <div className="relative">
              {/* Vertical grid lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {timeSlots.map((slot) => (
                  <div key={slot} className="flex-1 min-w-[60px] border-r border-gray-100" />
                ))}
              </div>

              {/* Current time indicator */}
              {currentTimePosition !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${currentTimePosition}%` }}
                />
              )}

              {/* Zone/Table rows with reservations */}
              {ZONE_ORDER.map((zone) => {
                const zoneTables = tablesByZone[zone]
                if (!zoneTables || zoneTables.length === 0) return null

                return (
                  <div key={zone}>
                    {/* Zone spacer row */}
                    <div className="h-6 bg-muted/50 border-b" />
                    
                    {/* Table rows */}
                    {zoneTables.map((table) => {
                      const tableReservations = reservationsByTable.get(table.id) || []
                      
                      return (
                        <div key={table.id} className="h-12 relative border-b">
                          {/* Reservation blocks */}
                          {tableReservations.map((res) => {
                            const startMinutes = timeToMinutes(
                              res.time,
                              config.startHour,
                              config.startMinute
                            )
                            const duration = res.duration_minutes || 90
                            const left = Math.max(0, (startMinutes / totalMinutes) * 100)
                            const width = Math.min(
                              (duration / totalMinutes) * 100,
                              100 - left
                            )

                            // Skip if reservation is outside visible range
                            if (startMinutes + duration < 0 || startMinutes > totalMinutes) {
                              return null
                            }

                            // Check if late (only for pending statuses)
                            const resIsLate = isLate(res.time, res.status, selectedDate)
                            const isNoShow = res.status === 'no_show'
                            const colorKey = isNoShow ? 'no_show' : resIsLate ? 'late' : res.status
                            const colors = STATUS_COLORS[colorKey] || STATUS_COLORS.reserved

                            return (
                              <div
                                key={res.id}
                                className={cn(
                                  'absolute top-1 bottom-1 rounded border text-xs flex items-center px-1.5 overflow-hidden',
                                  colors.bg,
                                  colors.border,
                                  colors.opacity,
                                  colors.textColor
                                )}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  minWidth: '40px',
                                }}
                                title={`${res.guest_name} · ${res.party_size}p · ${res.time}${isNoShow ? ' (NO-SHOW)' : resIsLate ? ' (TARDE)' : ''}`}
                              >
                                <span className={cn(
                                  "truncate font-medium flex items-center gap-1",
                                  colors.lineThrough && "line-through"
                                )}>
                                  {isNoShow && <span>👻</span>}
                                  {resIsLate && !isNoShow && <span>⚠️</span>}
                                  {res.guest?.is_vip && <span>⭐</span>}
                                  {res.guest_name} · {res.party_size}p
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Waitlist row at bottom */}
              {waitlist.length > 0 && (
                <div className="border-t-2 border-dashed border-gray-300">
                  {/* Waitlist label spacer */}
                  <div className="h-6 bg-muted/50 border-b" />
                  {/* Waitlist chips row */}
                  <div className="h-12 flex items-center gap-2 px-2 flex-wrap">
                    {waitlist
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((r, index) => (
                        <div 
                          key={r.id} 
                          className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-1 text-xs font-medium text-gray-700 flex items-center gap-1"
                        >
                          <span className="text-gray-400">{index + 1}.</span>
                          {r.guest_name} · {r.party_size}p
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
