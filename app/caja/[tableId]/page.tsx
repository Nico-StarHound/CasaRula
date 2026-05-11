'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Tag, Gift, Banknote, CreditCard, Wallet, Users, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { getOrderForCaja, applyDiscount, removeDiscount, markAsInvitation, removeInvitation, releaseTableAfterPayment, type Order } from '@/app/actions/comandas'
import { createTicket, type TicketItem } from '@/app/actions/tickets'
import { getRestaurantConfig } from '@/app/actions/config'
import { getSession } from '@/app/actions/auth'
import { TicketPreview } from '@/components/ticket-preview'
import type { RestaurantConfig } from '@/lib/types'
import { Spinner } from '@/components/ui/spinner'
import { SessionWatcher } from '@/components/session-watcher'

interface OrderItemWithInvitation {
  id: string
  name: string
  price: number
  quantity: number
  status: string
  notes?: string
  es_invitacion?: boolean
  invitacion_motivo?: string
}

export default function CajaTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItemWithInvitation[]>([])
  const [tableInfo, setTableInfo] = useState<{ label: string; zone: string } | null>(null)
  const [discount, setDiscount] = useState<{ tipo: string; valor: number; motivo: string | null } | null>(null)
  const [config, setConfig] = useState<RestaurantConfig | null>(null)
  const [staffName, setStaffName] = useState('')

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'mixto' | null>(null)
  const [efectivoEntregado, setEfectivoEntregado] = useState('')
  const [efectivoMixto, setEfectivoMixto] = useState('')
  const [tarjetaMixto, setTarjetaMixto] = useState('')
  const [processing, setProcessing] = useState(false)

  // Discount sheet state
  const [discountSheetOpen, setDiscountSheetOpen] = useState(false)
  const [discountType, setDiscountType] = useState<'porcentaje' | 'importe'>('porcentaje')
  const [discountValue, setDiscountValue] = useState('')
  const [discountMotivo, setDiscountMotivo] = useState('')

  // Invitation sheet state
  const [invitationSheetOpen, setInvitationSheetOpen] = useState(false)
  const [selectedInvitations, setSelectedInvitations] = useState<string[]>([])
  const [invitationMotivo, setInvitationMotivo] = useState('')

  // Split bill state
  const [splitSheetOpen, setSplitSheetOpen] = useState(false)
  const [splitCount, setSplitCount] = useState(2)
  const [splitPaid, setSplitPaid] = useState<boolean[]>([])

  useEffect(() => {
    async function load() {
      const [orderData, configData, session] = await Promise.all([
        getOrderForCaja(tableId),
        getRestaurantConfig(),
        getSession()
      ])
      
      if (orderData?.order) {
        setOrder(orderData.order)
        setItems(orderData.order.items as OrderItemWithInvitation[])
        setTableInfo(orderData.table)
        setDiscount(orderData.discount)
      }
      setConfig(configData)
      setStaffName(session?.staff?.name || 'Desconocido')
      setLoading(false)
    }
    load()
  }, [tableId])

  // Calculate totals
  const subtotalBruto = items
    .filter(i => !i.es_invitacion)
    .reduce((sum, i) => sum + i.price * i.quantity, 0)
  
  const invitadoTotal = items
    .filter(i => i.es_invitacion)
    .reduce((sum, i) => sum + i.price * i.quantity, 0)

  let descuentoAmount = 0
  if (discount) {
    if (discount.tipo === 'porcentaje') {
      descuentoAmount = subtotalBruto * (discount.valor / 100)
    } else {
      descuentoAmount = discount.valor
    }
  }

  const subtotal = subtotalBruto - descuentoAmount
  const iva = subtotal * 0.10
  const total = subtotal + iva

  const cambio = paymentMethod === 'efectivo' && efectivoEntregado 
    ? Math.max(0, parseFloat(efectivoEntregado) - total) 
    : 0

  const splitAmount = total / splitCount

  // Handle discount
  const handleApplyDiscount = async () => {
    if (!order || !discountValue) return
    await applyDiscount(
      order.id, 
      discountType, 
      parseFloat(discountValue),
      discountMotivo || undefined
    )
    setDiscount({
      tipo: discountType,
      valor: parseFloat(discountValue),
      motivo: discountMotivo || null
    })
    setDiscountSheetOpen(false)
    setDiscountValue('')
    setDiscountMotivo('')
  }

  const handleRemoveDiscount = async () => {
    if (!order) return
    await removeDiscount(order.id)
    setDiscount(null)
  }

  // Handle invitation
  const handleApplyInvitation = async () => {
    if (!order || selectedInvitations.length === 0) return
    await markAsInvitation(selectedInvitations, invitationMotivo || undefined)
    // Update local state
    setItems(prev => prev.map(item => 
      selectedInvitations.includes(item.id) 
        ? { ...item, es_invitacion: true, invitacion_motivo: invitationMotivo }
        : item
    ))
    setInvitationSheetOpen(false)
    setSelectedInvitations([])
    setInvitationMotivo('')
  }

  const handleRemoveInvitation = async (itemId: string) => {
    await removeInvitation(itemId)
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, es_invitacion: false, invitacion_motivo: undefined }
        : item
    ))
  }

  // Handle payment
  const handleCobrar = async () => {
    if (!order || !paymentMethod) return
    setProcessing(true)

    const ticketItems: TicketItem[] = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.es_invitacion ? 0 : item.price
    }))

    const ticket = await createTicket({
      order_id: order.id,
      table_label: tableInfo?.label || 'Mesa',
      staff_name: staffName,
      comensales: order.comensales,
      items: ticketItems,
      payment_method: paymentMethod,
      efectivo_entregado: paymentMethod === 'efectivo' ? parseFloat(efectivoEntregado) : undefined,
    })

    if (ticket) {
      // Release only the current seated reservation (not all - table could be doblada)
      await releaseTableAfterPayment(tableId)
      window.location.href = '/mapa'
    }
    setProcessing(false)
  }

  // Check if can cobrar
  const canCobrar = paymentMethod && (
    (paymentMethod === 'tarjeta') ||
    (paymentMethod === 'efectivo' && parseFloat(efectivoEntregado) >= total) ||
    (paymentMethod === 'mixto' && parseFloat(efectivoMixto || '0') + parseFloat(tarjetaMixto || '0') >= total)
  )

  // Check if all split persons paid
  const allSplitPaid = splitPaid.length === splitCount && splitPaid.every(Boolean)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No hay comanda abierta para esta mesa</p>
        <Link href="/mapa">
          <Button>Volver al mapa</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SessionWatcher />
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href={`/comandas/tomar/${tableId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Cobrar - Mesa {tableInfo?.label}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {order.comensales} comensales
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left panel - Order summary */}
        <div className="flex-1 lg:w-[60%] flex flex-col border-r">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Items list */}
              <div className="space-y-2">
                {items.map(item => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "flex items-center justify-between py-2 px-3 rounded-lg",
                      item.es_invitacion && "bg-green-50 dark:bg-green-950/30"
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.quantity}x</span>
                        <span className={cn(item.es_invitacion && "line-through text-muted-foreground")}>
                          {item.name}
                        </span>
                        {item.es_invitacion && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Invitacion
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium",
                        item.es_invitacion && "line-through text-muted-foreground"
                      )}>
                        {(item.price * item.quantity).toFixed(2)}€
                      </span>
                      {item.es_invitacion && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveInvitation(item.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Discount display */}
              {discount && (
                <div className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-400">
                      Descuento {discount.tipo === 'porcentaje' ? `${discount.valor}%` : `${discount.valor}€`}
                    </span>
                    {discount.motivo && (
                      <span className="text-xs text-muted-foreground">({discount.motivo})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      -{descuentoAmount.toFixed(2)}€
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleRemoveDiscount}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Invited items total */}
              {invitadoTotal > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">Invitaciones</span>
                  </div>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    -{invitadoTotal.toFixed(2)}€
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Sheet open={discountSheetOpen} onOpenChange={setDiscountSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="flex-1 gap-2">
                      <Tag className="h-4 w-4" />
                      Descuento
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-auto">
                    <SheetHeader>
                      <SheetTitle>Aplicar descuento</SheetTitle>
                      <SheetDescription>Introduce el descuento a aplicar</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex gap-2">
                        <Button
                          variant={discountType === 'porcentaje' ? 'default' : 'outline'}
                          className="flex-1"
                          onClick={() => setDiscountType('porcentaje')}
                        >
                          Porcentaje %
                        </Button>
                        <Button
                          variant={discountType === 'importe' ? 'default' : 'outline'}
                          className="flex-1"
                          onClick={() => setDiscountType('importe')}
                        >
                          Importe fijo €
                        </Button>
                      </div>
                      <Input
                        type="number"
                        placeholder={discountType === 'porcentaje' ? 'Ej: 10' : 'Ej: 5.00'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                      />
                      <Input
                        placeholder="Motivo (opcional)"
                        value={discountMotivo}
                        onChange={(e) => setDiscountMotivo(e.target.value)}
                      />
                      <Button className="w-full" onClick={handleApplyDiscount} disabled={!discountValue}>
                        Aplicar descuento
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>

                <Sheet open={invitationSheetOpen} onOpenChange={setInvitationSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="flex-1 gap-2">
                      <Gift className="h-4 w-4" />
                      Invitacion
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-auto max-h-[80vh]">
                    <SheetHeader>
                      <SheetTitle>Marcar como invitacion</SheetTitle>
                      <SheetDescription>Selecciona los items a invitar</SheetDescription>
                    </SheetHeader>
                    <ScrollArea className="max-h-[40vh]">
                      <div className="space-y-2 py-4">
                        {items.filter(i => !i.es_invitacion).map(item => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedInvitations(prev => 
                                prev.includes(item.id) 
                                  ? prev.filter(id => id !== item.id)
                                  : [...prev, item.id]
                              )
                            }}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-lg border transition-colors",
                              selectedInvitations.includes(item.id) 
                                ? "bg-green-50 border-green-500 dark:bg-green-950/30"
                                : "hover:bg-muted"
                            )}
                          >
                            <span>{item.quantity}x {item.name}</span>
                            <div className="flex items-center gap-2">
                              <span>{(item.price * item.quantity).toFixed(2)}€</span>
                              {selectedInvitations.includes(item.id) && (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="space-y-3 pb-4">
                      <Input
                        placeholder="Motivo (opcional)"
                        value={invitationMotivo}
                        onChange={(e) => setInvitationMotivo(e.target.value)}
                      />
                      <Button 
                        className="w-full" 
                        onClick={handleApplyInvitation} 
                        disabled={selectedInvitations.length === 0}
                      >
                        Aplicar invitacion ({selectedInvitations.length} items)
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </ScrollArea>

          {/* Totals */}
          <div className="flex-shrink-0 border-t p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{subtotal.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA 10%</span>
              <span>{iva.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-xl font-bold pt-2 border-t">
              <span>TOTAL</span>
              <span>{total.toFixed(2)}€</span>
            </div>
          </div>
        </div>

        {/* Right panel - Payment */}
        <div className="lg:w-[40%] flex flex-col bg-muted/20 p-4">
          {/* Total display */}
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground">Total a cobrar</p>
            <p className="text-4xl font-bold">{total.toFixed(2)}€</p>
          </div>

          {/* Payment method buttons */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Button
              variant={paymentMethod === 'efectivo' ? 'default' : 'outline'}
              className="h-20 flex-col gap-1"
              onClick={() => setPaymentMethod('efectivo')}
            >
              <Banknote className="h-6 w-6" />
              <span>Efectivo</span>
            </Button>
            <Button
              variant={paymentMethod === 'tarjeta' ? 'default' : 'outline'}
              className="h-20 flex-col gap-1"
              onClick={() => setPaymentMethod('tarjeta')}
            >
              <CreditCard className="h-6 w-6" />
              <span>Tarjeta</span>
            </Button>
            <Button
              variant={paymentMethod === 'mixto' ? 'default' : 'outline'}
              className="h-20 flex-col gap-1"
              onClick={() => setPaymentMethod('mixto')}
            >
              <Wallet className="h-6 w-6" />
              <span>Mixto</span>
            </Button>
          </div>

          {/* Efectivo input */}
          {paymentMethod === 'efectivo' && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-muted-foreground">Efectivo entregado</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={efectivoEntregado}
                  onChange={(e) => setEfectivoEntregado(e.target.value)}
                  className="text-2xl h-14 text-center"
                  autoFocus
                />
              </div>
              {parseFloat(efectivoEntregado) >= total && (
                <div className="text-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">Cambio</p>
                  <p className="text-2xl font-bold text-green-600">{cambio.toFixed(2)}€</p>
                </div>
              )}
            </div>
          )}

          {/* Mixto inputs */}
          {paymentMethod === 'mixto' && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-muted-foreground">Efectivo</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={efectivoMixto}
                  onChange={(e) => setEfectivoMixto(e.target.value)}
                  className="text-xl h-12"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Tarjeta</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={tarjetaMixto}
                  onChange={(e) => setTarjetaMixto(e.target.value)}
                  className="text-xl h-12"
                />
              </div>
            </div>
          )}

          {/* Split bill button */}
          <Sheet open={splitSheetOpen} onOpenChange={setSplitSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full mb-4 gap-2">
                <Users className="h-4 w-4" />
                Dividir cuenta
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto">
              <SheetHeader>
                <SheetTitle>Dividir cuenta</SheetTitle>
                <SheetDescription>Entre cuantas personas?</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                    disabled={splitCount <= 2}
                  >
                    -
                  </Button>
                  <span className="text-4xl font-bold w-16 text-center">{splitCount}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSplitCount(Math.min(10, splitCount + 1))
                      setSplitPaid([])
                    }}
                    disabled={splitCount >= 10}
                  >
                    +
                  </Button>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Cada persona paga</p>
                  <p className="text-2xl font-bold">{splitAmount.toFixed(2)}€</p>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: splitCount }).map((_, i) => (
                    <Button
                      key={i}
                      variant={splitPaid[i] ? 'default' : 'outline'}
                      className={cn(
                        "h-16 flex-col",
                        splitPaid[i] && "bg-green-500 hover:bg-green-600"
                      )}
                      onClick={() => {
                        const newPaid = [...splitPaid]
                        newPaid[i] = !newPaid[i]
                        setSplitPaid(newPaid)
                      }}
                    >
                      <span className="text-lg">{i + 1}</span>
                      {splitPaid[i] && <Check className="h-4 w-4" />}
                    </Button>
                  ))}
                </div>
                {allSplitPaid && (
                  <p className="text-center text-green-600 font-medium">
                    Todos han pagado
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Cobrar button */}
          <Button 
            className="w-full h-14 text-lg bg-green-500 hover:bg-green-600"
            onClick={handleCobrar}
            disabled={!canCobrar || processing}
          >
            {processing ? <Spinner className="mr-2" /> : null}
            {processing ? 'Procesando...' : `Cobrar ${total.toFixed(2)}€`}
          </Button>

          {/* Ticket preview */}
          <div className="mt-6 hidden lg:block">
            <p className="text-sm text-muted-foreground mb-2 text-center">Vista previa</p>
            <TicketPreview
              config={config}
              restaurantName={config?.titular || 'Casa Rula'}
              items={items.map(i => ({ name: i.name, quantity: i.quantity, price: i.es_invitacion ? 0 : i.price }))}
              tableLabel={tableInfo?.label}
              staffName={staffName}
              paymentMethod={paymentMethod || 'efectivo'}
              amountPaid={parseFloat(efectivoEntregado) || total}
              change={cambio}
              className="transform scale-90 origin-top"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
