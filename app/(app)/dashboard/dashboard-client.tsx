'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DateShiftHeader, getCurrentShift } from '@/components/date-shift-header'
import { Plus, Users, LayoutGrid, Layers, CalendarCheck, Ban, UserX } from 'lucide-react'
import { getDashboardData, type DashboardData } from '@/app/actions/dashboard'
import type { Shift, Reservation } from '@/lib/types'
import { cn } from '@/lib/utils'

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]
}

interface StatCardProps {
  value: number
  label: string
  colorClass: string
}

function StatCard({ value, label, colorClass }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col items-center', colorClass)}>
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  )
}

interface UpcomingRowProps {
  reservation: Reservation
  onClick: () => void
}

function UpcomingRow({ reservation, onClick }: UpcomingRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted/50 transition-colors rounded-lg text-left"
    >
      <div className="flex items-center gap-3">
        <span className="font-medium text-sm w-12">{reservation.time.slice(0, 5)}</span>
        <span className="text-sm">
          {reservation.guest_name}
          <span className="text-muted-foreground ml-1">{reservation.party_size}p</span>
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Mesa {reservation.table_id ? '...' : 'Sin asignar'}
      </span>
    </button>
  )
}

export function DashboardClient() {
  const router = useRouter()
  const [date, setDate] = useState(() => new Date())
  const [shift, setShift] = useState<Shift>('comida') // Default for SSR
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Set correct shift after hydration
  useEffect(() => {
    setShift(getCurrentShift())
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const result = await getDashboardData(formatDateParam(date), shift)
    setData(result)
    setLoading(false)
  }, [date, shift])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleNewReservation = () => {
    router.push(`/reservas/nueva?shift=${shift}`)
  }

  const handleReservationClick = (reservation: Reservation) => {
    router.push(`/reservas/${reservation.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <DateShiftHeader
          date={date}
          onDateChange={setDate}
          shift={shift}
          onShiftChange={setShift}
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4 space-y-6">
          {/* Stat cards 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={data?.reservationCount || 0}
              label="Reservas"
              colorClass="bg-amber-50 dark:bg-amber-950/30"
            />
            <StatCard
              value={data?.dobladaCount || 0}
              label="Dobladas"
              colorClass="bg-orange-50 dark:bg-orange-950/30"
            />
            <StatCard
              value={data?.totalPax || 0}
              label="PAX total"
              colorClass="bg-green-50 dark:bg-green-950/30"
            />
            <StatCard
              value={data?.freeTableCount || 0}
              label="Mesas libres"
              colorClass="bg-emerald-50 dark:bg-emerald-950/30"
            />
          </div>

          {/* Nueva Reserva button */}
          <Button 
            size="lg" 
            className="w-full text-base"
            onClick={handleNewReservation}
          >
            <Plus className="h-5 w-5 mr-2" />
            Nueva Reserva
          </Button>

          {/* Upcoming reservations */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Próximas reservas</h2>
            <div className="rounded-xl border bg-card">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Cargando...
                </div>
              ) : data?.upcomingReservations && data.upcomingReservations.length > 0 ? (
                <div className="divide-y">
                  {data.upcomingReservations.map((res) => (
                    <UpcomingRow
                      key={res.id}
                      reservation={res}
                      onClick={() => handleReservationClick(res)}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay más reservas en este turno
                </div>
              )}
            </div>
          </div>

          {/* Day summary */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Resumen del día</h2>
            <div className="rounded-xl border bg-card p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CalendarCheck className="h-4 w-4" />
                    <span className="font-semibold">{data?.completedCount || 0}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Completadas</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-red-600">
                    <UserX className="h-4 w-4" />
                    <span className="font-semibold">{data?.noShowCount || 0}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">No-shows</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Ban className="h-4 w-4" />
                    <span className="font-semibold">{data?.cancelledCount || 0}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Canceladas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
