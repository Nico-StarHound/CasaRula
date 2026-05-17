'use client'

// Table action sheet v2 - single drawer with two views: actions and comensales picker
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'
import { SeatedTimer } from '@/components/seated-timer'
import {
  Users,
  CalendarPlus,
  UserCheck,
  Ban,
  CheckCircle,
  Phone,
  FileText,
  AlertTriangle,
  Pencil,
  ArrowRightLeft,
  ArrowLeft,
  Star,
  Link2,
  ClipboardList,
  ChevronDown,
  Receipt,
  DoorOpen,
  CreditCard
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Table, TableStatus, Reservation, StaffRole } from '@/lib/types'
import { updateTable } from '@/app/actions/floor-plan'
import { updateReservationStatus } from '@/app/actions/reservations'
import { openOrder, seatTableWalkIn, getOpenOrder, cancelOrder, type Order } from '@/app/actions/comandas'
import { cn } from '@/lib/utils'

interface TableActionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: (Table & {
    status?: TableStatus
    current_reservation?: Reservation
    all_shift_reservations?: Reservation[]
    is_doblada?: boolean
  }) | null
  onAction: (action: 'reserve' | 'seat' | 'complete' | 'block' | 'unblock' | 'seat-reservation' | 'cambiarMesa', reservationOrId?: Reservation | string) => void
  onRefresh: () => void
  userRole?: StaffRole
}

const STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponible',
  reserved: 'Reservada',
  seated: 'Ocupada',
  blocked: 'Bloqueada',
}

const STATUS_BG: Record<TableStatus, string> = {
  available: 'bg-emerald-500',
  reserved: 'bg-amber-400',
  seated: 'bg-red-500',
  blocked: 'bg-stone-400',
}

