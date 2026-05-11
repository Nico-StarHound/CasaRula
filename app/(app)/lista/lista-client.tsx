'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DateShiftHeader, getCurrentShift } from '@/components/date-shift-header'
import { ListaDetailSheet } from '@/components/lista-detail-sheet'
import { getListaData, getWaitlist, type ListaTableRow, type ListaData } from '@/app/actions/lista'
import { addToWaitlist, assignTableFromWaitlist, removeFromWaitlist } from '@/app/actions/reservations'
import { getTables } from '@/app/actions/floor-plan'
import { TimelineView } from '@/components/timeline-view'
import { RefreshCw, Phone, Star, Link2, ChevronDown, X, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { Table } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Shift, TableZone, TableStatus, Reservation } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Filter reservations by turno
const isComida = (time: string) => {
  const [h] = time.split(':').map(Number)
  return h >= 12 && h < 17
}

const isCena = (time: string) => {
  const [h] = time.split(':').map(Number)
  return h >= 19 || h < 3 // handles midnight crossover
}

const filterByTurno = (reservations: Reservation[], turno: Shift) => {
  return reservations.filter(r => 
    turno === 'comida' ? isComida(r.time) : isCena(r.time)
  )
}

const STATUS_CONFIG: Record<TableStatus, { dot: string; label: string; bg: string; border?: string }> = {
  available: { dot: 'bg-emerald-500', label: 'Libre', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  reserved: { dot: 'bg-amber-400', label: 'Reservada', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  seated: { dot: 'bg-blue-500', label: 'Sentada', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-l-4 border-blue-400' },
  blocked: { dot: 'bg-stone-400', label: 'Bloqueada', bg: 'bg-stone-100 dark:bg-stone-900/30' },
}

// Late detection helpers
const isToday = (date: Date) => {
  const today = new Date()
  return date.toISOString().split('T')[0] === today.toISOString().split('T')[0]
}

const isLate = (reservationTime: string, reservationStatus: string, selectedDate: Date) => {
  if (!isToday(selectedDate)) return false
  if (reservationStatus !== 'reserved') return false
  const [h, m] = reservationTime.split(':').map(Number)
  const resMinutes = h * 60 + m
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes > resMinutes + 5
}

const getLateMinutes = (reservationTime: string) => {
  const [h, m] = reservationTime.split(':').map(Number)
  const resMinutes = h * 60 + m
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes - resMinutes
}

export function ListaClient() {
  const router = useRouter()
  const [date, setDate] = useState(() => new Date())
  const [shift, setShift] = useState<Shift>('comida') // Default for SSR
  const [data, setData] = useState<ListaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<ListaTableRow | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [, setNow] = useState(new Date()) // For real-time late detection updates
  
  // Waitlist state
  const [waitlist, setWaitlist] = useState<Reservation[]>([])
  const [waitlistOpen, setWaitlistOpen] = useState(true)
  const [addWaitlistOpen, setAddWaitlistOpen] = useState(false)
  const [assigningWaitlist, setAssigningWaitlist] = useState<Reservation | null>(null)
  const [waitlistTables, setWaitlistTables] = useState<Table[]>([])
  const [waitlistForm, setWaitlistForm] = useState({
    guest_name: '',
    party_size: 2,
    phone: '',
    notes: ''
  })

  // Set correct shift after hydration
  useEffect(() => {
    setShift(getCurrentShift())
  }, [])

  // Update every minute for late detection
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [result, waitlistData] = await Promise.all([
      getListaData(formatDate(date), shift),
      getWaitlist(formatDate(date))
    ])
    setData(result)
    setWaitlist(waitlistData)
    setLoading(false)
  }, [date, shift])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Refetch when page becomes visible or gains focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData()
      }
    }
    const handleFocus = () => fetchData()
    
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchData])

  const handleRowClick = (row: ListaTableRow) => {
    // If table is available, go directly to create reservation
    if (row.status === 'available') {
      router.push(`/reservas/nueva?table=${row.table.id}&shift=${shift}&fecha=${formatDate(date)}`)
      return
    }
    // Otherwise show the detail sheet
    setSelectedRow(row)
    setShowDetail(true)
  }

  const handleRefresh = () => {
    fetchData()
    router.refresh()
  }

  const handleAddToWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waitlistForm.guest_name.trim()) return
    await addToWaitlist({
      guest_name: waitlistForm.guest_name,
      party_size: waitlistForm.party_size,
      phone: waitlistForm.phone || undefined,
      notes: waitlistForm.notes || undefined,
      date: formatDate(date)
    })
    setWaitlistForm({ guest_name: '', party_size: 2, phone: '', notes: '' })
    setAddWaitlistOpen(false)
    fetchData()
  }

  const handleRemoveFromWaitlist = async (reservationId: string) => {
    await removeFromWaitlist(reservationId)
    fetchData()
  }

  const handleOpenAssignTable = async (reservation: Reservation) => {
    setAssigningWaitlist(reservation)
    const tables = await getTables()
    setWaitlistTables(tables)
  }

  const handleAssignTable = async (tableId: string) => {
    if (!assigningWaitlist) return
    await assignTableFromWaitlist(assigningWaitlist.id, tableId)
    setAssigningWaitlist(null)
    fetchData()
  }

  // Extract all reservations and tables for timeline, filtered by turno
  // Deduplicate reservations (same reservation can appear for multiple linked tables)
  const allReservationsRaw = data?.rows.flatMap(row => row.allShiftReservations) || []
  const uniqueReservations = Array.from(
    new Map(allReservationsRaw.map(r => [r.id, r])).values()
  )
  const filteredReservations = filterByTurno(uniqueReservations, shift)
  const allTables = data?.rows.map(row => row.table) || []

  // Summary stats
  const seatedCount = filteredReservations.filter(r => r.status === 'seated').length
  const pendingCount = filteredReservations.filter(r => 
    r.status === 'reserved' && !isLate(r.time, r.status, date)
  ).length
  const lateCount = filteredReservations.filter(r => 
    isLate(r.time, r.status, date)
  ).length
  const noShowCount = filteredReservations.filter(r => r.status === 'no_show').length
  const completedCount = filteredReservations.filter(r => r.status === 'completed').length
  const totalCovers = filteredReservations
    .filter(r => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.party_size, 0)
  const seatedCovers = filteredReservations
    .filter(r => r.status === 'seated')
    .reduce((sum, r) => sum + r.party_size, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b">
        <div className="flex items-center justify-between px-4 py-2">
          <h1 className="text-lg font-semibold">La Lista</h1>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
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

      {/* Summary bar - desktop only */}
      <div className="hidden md:flex items-center gap-6 px-4 py-1.5 border-b text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
          <span className="font-semibold">{seatedCount}</span>
          <span className="text-muted-foreground">sentados</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          <span className="font-semibold">{pendingCount}</span>
          <span className="text-muted-foreground">por llegar</span>
        </div>

        {lateCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="font-semibold text-red-600">{lateCount}</span>
            <span className="text-red-500">tarde</span>
          </div>
        )}

        {noShowCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
            <span className="font-semibold text-gray-500">{noShowCount}</span>
            <span className="text-muted-foreground">no-show</span>
          </div>
        )}

        <div className="w-px h-4 bg-border mx-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">{totalCovers}p</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">En sala</span>
          <span className="font-semibold">{seatedCovers}p</span>
        </div>
      </div>

      {/* Waitlist Section */}
      <div className="border-b">
        <button 
          onClick={() => setWaitlistOpen(!waitlistOpen)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <span>Lista de espera ({waitlist.length})</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", waitlistOpen && "rotate-180")} />
        </button>

        {waitlistOpen && (
          <div className="px-4 pb-3 space-y-2">
            {waitlist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No hay nadie en espera
              </p>
            ) : (
              waitlist.map((r, index) => (
                <div key={r.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{index + 1}.</span>
                    <span className="font-medium">{r.guest_name}</span>
                    <span className="text-muted-foreground">{r.party_size}p</span>
                    {r.guest_phone && (
                      <a href={`tel:${r.guest_phone}`} className="text-blue-500 hover:underline text-xs">
                        {r.guest_phone}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleOpenAssignTable(r)}
                    >
                      Asignar mesa
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                      onClick={() => handleRemoveFromWaitlist(r.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full mt-1"
              onClick={() => setAddWaitlistOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Añadir a lista de espera
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: single column list */}
      <div className="flex-1 overflow-auto md:hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y">
            {ZONE_ORDER.map((zone) => {
              const zoneRows = data?.groupedByZone[zone] || []
              if (zoneRows.length === 0) return null
              return (
                <div key={zone}>
                  <div className="bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {zone}
                  </div>
                  {zoneRows.map((row) => (
                    <ListaRow key={row.table.id} row={row} onClick={() => handleRowClick(row)} selectedDate={date} />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Desktop: two columns - list + timeline */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left: existing list */}
        <div className="w-[420px] flex-shrink-0 overflow-y-auto border-r">
          {loading && !data ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y">
              {ZONE_ORDER.map((zone) => {
                const zoneRows = data?.groupedByZone[zone] || []
                if (zoneRows.length === 0) return null
                return (
                  <div key={zone}>
                    <div className="bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {zone}
                    </div>
                    {zoneRows.map((row) => (
                      <ListaRow key={row.table.id} row={row} onClick={() => handleRowClick(row)} selectedDate={date} />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <TimelineView 
            reservations={filteredReservations}
            tables={allTables}
            turno={shift}
            selectedDate={date}
            waitlist={waitlist}
          />
        </div>
      </div>

      {/* Detail Sheet */}
      <ListaDetailSheet
        open={showDetail}
        onOpenChange={setShowDetail}
        table={selectedRow?.table ?? null}
        status={selectedRow?.status ?? 'available'}
        currentReservation={selectedRow?.currentReservation ?? null}
        allShiftReservations={selectedRow?.allShiftReservations ?? []}
        shift={shift}
        selectedDate={date}
        onRefresh={handleRefresh}
      />

      {/* Add to Waitlist Sheet */}
      <Sheet open={addWaitlistOpen} onOpenChange={setAddWaitlistOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Añadir a lista de espera</SheetTitle>
            <SheetDescription className="sr-only">Añadir cliente a la lista de espera</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddToWaitlist} className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Nombre *</label>
              <Input
                value={waitlistForm.guest_name}
                onChange={(e) => setWaitlistForm(prev => ({ ...prev, guest_name: e.target.value }))}
                placeholder="Nombre del cliente"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Personas</label>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWaitlistForm(prev => ({ ...prev, party_size: n }))}
                    className={cn(
                      "w-10 h-10 rounded-lg border text-sm font-medium transition-colors",
                      waitlistForm.party_size === n
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background hover:bg-accent border-input"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Teléfono (opcional)</label>
              <Input
                value={waitlistForm.phone}
                onChange={(e) => setWaitlistForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Teléfono"
                type="tel"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nota (opcional)</label>
              <Input
                value={waitlistForm.notes}
                onChange={(e) => setWaitlistForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Nota interna"
              />
            </div>
            <Button type="submit" className="w-full">
              Añadir a espera
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Assign Table Sheet */}
      <Sheet open={!!assigningWaitlist} onOpenChange={(open) => !open && setAssigningWaitlist(null)}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>
              Asignar mesa a {assigningWaitlist?.guest_name} ({assigningWaitlist?.party_size}p)
            </SheetTitle>
            <SheetDescription className="sr-only">Selecciona una mesa para asignar</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {ZONE_ORDER.map(zone => {
              const zoneTables = waitlistTables.filter(t => t.zone === zone)
              if (zoneTables.length === 0) return null
              return (
                <div key={zone}>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {zone}
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {zoneTables.map(t => {
                      const isOccupied = data?.rows.find(r => r.table.id === t.id)?.status !== 'available'
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={isOccupied}
                          onClick={() => handleAssignTable(t.id)}
                          className={cn(
                            "p-3 rounded-lg border text-center transition-colors",
                            isOccupied 
                              ? "bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-60"
                              : "bg-green-50 border-green-200 hover:bg-green-100 cursor-pointer"
                          )}
                        >
                          <div className="font-medium text-sm">Mesa {t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.capacity}p</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ListaRow({ row, onClick, selectedDate }: { row: ListaTableRow; onClick: () => void; selectedDate: Date }) {
  const { table, status, currentReservation, allShiftReservations, isDoblada } = row
  const config = STATUS_CONFIG[status]
  const isLibre = status === 'available'
  const isBlocked = status === 'blocked'
  
  // For doblada tables, check if ANY reservation is seated
  const hasSeatedReservation = allShiftReservations?.some(r => r.status === 'seated') ?? false
  const hasPendingReservation = allShiftReservations?.some(r => 
    r.status !== 'seated' && r.status !== 'completed' && r.status !== 'cancelled'
  ) ?? false
  
  // Check if any reservation is late (for no-show warning)
  const hasLateReservation = allShiftReservations?.some(r => 
    isLate(r.time, r.status, selectedDate)
  ) ?? false
  
  // Determine row background based on reservation statuses
  // For doblada rows, use neutral background so individual cards can have their own colors
  const hasTwoRes = isDoblada && allShiftReservations && allShiftReservations.length >= 2
  const rowBg = isLibre ? STATUS_CONFIG.available.bg
    : isBlocked ? STATUS_CONFIG.blocked.bg
    : hasTwoRes ? 'bg-muted/20' // Neutral for doblada - cards have their own colors
    : hasLateReservation ? 'bg-red-50 dark:bg-red-950/30 border-l-4 border-red-400'
    : hasSeatedReservation ? `${STATUS_CONFIG.seated.bg} ${STATUS_CONFIG.seated.border || ''}`
    : hasPendingReservation ? STATUS_CONFIG.reserved.bg
    : STATUS_CONFIG.available.bg

  // Check if this is a doblada row with 2 reservations
  const hasTwoReservations = isDoblada && allShiftReservations && allShiftReservations.length >= 2
  const sortedReservations = hasTwoReservations 
    ? [...allShiftReservations].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 2)
    : null

  // Individual card background based on reservation status
  const getCardBg = (r: Reservation) => {
    if (r.status === 'seated') return 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-400'
    if (r.status === 'no_show') return 'bg-gray-100 dark:bg-gray-800/40 border-l-2 border-gray-300'
    if (r.status === 'completed') return 'bg-gray-50 dark:bg-gray-900/40 border-l-2 border-gray-200 opacity-60'
    if (isLate(r.time, r.status, selectedDate)) return 'bg-red-50 dark:bg-red-950/40 border-l-2 border-red-400'
    return 'bg-amber-50 dark:bg-amber-950/40 border-l-2 border-amber-300'
  }
  
  return (
    <div 
      className={cn(
        'flex items-stretch border-b cursor-pointer active:bg-muted/50 transition-colors',
        'sm:py-1',
        rowBg
      )}
      onClick={onClick}
    >
      {/* Table Number */}
      <div className="w-12 sm:w-14 flex-shrink-0 flex items-center justify-center border-r font-bold text-lg overflow-hidden">
        {table.label.slice(0, 2)}
      </div>
      
      {/* Content */}
      {isLibre || isBlocked ? (
        // Libre or Blocked state - show status only
        <div className="flex-1 px-3 sm:px-4 py-3 flex items-center">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className={cn('w-2 h-2 rounded-full', config.dot)} />
            {config.label}
          </span>
        </div>
      ) : hasTwoReservations && sortedReservations ? (
        // Doblada: two columns side by side with individual card colors
        <div className="flex-1 grid grid-cols-2 gap-1 p-1">
          {sortedReservations.map((res) => (
            <div key={res.id} className={cn('px-3 sm:px-4 py-2 sm:py-3 rounded', getCardBg(res))}>
              <div className="flex items-center gap-1">
                {res.guest?.is_vip && <span className="text-amber-500">⭐</span>}
                <span className="font-semibold text-sm truncate">{res.guest_name}</span>
                <span className="text-xs text-muted-foreground">{res.party_size}p</span>
                {res.mesa_solicitada && <Star className="h-3 w-3 text-amber-500 fill-current" />}
                {res.table_ids && res.table_ids.length > 1 && <Link2 className="h-3 w-3 text-blue-500" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{res.time.slice(0, 5)}</span>
                {isLate(res.time, res.status, selectedDate) && (
                  <span className="text-xs text-red-600 font-medium">
                    ⚠️ Tarde {getLateMinutes(res.time)} min
                  </span>
                )}
              </div>
              {res.guest_phone && (
                <div className="flex items-center gap-1 text-xs mt-0.5">
                  {isLate(res.time, res.status, selectedDate) ? (
                    <a 
                      href={`tel:${res.guest_phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-red-600 font-medium hover:underline"
                    >
                      📞 Llamar
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {res.guest_phone}
                    </span>
                  )}
                </div>
              )}
              {res.status === 'seated' && (
                <span className="inline-flex items-center gap-1 text-xs mt-1 text-blue-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Sentada
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Normal single reservation
        <div className="flex-1 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <span className="font-medium inline-flex items-center gap-1">
              {currentReservation?.guest?.is_vip && <span className="text-amber-500">⭐</span>}
              {currentReservation?.guest_name}
              <span className="text-muted-foreground font-normal">
                {currentReservation?.party_size}p
              </span>
              {currentReservation?.mesa_solicitada && <Star className="h-3 w-3 text-amber-500 fill-current" />}
              {currentReservation?.table_ids && currentReservation.table_ids.length > 1 && <Link2 className="h-3 w-3 text-blue-500" />}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentReservation?.time?.slice(0, 5)}
              </span>
              {currentReservation && isLate(currentReservation.time, currentReservation.status, selectedDate) && (
                <span className="text-xs text-red-600 font-medium">
                  ⚠️ Tarde {getLateMinutes(currentReservation.time)} min
                </span>
              )}
            </div>
          </div>
          {currentReservation?.guest_phone && (
            <div className="flex items-center gap-1 text-xs mt-0.5">
              {currentReservation && isLate(currentReservation.time, currentReservation.status, selectedDate) ? (
                <a 
                  href={`tel:${currentReservation.guest_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-red-600 font-medium hover:underline"
                >
                  📞 Llamar
                </a>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {currentReservation.guest_phone}
                </span>
              )}
            </div>
          )}
          {currentReservation?.status === 'seated' && (
            <span className="inline-flex items-center gap-1 text-xs mt-1 text-blue-600">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Sentada
            </span>
          )}
        </div>
      )}
    </div>
  )
}
