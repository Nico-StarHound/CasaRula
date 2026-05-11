'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Receipt, Calendar, CreditCard, Banknote, Printer, RotateCcw, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketPreview } from '@/components/ticket-preview'
import { getTickets, getTicketsStats, applyRefund, reopenTicket, type Ticket } from '@/app/actions/tickets'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RestaurantConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface TicketsClientProps {
  initialTickets: Ticket[]
  initialStats: {
    total: number
    count: number
    efectivo: number
    tarjeta: number
    mixto: number
  }
  config: RestaurantConfig | null
}

type DateRange = 'hoy' | 'semana' | 'mes' | 'todo'

export function TicketsClient({ initialTickets, initialStats, config }: TicketsClientProps) {
  const router = useRouter()
  const [tickets, setTickets] = useState(initialTickets)
  const [stats, setStats] = useState(initialStats)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('hoy')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Refund state
  const [refundSheetOpen, setRefundSheetOpen] = useState(false)
  const [refundMode, setRefundMode] = useState<'item' | 'amount'>('item')
  const [selectedRefundItems, setSelectedRefundItems] = useState<number[]>([])
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMotivo, setRefundMotivo] = useState('')
  const [processingRefund, setProcessingRefund] = useState(false)

  // Reopen state
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [processingReopen, setProcessingReopen] = useState(false)

  const getDateRange = (range: DateRange): { from: string; to: string } => {
    const today = new Date()
    const to = today.toISOString().split('T')[0]
    
    switch (range) {
      case 'hoy':
        return { from: to, to }
      case 'semana': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return { from: weekAgo.toISOString().split('T')[0], to }
      }
      case 'mes': {
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return { from: monthAgo.toISOString().split('T')[0], to }
      }
      case 'todo':
        return { from: '2020-01-01', to }
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    startTransition(async () => {
      const { from, to } = getDateRange(dateRange)
      const results = await getTickets(50, 0, { 
        search: value || undefined, 
        dateFrom: from, 
        dateTo: to 
      })
      setTickets(results)
    })
  }

  const handleDateRangeChange = (value: DateRange) => {
    setDateRange(value)
    startTransition(async () => {
      const { from, to } = getDateRange(value)
      const [results, newStats] = await Promise.all([
        getTickets(50, 0, { 
          search: search || undefined, 
          dateFrom: from, 
          dateTo: to 
        }),
        getTicketsStats(from, to)
      ])
      setTickets(results)
      setStats(newStats)
    })
  }

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setSheetOpen(true)
  }

  const handlePrint = async () => {
    if (!selectedTicket) return
    // Placeholder for ESC/POS printing
    // Would fetch to printer IP stored in printers table
    console.log('[v0] Print ticket:', selectedTicket.numero)
    alert('Imprimiendo ticket ' + selectedTicket.numero)
  }

  const handleOpenRefund = () => {
    setRefundSheetOpen(true)
    setRefundMode('item')
    setSelectedRefundItems([])
    setRefundAmount('')
    setRefundMotivo('')
  }

  const getRefundTotal = () => {
    if (!selectedTicket) return 0
    if (refundMode === 'amount') {
      return parseFloat(refundAmount) || 0
    }
    return selectedRefundItems.reduce((sum, idx) => {
      const item = selectedTicket.items[idx]
      return sum + (item.price * item.quantity)
    }, 0)
  }

  const handleApplyRefund = async () => {
    if (!selectedTicket) return
    const amount = getRefundTotal()
    if (amount <= 0) return

    setProcessingRefund(true)
    await applyRefund(selectedTicket.id, amount, refundMotivo || undefined)
    
    // Update local state
    setTickets(prev => prev.map(t => 
      t.id === selectedTicket.id 
        ? { ...t, devolucion_aplicada: true, devolucion_importe: amount } as Ticket
        : t
    ))
    setSelectedTicket(prev => prev ? { ...prev, devolucion_aplicada: true, devolucion_importe: amount } as Ticket : null)
    
    setProcessingRefund(false)
    setRefundSheetOpen(false)
  }

  const handleReopen = async () => {
    if (!selectedTicket) return
    setProcessingReopen(true)
    const result = await reopenTicket(selectedTicket.id)
    if (result.success && result.table_id) {
      router.push(`/comandas/tomar/${result.table_id}`)
    }
    setProcessingReopen(false)
    setReopenDialogOpen(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPrice = (price: number) => `${price.toFixed(2)}€`

  const getPaymentBadge = (method: string | null) => {
    switch (method) {
      case 'efectivo':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Banknote className="h-3 w-3 mr-1" />Efectivo</Badge>
      case 'tarjeta':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><CreditCard className="h-3 w-3 mr-1" />Tarjeta</Badge>
      case 'mixto':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Mixto</Badge>
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="mb-3">
          <h1 className="text-xl font-bold">Tickets</h1>
          <p className="text-sm text-muted-foreground">Historico de cobros</p>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por numero o mesa..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dateRange} onValueChange={(v) => handleDateRangeChange(v as DateRange)}>
            <SelectTrigger className="w-32">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoy">Hoy</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mes</SelectItem>
              <SelectItem value="todo">Todo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-lg font-bold">{stats.count}</div>
            <div className="text-xs text-muted-foreground">Tickets</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{formatPrice(stats.efectivo)}</div>
            <div className="text-xs text-muted-foreground">Efectivo</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">{formatPrice(stats.tarjeta)}</div>
            <div className="text-xs text-muted-foreground">Tarjeta</div>
          </div>
          <div>
            <div className="text-lg font-bold">{formatPrice(stats.total)}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <main className="flex-1 overflow-y-auto">
        {isPending && (
          <div className="p-4 text-center text-muted-foreground">
            Cargando...
          </div>
        )}

        {!isPending && tickets.length === 0 && (
          <div className="p-8 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No hay tickets para mostrar</p>
          </div>
        )}

        <div className="divide-y">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => handleTicketClick(ticket)}
              className="w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{ticket.numero}</span>
                    {getPaymentBadge(ticket.payment_method)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {ticket.table_label && `Mesa ${ticket.table_label}`}
                    {ticket.comensales && ` · ${ticket.comensales} pax`}
                    {ticket.staff_name && ` · ${ticket.staff_name}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold">{formatPrice(ticket.total)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(ticket.created_at)} {formatTime(ticket.created_at)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Ticket Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ticket {selectedTicket?.numero}</SheetTitle>
          </SheetHeader>

          {selectedTicket && (
            <div className="mt-4 space-y-4">
              {/* Refund badge if applied */}
              {(selectedTicket as any).devolucion_aplicada && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">Devolucion aplicada</p>
                    <p className="text-sm text-amber-600">
                      {((selectedTicket as any).devolucion_importe || 0).toFixed(2)}€
                    </p>
                  </div>
                </div>
              )}

              {/* Reopened badge */}
              {(selectedTicket as any).reabierto && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-600" />
                  <p className="font-medium text-blue-700 dark:text-blue-400">Este ticket fue reabierto</p>
                </div>
              )}

              {/* Ticket Preview */}
              <TicketPreview
                config={config}
                restaurantName="Casa Rula"
                items={selectedTicket.items}
                tableLabel={selectedTicket.table_label || undefined}
                staffName={selectedTicket.staff_name || undefined}
                paymentMethod={selectedTicket.payment_method === 'mixto' ? 'efectivo' : (selectedTicket.payment_method || 'efectivo')}
                amountPaid={selectedTicket.efectivo_entregado || selectedTicket.total}
                change={selectedTicket.cambio || 0}
                ticketNumber={selectedTicket.numero}
              />

              {/* Actions */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={handlePrint}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir
                  </Button>
                </div>
                
                {!(selectedTicket as any).devolucion_aplicada && (
                  <Button 
                    variant="outline" 
                    className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={handleOpenRefund}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Devolucion
                  </Button>
                )}

                {!(selectedTicket as any).reabierto && (
                  <Button 
                    variant="outline" 
                    className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => setReopenDialogOpen(true)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reabrir ticket
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Refund Sheet */}
      <Sheet open={refundSheetOpen} onOpenChange={setRefundSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Aplicar devolucion</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                variant={refundMode === 'item' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setRefundMode('item')}
              >
                Por item
              </Button>
              <Button
                variant={refundMode === 'amount' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setRefundMode('amount')}
              >
                Por importe
              </Button>
            </div>

            {refundMode === 'item' && selectedTicket && (
              <ScrollArea className="max-h-[30vh]">
                <div className="space-y-2">
                  {selectedTicket.items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedRefundItems(prev => 
                          prev.includes(idx) 
                            ? prev.filter(i => i !== idx)
                            : [...prev, idx]
                        )
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg border transition-colors",
                        selectedRefundItems.includes(idx) 
                          ? "bg-amber-50 border-amber-500 dark:bg-amber-950/30"
                          : "hover:bg-muted"
                      )}
                    >
                      <span>{item.quantity}x {item.name}</span>
                      <div className="flex items-center gap-2">
                        <span>{(item.price * item.quantity).toFixed(2)}€</span>
                        {selectedRefundItems.includes(idx) && (
                          <Check className="h-4 w-4 text-amber-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {refundMode === 'amount' && (
              <Input
                type="number"
                  inputMode="decimal"
                placeholder="Importe a devolver"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="text-lg"
              />
            )}

            <Input
              placeholder="Motivo (opcional)"
              value={refundMotivo}
              onChange={(e) => setRefundMotivo(e.target.value)}
            />

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-muted-foreground">Total devolucion</span>
              <span className="text-xl font-bold text-amber-600">{getRefundTotal().toFixed(2)}€</span>
            </div>

            <Button 
              className="w-full bg-amber-500 hover:bg-amber-600"
              onClick={handleApplyRefund}
              disabled={getRefundTotal() <= 0 || processingRefund}
            >
              {processingRefund ? 'Aplicando...' : 'Aplicar devolucion'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reopen Dialog */}
      <AlertDialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              La mesa volvera a estar ocupada y la comanda quedara abierta de nuevo.
              Podras seguir anadiendo items o modificar el pedido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReopen}
              disabled={processingReopen}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {processingReopen ? 'Reabriendo...' : 'Reabrir ticket'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