function ReservationCard({
  reservation,
  isCurrent,
  onSeat,
  onSeatAndComanda,
  onNoShow,
  onComplete,
  onModify,
  onCambiarMesa,
  loading,
  canSeeComanda,
  hideModifyButtons,
  seatedActionsSlot
}: {
  reservation: Reservation
  isCurrent?: boolean
  onSeat: () => void
  onSeatAndComanda: () => void
  onNoShow: () => void
  onComplete: () => void
  onModify: () => void
  onCambiarMesa: () => void
  loading: boolean
  canSeeComanda?: boolean
  hideModifyButtons?: boolean
  seatedActionsSlot?: React.ReactNode
}) {
  const noShowCount = reservation.guest?.no_show_count || 0
  const hasNoShowWarning = noShowCount > 0
  const isReserved = reservation.status === 'reserved'
  const isSeated = reservation.status === 'seated'
  
  // Check if this is a walk-in (no guest_id or generic names).
  // Includes the new "Walk-in mesa X" pattern used when a walk-in is
  // seated without a name; older entries may still say "Sin nombre".
  const isWalkIn = !reservation.guest_id ||
    reservation.guest_name === 'Sin nombre' ||
    reservation.guest_name === 'Sin reserva' ||
    reservation.guest_name === 'Walk-in' ||
    reservation.guest_name.startsWith('Walk-in mesa ')

  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3",
      isCurrent ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "bg-card"
    )}>
      {/* Guest info row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {reservation.guest?.is_vip && <span className="text-amber-500">⭐</span>}
          <span className="font-semibold">{reservation.guest_name}</span>
          <span className="text-sm text-muted-foreground">{reservation.party_size}p</span>
          {reservation.mesa_solicitada && (
            <span className="text-amber-500" title="Mesa solicitada">
              <Star className="h-3.5 w-3.5 fill-current" />
            </span>
          )}
          {reservation.table_ids && reservation.table_ids.length > 1 && (
            <span className="text-blue-500" title={`${reservation.table_ids.length} mesas`}>
              <Link2 className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <span className="text-sm font-medium">{reservation.time.slice(0, 5)}</span>
      </div>

      {/* Phone */}
      {reservation.guest_phone && (
        <a
          href={`tel:${reservation.guest_phone}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-3.5 w-3.5" />
          {reservation.guest_phone}
        </a>
      )}

      {/* Notes */}
      {reservation.notes && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground italic">
          <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">&quot;{reservation.notes}&quot;</span>
        </p>
      )}

      {/* No-show warning */}
      {hasNoShowWarning && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {noShowCount} no-show{noShowCount > 1 ? 's' : ''} previo{noShowCount > 1 ? 's' : ''}
        </p>
      )}

      {/* Seated actions slot - renders inside the yellow card */}
      {isSeated && seatedActionsSlot && (
        <>
          <hr className="border-dashed border-amber-300" />
          <div className="space-y-2">
            {seatedActionsSlot}
          </div>
        </>
      )}

      {/* Action buttons — 2x2 grid (for reserved status) */}
      {isReserved && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            size="sm"
            onClick={canSeeComanda ? onSeatAndComanda : onSeat}
            disabled={loading}
          >
            {loading ? <Spinner className="mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
            Sentar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onNoShow}
            disabled={loading}
          >
            No Show
          </Button>
          {/* Hide Modificar/Cambiar for walk-ins */}
          {!isWalkIn && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onModify}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Modificar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCambiarMesa}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" />
                Cambiar
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function TableActionSheet({
  open,
  onOpenChange,
  table,
  onAction,
  onRefresh,
  userRole,
}: TableActionSheetProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [actioningReservationId, setActioningReservationId] = useState<string | null>(null)
  const [sheetView, setSheetView] = useState<'actions' | 'comensales' | 'next'>('actions')
  const [comensales, setComensales] = useState(2)
  const [openingMesa, setOpeningMesa] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [showGuestFields, setShowGuestFields] = useState(false)
  const [tableOpenOrder, setTableOpenOrder] = useState<Order | null>(null)
  const [showFirstConfirm, setShowFirstConfirm] = useState(false)
  const [showSecondConfirm, setShowSecondConfirm] = useState(false)
  const [releasing, setReleasing] = useState(false)

  // Show "Ver Comanda" for admin, camarero, caja roles
  const canSeeComanda = userRole && ['admin', 'camarero', 'caja'].includes(userRole)

  // Fetch open order when table is seated
  useEffect(() => {
    if (open && table && table.status === 'seated') {
      getOpenOrder(table.id).then(setTableOpenOrder)
    } else {
      setTableOpenOrder(null)
    }
  }, [open, table])

  // Reset to actions view whenever the drawer closes — otherwise reopening
  // it after a "Sentar" leaves us stuck on the "next" view.
  useEffect(() => {
    if (!open) {
      setSheetView('actions')
    }
  }, [open])

  if (!table) return null

  const status = table.status || 'available'
  const reservations = table.all_shift_reservations || []
  const currentReservation = table.current_reservation
  const isDoblada = table.is_doblada || false

  // Only show status badge for available, seated, blocked (not reserved)
  const showStatusBadge = status === 'available' || status === 'seated' || status === 'blocked'

  const handleBlock = async () => {
    setLoading(true)
    await updateTable(table.id, { is_blocked: !table.is_blocked })
    setLoading(false)
    onRefresh()
    onOpenChange(false)
  }

  const handleMarkSeated = async (reservationId: string) => {
    setActioningReservationId(reservationId)
    setLoading(true)
    await updateReservationStatus(reservationId, 'seated')
    setLoading(false)
    setActioningReservationId(null)
    onRefresh()
    onOpenChange(false)
  }

  const handleNoShow = async (reservationId: string) => {
    setActioningReservationId(reservationId)
    setLoading(true)
    await updateReservationStatus(reservationId, 'no_show')
    setLoading(false)
    setActioningReservationId(null)
    onRefresh()
    onOpenChange(false)
  }

  const handleComplete = async (reservationId: string) => {
    setActioningReservationId(reservationId)
    setLoading(true)
    await updateReservationStatus(reservationId, 'completed')
    setLoading(false)
    setActioningReservationId(null)
    onRefresh()
    onOpenChange(false)
  }

  const handleModify = (reservationId: string) => {
    router.push(`/reservas/${reservationId}`)
    onOpenChange(false)
  }

  const handleCambiarMesa = (reservationId: string) => {
    onAction('cambiarMesa', reservationId)
  }

  const handleSentarSinReserva = () => {
    setComensales(2)
    setGuestName('')
    setGuestPhone('')
    setShowGuestFields(false)
    setSheetView('comensales')
  }

  const handleOpenMesaWithComensales = async () => {
    if (!table) return
    setOpeningMesa(true)
    // Create reservation + order so table shows as occupied
    const order = await seatTableWalkIn(
      table.id,
      comensales,
      guestName || undefined,
      guestPhone || undefined
    )
    setOpeningMesa(false)
    if (order) {
      onRefresh()
      // Show next-step picker: take comanda now, or back to map?
      setSheetView('next')
    }
  }

  const handleNextTakeComanda = () => {
    if (!table) return
    window.location.href = `/comandas/tomar/${table.id}`
  }

  const handleNextBackToMap = () => {
    // Refresh again just before closing so the map shows the new 'seated'
    // status even if the initial onRefresh() race-lost against React render.
    onRefresh()
    setSheetView('actions')
    onOpenChange(false)
  }

  const handleSeatReservationAndOpenComanda = async (reservationId: string, partySize: number) => {
    setActioningReservationId(reservationId)
    setLoading(true)
    await updateReservationStatus(reservationId, 'seated')
    if (table) {
      await openOrder(table.id, partySize)
    }
    setLoading(false)
    setActioningReservationId(null)
    onOpenChange(false)
    if (table) {
      window.location.href = `/comandas/tomar/${table.id}`
    }
  }

const handleVerComanda = () => {
    if (!table) return
    window.location.href = `/comandas/tomar/${table.id}`
  }

  const handleAbrirComanda = async () => {
    if (!table) return
    setOpeningMesa(true)
    await openOrder(table.id, currentReservation?.party_size || 2)
    setOpeningMesa(false)
    window.location.href = `/comandas/tomar/${table.id}`
  }

  // The bottom button on a seated table is now a single "Cuenta" entry
  // point. Invitations, discounts, split, proforma and the final charge
  // all happen inside /cuenta/[tableId] (and /caja for the actual fiscal
  // event). The legacy two-step "Imprimir cuenta" → "Cobrar" UI here is
  // gone.
  const handleAbrirCuenta = () => {
    if (!table) return
    window.location.href = `/cuenta/${table.id}`
  }

  const generateCuentaHTML = (
    items: Order['items'],
    tableLabel: string,
    total: number
  ): string => {
    const subtotal = total / 1.10 // IVA 10%
    const iva = total - subtotal
    const itemsHTML = items
      .filter(i => i.status !== 'cancelled')
      .map(i => `
        <div class="item">
          <span>${i.quantity}x ${i.name}</span>
          <span>${(i.price * i.quantity).toFixed(2)}€</span>
        </div>
      `).join('')

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Cuenta - Mesa ${tableLabel}</title>
<style>
  body { font-family: monospace; width: 300px; margin: 0 auto; padding: 20px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
  h3 { text-align: center; font-size: 14px; margin-top: 0; font-weight: normal; }
  .item { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; }
  .tax { display: flex; justify-content: space-between; font-size: 12px; color: #666; }
  @media print { body { width: 100%; } }
</style>
</head>
<body>
  <h2>CASA RULA</h2>
  <h3>Mesa ${tableLabel}</h3>
  <div class="divider"></div>
  ${itemsHTML}
  <div class="divider"></div>
  <div class="tax"><span>Subtotal s/IVA</span><span>${subtotal.toFixed(2)}€</span></div>
  <div class="tax"><span>IVA 10%</span><span>${iva.toFixed(2)}€</span></div>
  <div class="divider"></div>
  <div class="total"><span>TOTAL</span><span>${total.toFixed(2)}€</span></div>
  <div class="divider"></div>
</body>
</html>`
  }

  const handleLiberarMesa = () => {
    setShowFirstConfirm(true)
  }

  const handleFirstConfirm = () => {
    setShowFirstConfirm(false)
    setShowSecondConfirm(true)
  }

  const handleFinalRelease = async () => {
    if (!table || !currentReservation) return
    setReleasing(true)
    // Cancel order if exists
    if (tableOpenOrder) {
      await cancelOrder(tableOpenOrder.id)
    }
    // Complete the reservation
    await updateReservationStatus(currentReservation.id, 'completed')
    setReleasing(false)
    setShowSecondConfirm(false)
    onRefresh()
    onOpenChange(false)
  }

  const handleSheetOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSheetView('actions')
    }
    onOpenChange(isOpen)
  }

  return (
    <>
      <Drawer open={open} onOpenChange={handleSheetOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        {sheetView === 'actions' ? (
          <>
            <DrawerHeader className="text-left pb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-lg text-white font-bold text-lg",
                  STATUS_BG[status]
                )}>
                  {table.label}
                </div>
                <div>
                  <DrawerTitle className="flex items-center gap-2">
                    Mesa {table.label}
                    {isDoblada && (
                      <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Doblada
                      </span>
                    )}
                  </DrawerTitle>
                  <DrawerDescription className="flex items-center gap-1 flex-wrap">
                    {showStatusBadge && (
                      <>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          status === 'available' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          status === 'seated' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          status === 'blocked' && "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                        )}>
                          {STATUS_LABELS[status]}
                        </span>
                        <span className="text-muted-foreground">·</span>
                      </>
                    )}
                    <span className="text-muted-foreground">
                      {table.capacity} personas · {table.zone}
                    </span>
                    {status === 'seated' && tableOpenOrder?.opened_at && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <SeatedTimer startedAt={tableOpenOrder.opened_at} />
                      </>
                    )}
                  </DrawerDescription>
                </div>
              </div>
            </DrawerHeader>

            <div className="px-4 pb-6 overflow-y-auto">
              {/* Reservations section */}
              {reservations.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                    Reservas en este turno ({reservations.length})
                  </h3>
                  <div className="space-y-3">
                    {reservations
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map(res => (
                        <ReservationCard
                          key={res.id}
                          reservation={res}
                          isCurrent={currentReservation?.id === res.id}
                          onSeat={() => handleMarkSeated(res.id)}
                          onSeatAndComanda={() => handleSeatReservationAndOpenComanda(res.id, res.party_size)}
                          onNoShow={() => handleNoShow(res.id)}
                          onComplete={() => handleComplete(res.id)}
                          onModify={() => handleModify(res.id)}
                          onCambiarMesa={() => handleCambiarMesa(res.id)}
                          loading={loading && actioningReservationId === res.id}
                          canSeeComanda={canSeeComanda}
                          hideModifyButtons={status === 'seated'}
                          seatedActionsSlot={status === 'seated' && currentReservation?.id === res.id ? (
                            <>
                              {/* Ver comanda */}
                              {tableOpenOrder ? (
                                <Button
                                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white"
                                  onClick={handleVerComanda}
                                >
                                  <ClipboardList className="mr-2 h-5 w-5" />
                                  Ver comanda · {tableOpenOrder.total.toFixed(2)}€
                                </Button>
                              ) : (
                                <Button
                                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white"
                                  onClick={handleAbrirComanda}
                                  disabled={openingMesa}
                                >
                                  <ClipboardList className="mr-2 h-5 w-5" />
                                  {openingMesa ? 'Abriendo...' : 'Abrir comanda'}
                                </Button>
                              )}

                              {/* Cuenta — entrada única al flujo de cobro.
                                  Antes había dos botones encadenados
                                  ("Imprimir cuenta" → "Cobrar") y la
                                  visibilidad dependía del flag
                                  cuenta_pedida, lo que escondía la
                                  posibilidad de cobrar hasta haber
                                  imprimido. Ahora un solo botón
                                  "Cuenta" abre la pantalla nueva donde
                                  viven invitaciones, descuentos,
                                  proforma y cobro.
                                  Mostramos siempre que haya una orden
                                  abierta (incluso total = 0 — mesa
                                  totalmente invitada que todavía hay
                                  que cerrar formalmente). */}
                              {tableOpenOrder && (
                                <Button
                                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white"
                                  onClick={handleAbrirCuenta}
                                >
                                  <CreditCard className="mr-2 h-5 w-5" />
                                  Cuenta · {tableOpenOrder.total.toFixed(2)}€
                                </Button>
                              )}

                              {/* Liberar mesa */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={handleLiberarMesa}
                              >
                                <DoorOpen className="mr-2 h-4 w-4" />
                                Liberar mesa
                              </Button>
                            </>
                          ) : undefined}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="grid gap-2">
                {/* SEATED TABLE ACTIONS - Doblar Mesa (outside the yellow card) */}
                {status === 'seated' && reservations.length < 2 && (
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      onAction('reserve')
                      onOpenChange(false)
                    }}
                  >
                    <CalendarPlus className="mr-3 h-5 w-5" />
                    Doblar mesa
                  </Button>
                )}

                {/* AVAILABLE TABLE ACTIONS */}
                {status === 'available' && (
                  <>
                    <Button
                      variant="outline"
                      className="justify-start h-12"
                      onClick={() => {
                        onAction('reserve')
                        onOpenChange(false)
                      }}
                    >
                      <CalendarPlus className="mr-3 h-5 w-5" />
                      Crear Reserva
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-12"
                      onClick={handleSentarSinReserva}
                    >
                      <UserCheck className="mr-3 h-5 w-5" />
                      Sentar sin Reserva
                    </Button>
                  </>
                )}

                {/* RESERVED TABLE ACTIONS - Doblar mesa */}
                {status === 'reserved' && reservations.length < 2 && (
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      onAction('reserve')
                      onOpenChange(false)
                    }}
                  >
                    <CalendarPlus className="mr-3 h-5 w-5" />
                    Doblar mesa
                  </Button>
                )}

                {/* BLOCK/UNBLOCK - all statuses except blocked show block option */}
                {status !== 'blocked' ? (
                  <Button
                    variant="outline"
                    className="justify-start h-12 text-muted-foreground"
                    onClick={handleBlock}
                    disabled={loading}
                  >
                    {loading && !actioningReservationId ? <Spinner className="mr-3" /> : <Ban className="mr-3 h-5 w-5" />}
                    Bloquear Mesa
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={handleBlock}
                    disabled={loading}
                  >
                    {loading && !actioningReservationId ? <Spinner className="mr-3" /> : <Users className="mr-3 h-5 w-5" />}
                    Desbloquear Mesa
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : sheetView === 'comensales' ? (
          <>
            <DrawerHeader className="text-left pb-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 -ml-2"
                  onClick={() => setSheetView('actions')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <DrawerTitle>Cuantos comensales?</DrawerTitle>
                  <DrawerDescription>Mesa {table.label}</DrawerDescription>
                </div>
              </div>
            </DrawerHeader>

            <div className="px-4 pb-6 flex flex-col gap-6">
              {/* Comensales grid - 3 columns, numbers 1-12, 64x64px buttons */}
              <div className="grid grid-cols-3 gap-3 justify-items-center">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={cn(
                      "h-16 w-16 rounded-xl border-2 text-xl font-semibold transition-colors",
                      comensales === num
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:border-foreground/50"
                    )}
                    onClick={() => setComensales(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Optional guest info */}
              <Collapsible open={showGuestFields} onOpenChange={setShowGuestFields}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                    <span>+ Datos del cliente (opcional)</span>
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      showGuestFields && "rotate-180"
                    )} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <Input
                    placeholder="Nombre"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                  <Input
                    placeholder="Telefono"
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                </CollapsibleContent>
              </Collapsible>

              <Button
                size="lg"
                className="w-full h-14 text-lg"
                onClick={handleOpenMesaWithComensales}
                disabled={openingMesa}
              >
                {openingMesa ? 'Abriendo...' : 'Sentar mesa'}
              </Button>
            </div>
          </>
        ) : sheetView === 'next' ? (
          <>
            <DrawerHeader className="text-left pb-2">
              <DrawerTitle>Mesa {table.label} sentada</DrawerTitle>
              <DrawerDescription>
                {comensales} {comensales === 1 ? 'comensal' : 'comensales'}. ¿Tomar comanda ahora?
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 pb-6 flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-14 text-lg"
                onClick={handleNextTakeComanda}
              >
                Tomar comanda
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-14 text-lg"
                onClick={handleNextBackToMap}
              >
                Volver al mapa
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* fallback — shouldn't normally hit */}
          </>
        )}
      </DrawerContent>
      </Drawer>

      {/* First confirmation dialog */}
      <AlertDialog open={showFirstConfirm} onOpenChange={setShowFirstConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar mesa sin cobrar?</AlertDialogTitle>
            <AlertDialogDescription>
              {tableOpenOrder 
                ? `Esta mesa tiene una comanda de ${tableOpenOrder.total.toFixed(2)}€ sin cobrar.`
                : 'Esta mesa no tiene comanda abierta.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFirstConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second confirmation dialog */}
      <AlertDialog open={showSecondConfirm} onOpenChange={setShowSecondConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estas seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. La mesa se liberara y la comanda quedara cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFinalRelease}
              disabled={releasing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {releasing ? 'Liberando...' : 'Liberar sin cobrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
