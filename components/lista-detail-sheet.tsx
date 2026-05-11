'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Ban } from 'lucide-react'
import { seatTable, markNoShow, cancelReservation, releaseTable, blockTable, unblockTable } from '@/app/actions/lista'
import { changeReservationTable } from '@/app/actions/reservations'
import { toggleVip } from '@/app/actions/guests'
import { getTables } from '@/app/actions/floor-plan'
import { cn } from '@/lib/utils'
import type { Table, Reservation, TableStatus, Shift, TableZone } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

interface ListaDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table | null
  status: TableStatus
  currentReservation: Reservation | null
  allShiftReservations: Reservation[]
  shift: Shift
  selectedDate: Date
  onRefresh: () => void
}

const STATUS_LABELS: Record<string, string> = {
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No-show',
}

export function ListaDetailSheet({
  open,
  onOpenChange,
  table,
  status,
  currentReservation,
  allShiftReservations,
  shift,
  selectedDate,
  onRefresh,
}: ListaDetailSheetProps) {
  const formatDateStr = (d: Date) => d.toISOString().split('T')[0]
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<'detail' | 'cambiar-mesa'>('detail')
  const [allTables, setAllTables] = useState<Table[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [allReservationsForDate, setAllReservationsForDate] = useState<Reservation[]>([])
  const [swapMessage, setSwapMessage] = useState<string | null>(null)

  // Reset view when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setView('detail')
    }
  }, [open])

  // Load all tables when switching to cambiar-mesa view
  useEffect(() => {
    if (view === 'cambiar-mesa') {
      setLoadingTables(true)
      setSwapMessage(null)
      getTables().then(tables => {
        setAllTables(tables)
        setLoadingTables(false)
      })
      // Use allShiftReservations which already has the current shift's reservations
      setAllReservationsForDate(allShiftReservations)
    }
  }, [view, allShiftReservations])

  if (!table) return null

  const handleAction = async (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (!result.error) {
        onRefresh()
        onOpenChange(false)
      }
    })
  }

  const handleNewReservation = () => {
    router.push(`/reservas/nueva?table=${table.id}&shift=${shift}&fecha=${formatDateStr(selectedDate)}`)
    onOpenChange(false)
  }

  const handleWalkIn = () => {
    router.push(`/reservas/nueva?table=${table.id}&shift=${shift}&walkIn=true&fecha=${formatDateStr(selectedDate)}`)
    onOpenChange(false)
  }

  const handleEditReservation = () => {
    if (currentReservation) {
      router.push(`/reservas/${currentReservation.id}`)
      onOpenChange(false)
    }
  }

  const handleDoblar = () => {
    router.push(`/reservas/nueva?table=${table.id}&shift=${shift}&doblar=true&fecha=${formatDateStr(selectedDate)}`)
    onOpenChange(false)
  }

  const handleCambiarMesa = async (newTableId: string) => {
    if (!currentReservation) return
    startTransition(async () => {
      const result = await changeReservationTable(currentReservation.id, newTableId)
      if (!result.error) {
        setSwapMessage(result.message || null)
        // Show message briefly, THEN refresh and close
        setTimeout(() => {
          onRefresh()
          onOpenChange(false)
        }, 1200)
      }
    })
  }

  const formatTime = (time: string) => time.slice(0, 5)

  // Group tables by zone for the cambiar-mesa view
  const tablesByZone = ZONE_ORDER.reduce((acc, zone) => {
    acc[zone] = allTables.filter(t => t.zone === zone)
    return acc
  }, {} as Record<TableZone, Table[]>)

  // Get table status and reservation info for the picker
  const getTableInfo = (t: Table): { 
    status: 'libre' | 'reservada' | 'sentada' | 'bloqueada'
    statusLabel: string
    reservation: Reservation | null
    hasConflict: boolean
  } => {
    // Find all active reservations on this table (excluding current)
    const tableReservations = allReservationsForDate.filter(r => 
      r.table_id === t.id && 
      r.id !== currentReservation?.id &&
      !['cancelled', 'completed', 'no_show'].includes(r.status)
    )
    
    // Check for seated reservation
    const seatedRes = tableReservations.find(r => r.status === 'seated')
    if (seatedRes) {
      return { 
        status: 'sentada', 
        statusLabel: 'En servicio', 
        reservation: seatedRes, 
        hasConflict: true 
      }
    }
    
    // Check for pending reservation
    const pendingRes = tableReservations.find(r => 
      r.status === 'reserved'
    )
    if (pendingRes) {
      return { 
        status: 'reservada', 
        statusLabel: 'Reservada', 
        reservation: pendingRes, 
        hasConflict: true 
      }
    }
    
    // TODO: Check if table is blocked (would need blocked_tables data)
    
    return { 
      status: 'libre', 
      statusLabel: 'Libre', 
      reservation: null, 
      hasConflict: false 
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-xl">
        {view === 'detail' ? (
          <>
            <SheetHeader className="text-left pb-4">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-2xl font-bold">Mesa {table.label}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {table.zone} · {table.capacity}p
                </span>
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detalles de la mesa {table.label}
              </SheetDescription>
            </SheetHeader>

            {/* Status: Reserved or Seated */}
            {(status === 'reserved' || status === 'seated') && currentReservation && (
              <div className="space-y-4">
                {/* Header with name and time */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      {currentReservation.guest?.is_vip && <span className="text-amber-500">⭐</span>}
                      {currentReservation.guest_name}
                    </h2>
                    {currentReservation.guest?.is_vip && (
                      <span className="text-amber-500 text-sm">Cliente VIP</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentReservation.time)}
                  </span>
                </div>

                {/* Info pills row */}
                <div className="flex gap-2 flex-wrap">
                  <span className="bg-muted px-3 py-1 rounded-full text-sm">
                    {currentReservation.party_size} personas
                  </span>
                  <span className="bg-muted px-3 py-1 rounded-full text-sm">
                    Mesa {table.label}
                  </span>
                  {currentReservation.guest_phone && (
                    <a 
                      href={`tel:${currentReservation.guest_phone}`}
                      className="bg-muted px-3 py-1 rounded-full text-sm flex items-center gap-1 hover:bg-muted/80"
                    >
                      {currentReservation.guest_phone}
                    </a>
                  )}
                  <span className={cn(
                    "px-3 py-1 rounded-full text-sm",
                    currentReservation.status === 'reserved' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    currentReservation.status === 'seated' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  )}>
                    {STATUS_LABELS[currentReservation.status] || currentReservation.status}
                  </span>
                </div>

                {/* Notes if any */}
                {currentReservation.notes && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                    {currentReservation.notes}
                  </div>
                )}

                {/* Actions grid */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={handleEditReservation}>
                    Editar
                  </Button>
                  <Button variant="outline" onClick={handleDoblar}>
                    Doblar
                  </Button>
                  <Button variant="outline" onClick={() => setView('cambiar-mesa')}>
                    Cambiar mesa
                  </Button>
                  {currentReservation.guest_id ? (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const newVip = !currentReservation.guest?.is_vip
                        await toggleVip(currentReservation.guest_id!, newVip)
                        onRefresh()
                      }}
                      disabled={isPending}
                      className={cn(
                        currentReservation.guest?.is_vip 
                          ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" 
                          : ""
                      )}
                    >
                      {currentReservation.guest?.is_vip ? 'Quitar VIP' : 'Marcar VIP'}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled title="Solo disponible para clientes registrados">
                      Marcar VIP
                    </Button>
                  )}
                  {status === 'reserved' && (
                    <Button 
                      variant="outline" 
                      className="text-destructive"
                      onClick={() => handleAction(() => markNoShow(currentReservation.id))}
                      disabled={isPending}
                    >
                      No-show
                    </Button>
                  )}
                </div>

                {/* Primary action */}
                {status === 'reserved' && (
                  <Button 
                    className="w-full" 
                    onClick={() => handleAction(() => seatTable(currentReservation.id))}
                    disabled={isPending}
                  >
                    Sentar
                  </Button>
                )}

                {status === 'seated' && (
                  <Button 
                    className="w-full" 
                    onClick={() => handleAction(() => releaseTable(currentReservation.id))}
                    disabled={isPending}
                  >
                    Liberar mesa
                  </Button>
                )}

                <Button 
                  variant="ghost" 
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => handleAction(() => cancelReservation(currentReservation.id))}
                  disabled={isPending}
                >
                  Cancelar reserva
                </Button>
              </div>
            )}

            {/* Status: Available */}
            {status === 'available' && (
              <div className="flex flex-col gap-3">
                <Button size="lg" onClick={handleNewReservation}>
                  Nueva Reserva
                </Button>
                <Button size="lg" variant="outline" onClick={handleWalkIn}>
                  Sentar sin Reserva
                </Button>
                <Button 
                  size="lg"
                  variant="ghost" 
                  className="text-muted-foreground"
                  onClick={() => handleAction(() => blockTable(table.id))} 
                  disabled={isPending}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Bloquear Mesa
                </Button>
              </div>
            )}

            {/* Status: Blocked */}
            {status === 'blocked' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">Esta mesa está bloqueada.</p>
                <Button onClick={() => handleAction(() => unblockTable(table.id))} disabled={isPending}>
                  Desbloquear mesa
                </Button>
              </div>
            )}
          </>
        ) : (
          /* Cambiar mesa view */
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setView('detail')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold">Selecciona la nueva mesa</h2>
            </div>

            <SheetDescription className="sr-only">
              Selecciona una nueva mesa para mover la reserva
            </SheetDescription>

            {swapMessage && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400 text-center">
                {swapMessage}
              </div>
            )}

            {loadingTables ? (
              <div className="text-center py-8 text-muted-foreground">
                Cargando mesas...
              </div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {ZONE_ORDER.map(zone => {
                  const zoneTables = tablesByZone[zone]
                  if (!zoneTables || zoneTables.length === 0) return null
                  return (
                    <div key={zone}>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {zone}
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {zoneTables.map(t => {
                          const isCurrent = t.id === table.id
                          const { status, statusLabel, reservation, hasConflict } = getTableInfo(t)
                          
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={isCurrent || isPending}
                              onClick={() => handleCambiarMesa(t.id)}
                              className={cn(
                                "rounded-lg border-2 p-3 text-left transition-colors",
                                isCurrent && "opacity-40 cursor-not-allowed border-gray-200",
                                !isCurrent && "cursor-pointer hover:border-gray-400",
                                !isCurrent && status === 'libre' && "border-gray-200",
                                !isCurrent && status === 'reservada' && "border-amber-300",
                                !isCurrent && status === 'sentada' && "border-blue-300",
                                !isCurrent && status === 'bloqueada' && "border-gray-300 bg-gray-50"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-sm">Mesa {t.label}</span>
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full",
                                  status === 'libre' && "bg-green-100 text-green-700",
                                  status === 'reservada' && "bg-amber-100 text-amber-700",
                                  status === 'sentada' && "bg-blue-100 text-blue-700",
                                  status === 'bloqueada' && "bg-gray-100 text-gray-500"
                                )}>
                                  {isCurrent ? 'Actual' : statusLabel}
                                </span>
                              </div>
                              
                              <div className="text-xs text-muted-foreground">
                                {t.capacity} personas
                              </div>
                              
                              {reservation && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {reservation.guest_name} · {reservation.party_size}p · {reservation.time.slice(0, 5)}
                                </div>
                              )}
                              
                              {hasConflict && !isCurrent && (
                                <div className="text-xs text-amber-600 mt-1 font-medium">
                                  Se intercambiaran
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
