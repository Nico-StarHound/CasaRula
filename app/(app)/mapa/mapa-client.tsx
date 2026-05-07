'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RestaurantMap } from '@/components/restaurant-map'
import { TableActionSheet } from '@/components/table-action-sheet'
import { CambiarMesaSheet } from '@/components/cambiar-mesa-sheet'
import { DateShiftHeader, getCurrentShift } from '@/components/date-shift-header'
import { Button } from '@/components/ui/button'
import { updateTableZonePosition, getTablesWithStatus } from '@/app/actions/floor-plan'
import { changeReservationTable } from '@/app/actions/reservations'
import { getSession } from '@/app/actions/auth'
import { X, Check } from 'lucide-react'
import type { Table, TableStatus, Reservation, Shift, StaffRole } from '@/lib/types'

interface MapaClientProps {
  floorPlanId: string
  restaurantName: string
  initialEditMode?: boolean
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function MapaClient({ 
  floorPlanId,
  restaurantName,
  initialEditMode = false
}: MapaClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [date, setDate] = useState(() => new Date())
  const [shift, setShift] = useState<Shift>('comida') // Default for SSR, updated in useEffect
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Set correct shift after hydration to avoid mismatch
  useEffect(() => {
    setShift(getCurrentShift())
    setIsHydrated(true)
  }, [])
  const [tables, setTables] = useState<(Table & { status?: TableStatus; current_reservation?: Reservation; all_shift_reservations?: Reservation[]; is_doblada?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState<(Table & { status?: TableStatus; current_reservation?: Reservation; all_shift_reservations?: Reservation[]; is_doblada?: boolean }) | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [showCambiarMesa, setShowCambiarMesa] = useState(false)
  const [cambiarReservation, setCambiarReservation] = useState<Reservation | null>(null)
  const [isEditMode, setIsEditMode] = useState(initialEditMode)
  const [isPending, startTransition] = useTransition()
  const [userRole, setUserRole] = useState<StaffRole | undefined>(undefined)

  // Handle edit mode from URL
  useEffect(() => {
    const editParam = searchParams.get('edit')
    setIsEditMode(editParam === 'true')
  }, [searchParams])

  // Fetch user session for role
  useEffect(() => {
    getSession().then(session => {
      if (session?.staff?.role) {
        setUserRole(session.staff.role as StaffRole)
      }
    })
  }, [])

  const fetchTables = useCallback(async () => {
    setLoading(true)
    const result = await getTablesWithStatus(floorPlanId, formatDate(date), shift)
    setTables(result)
    setLoading(false)
  }, [floorPlanId, date, shift])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  // Auto-refresh every 30s (only when not editing)
  useEffect(() => {
    if (isEditMode) return
    const interval = setInterval(() => {
      fetchTables()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchTables, isEditMode])

  // Refetch when page becomes visible or gains focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTables()
      }
    }
    const handleFocus = () => fetchTables()
    
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchTables])

  

  const handleTableSelect = useCallback((table: Table) => {
    const fullTable = tables.find(t => t.id === table.id) || table
    setSelectedTable(fullTable as typeof selectedTable)
    if (!isEditMode) {
      setShowActions(true)
    }
  }, [tables, isEditMode])

  const handleTableMove = useCallback((tableId: string, zoneX: number, zoneY: number) => {
    setTables(prev => prev.map(t => 
      t.id === tableId ? { ...t, zone_x: zoneX, zone_y: zoneY } : t
    ))
    
    startTransition(async () => {
      await updateTableZonePosition(tableId, zoneX, zoneY)
    })
  }, [])

  const handleTableAction = (action: 'reserve' | 'seat' | 'complete' | 'block' | 'unblock' | 'seat-reservation' | 'cambiarMesa', reservationOrId?: Reservation | string) => {
    if (!selectedTable) return
    
    if (action === 'reserve') {
      router.push(`/reservas/nueva?table=${selectedTable.id}&shift=${shift}`)
    } else if (action === 'seat') {
      // Handled inside TableActionSheet with comensales picker
      return
    } else if (action === 'complete' && selectedTable.current_reservation) {
      router.push(`/reservas/${selectedTable.current_reservation.id}/completar`)
    } else if (action === 'seat-reservation' && reservationOrId && typeof reservationOrId !== 'string') {
      router.push(`/reservas/${reservationOrId.id}/sentar`)
    } else if (action === 'cambiarMesa' && typeof reservationOrId === 'string') {
      const reservation = selectedTable.all_shift_reservations?.find(r => r.id === reservationOrId)
      if (reservation) {
        setCambiarReservation(reservation)
        setShowCambiarMesa(true)
        setShowActions(false)
      }
    }
  }

  const handleCambiarConfirm = async (reservationId: string, newTableId: string) => {
    await changeReservationTable(reservationId, newTableId)
    setShowCambiarMesa(false)
    setCambiarReservation(null)
    fetchTables()
  }

  const handleRefresh = () => {
    fetchTables()
    router.refresh()
  }

  const handleExitEditMode = () => {
    router.push('/mapa')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Edit Mode Header */}
      {isEditMode && (
        <div className="flex-shrink-0 bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium">Editando posiciones</span>
          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleExitEditMode}
              disabled={isPending}
            >
              <Check className="h-4 w-4 mr-1" />
              Listo
            </Button>
          </div>
        </div>
      )}

      {/* Normal Header */}
      {!isEditMode && (
        <header className="flex-shrink-0 border-b">
          <div className="flex items-center justify-between px-4 py-2">
            <h1 className="text-lg font-semibold">{restaurantName}</h1>
            {/* Legend - compact */}
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Libre</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-muted-foreground">Reservada</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Ocupada</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-stone-400" />
                <span className="text-muted-foreground">Bloqueada</span>
              </div>
            </div>
          </div>
          <div className="px-4 pb-2">
            <DateShiftHeader
              date={date}
              onDateChange={setDate}
              shift={shift}
              onShiftChange={setShift}
            />
          </div>
        </header>
      )}

      {/* Restaurant Map */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {loading && tables.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <RestaurantMap
            tables={tables}
            selectedTableId={selectedTable?.id ?? null}
            onSelectTable={handleTableSelect}
            isEditMode={isEditMode}
            onTableMove={handleTableMove}
          />
        )}
      </div>

      {/* Table Action Sheet */}
      {!isEditMode && (
        <TableActionSheet
          open={showActions}
          onOpenChange={setShowActions}
          table={selectedTable}
          onAction={handleTableAction}
          onRefresh={handleRefresh}
          userRole={userRole}
        />
      )}

      {/* Cambiar Mesa Sheet */}
      <CambiarMesaSheet
        open={showCambiarMesa}
        onOpenChange={setShowCambiarMesa}
        reservation={cambiarReservation}
        tables={tables}
        onConfirm={handleCambiarConfirm}
      />
    </div>
  )
}
