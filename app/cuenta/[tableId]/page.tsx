'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Tag, Gift, CreditCard, Users, Check, X, AlertTriangle, Printer, FileText } from 'lucide-react'
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
import { getOrderForCaja, applyDiscount, removeDiscount, markAsInvitation, removeInvitation, printCuentaProvisional, type Order } from '@/app/actions/comandas'
import { getRestaurantConfig } from '@/app/actions/config'
import { getSession } from '@/app/actions/auth'
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
  const [processing, setProcessing] = useState(false)
  // Persistent error banner if proforma print or any mutation fails.
  const [chargeError, setChargeError] = useState<string | null>(null)

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
  // Split mode toggle. 'equal' is the legacy "Nx personas / total / N"
  // logic that was already here. 'byItem' is the new flow where every
  // item is assigned to one person (or left as "Compartido") and we
  // compute a per-person subtotal. Stored as state so the staff can
  // flip between them without losing what they entered.
  const [splitMode, setSplitMode] = useState<'equal' | 'byItem'>('equal')
  // itemId -> personaIdx (1-based). Items not in this map are
  // "shared" and split equally between everyone. We key by item.id
  // (database row id), which is stable for the lifetime of the order.
  const [itemAssignment, setItemAssignment] = useState<Record<string, number>>({})

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

  // Los precios de menu_items YA INCLUYEN IVA (10% hostelería).
  // Por tanto:
  //   - subtotalBruto = suma de precios * cantidades = TOTAL CON IVA ya dentro
  //   - tras descuento: el "total final" es subtotal (lo que paga el cliente)
  //   - base imponible: total / 1.10
  //   - iva: total - base
  // Antes el código hacía `total = subtotal + subtotal*0.10` lo que SUMABA un
  // 10% extra encima de un precio que ya tenía IVA dentro, cobrando 10% de más.
  const subtotal = subtotalBruto - descuentoAmount
  const total = subtotal                        // lo que paga el cliente
  const base = total / 1.10                     // base imponible (sin IVA)
  const iva = total - base                      // IVA desglosado

  const splitAmount = total / splitCount

  // Compute per-person totals for the by-item split.
  // Rules:
  //   - Each charged item belongs either to a specific person (entry in
  //     itemAssignment) or to "shared".
  //   - Invitation items are free for everyone; we skip them.
  //   - Shared items are split evenly across the personas.
  //   - We pro-rate discount and IVA proportionally to each person's
  //     gross subtotal so the sum exactly matches `total`.
  // Returns an array of per-person totals (length = splitCount).
  function computeByItemTotals(): number[] {
    if (subtotalBruto <= 0) return Array(splitCount).fill(0)

    const personGross = Array(splitCount).fill(0)
    let sharedGross = 0

    for (const item of items) {
      if (item.es_invitacion) continue
      const lineTotal = item.price * item.quantity
      const assigned = itemAssignment[item.id]
      if (assigned && assigned >= 1 && assigned <= splitCount) {
        personGross[assigned - 1] += lineTotal
      } else {
        sharedGross += lineTotal
      }
    }
    const sharedPerPerson = sharedGross / splitCount
    for (let i = 0; i < splitCount; i++) personGross[i] += sharedPerPerson

    // Pro-rate del descuento. ratio = total/subtotalBruto. Sin
    // descuento ratio=1. Con descuento ratio<1, todos pagan proporcional.
    // IVA está dentro del precio así que no se reparte aparte, va dentro
    // del lineTotal de cada item.
    const ratio = total / subtotalBruto
    return personGross.map(g => g * ratio)
  }

  const byItemTotals = splitMode === 'byItem' ? computeByItemTotals() : []
  // Sum to double-check we match `total` (rounding-safe).
  const byItemSum = byItemTotals.reduce((s, n) => s + n, 0)

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

  // Navigate to the cobro screen. From here on no fiscal mutation happens
  // until the cashier confirms the payment in /caja. We just hand off the
  // current state (items, discounts, invitations have already been
  // persisted on the order) — /caja will read it fresh.
  const handleIrACobrar = () => {
    if (!order) return
    router.push(`/caja/${tableId}`)
  }

  // Print the provisional bill (proforma).
  // Does NOT issue any fiscal document. Marks the order as having
  // requested the bill so the floor view shows the "cuenta pedida"
  // visual cue. Idempotent — can be printed multiple times.
  const handleImprimirProforma = async () => {
    if (!order) return
    setProcessing(true)
    setChargeError(null)
    try {
      const res = await printCuentaProvisional(order.id)
      if (!res.success) {
        setChargeError('No se pudo imprimir la proforma. Vuelve a intentarlo.')
      }
    } catch (e) {
      console.error('[handleImprimirProforma]', e)
      setChargeError('Sin conexión. La proforma no se ha enviado a la impresora.')
    } finally {
      setProcessing(false)
    }
  }

  // Can we go to charge? Total must be > 0 (zero-total orders are
  // all-invitation; nothing to charge — we just release the table from
  // the map, not from this screen).
  const canGoToCobro = total > 0

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

      {/* Charge error banner — persistent, top of screen.
          Critical: payment confirmation must NEVER be falsely positive.
          If the network was flaky during cobro, the camarero needs to
          see this and retry, not assume the customer paid. */}
      {chargeError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{chargeError}</div>
          <button
            onClick={() => setChargeError(null)}
            className="flex-shrink-0 hover:opacity-80"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
              <h1 className="text-lg font-semibold">Cuenta · Mesa {tableInfo?.label}</h1>
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
                        inputMode="decimal"
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

          {/* Totals.
              Los precios YA INCLUYEN IVA. Mostramos:
                - Base imponible (sin IVA)
                - IVA 10%
                - TOTAL (lo que paga el cliente, IVA incluido)
              Base + IVA = TOTAL. Antes el código sumaba IVA encima del
              subtotal y el cliente pagaba 10% de más. */}
          <div className="flex-shrink-0 border-t p-4 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Base imponible</span>
              <span>{base.toFixed(2)}€</span>
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
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-4xl font-bold">{total.toFixed(2)}€</p>
          </div>

          {/* Split bill button */}
          <Sheet open={splitSheetOpen} onOpenChange={setSplitSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full mb-4 gap-2">
                <Users className="h-4 w-4" />
                Dividir cuenta
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Dividir cuenta</SheetTitle>
                <SheetDescription>Elige modo y número de personas</SheetDescription>
              </SheetHeader>

              {/* Mode toggle. Equal = legacy total / N. ByItem = each item
                  assigned to one person; shared items split among all. */}
              <div className="flex gap-2 mt-4 mb-4">
                <Button
                  type="button"
                  variant={splitMode === 'equal' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSplitMode('equal')}
                >
                  Equitativo
                </Button>
                <Button
                  type="button"
                  variant={splitMode === 'byItem' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSplitMode('byItem')}
                >
                  Por items
                </Button>
              </div>

              {/* Persona count selector — shared across both modes */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSplitCount(Math.max(2, splitCount - 1))
                    setSplitPaid([])
                  }}
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

              {splitMode === 'equal' ? (
                <div className="space-y-4 pb-4">
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
              ) : (
                <div className="space-y-4 pb-4">
                  {/* By-item assignment.
                      Each item shows the persona buttons inline; tapping a
                      number toggles that item to that person. Tapping the
                      currently-selected number un-assigns back to "shared".
                      We render "shared" badge when no assignment so staff
                      can tell at a glance which items are split. */}
                  <p className="text-xs text-muted-foreground">
                    Toca un número para asignar el plato a esa persona.
                    Los platos sin asignar se reparten entre todos.
                  </p>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {items.filter(it => !it.es_invitacion).map(item => {
                      const assigned = itemAssignment[item.id]
                      return (
                        <div key={item.id} className="flex items-center gap-2 border rounded-md p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {item.quantity}× {item.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {(item.price * item.quantity).toFixed(2)}€
                              {!assigned && ' · Compartido'}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {Array.from({ length: splitCount }).map((_, i) => {
                              const personaIdx = i + 1
                              const isOn = assigned === personaIdx
                              return (
                                <button
                                  key={personaIdx}
                                  type="button"
                                  className={cn(
                                    "h-9 w-9 rounded text-sm font-semibold border transition-colors",
                                    isOn
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background hover:bg-muted"
                                  )}
                                  onClick={() => {
                                    setItemAssignment(prev => {
                                      const next = { ...prev }
                                      if (isOn) delete next[item.id]
                                      else next[item.id] = personaIdx
                                      return next
                                    })
                                  }}
                                >
                                  {personaIdx}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Per-person totals */}
                  <div className="border-t pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {byItemTotals.map((t, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded border p-2 flex items-center justify-between",
                            splitPaid[i] && "bg-green-50 dark:bg-green-950/30 border-green-500"
                          )}
                          onClick={() => {
                            const newPaid = [...splitPaid]
                            newPaid[i] = !newPaid[i]
                            setSplitPaid(newPaid)
                          }}
                          role="button"
                        >
                          <span className="text-sm font-medium">Persona {i + 1}</span>
                          <span className="flex items-center gap-1">
                            <span className="font-bold">{t.toFixed(2)}€</span>
                            {splitPaid[i] && <Check className="h-4 w-4 text-green-600" />}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Suma personas</span>
                      <span>{byItemSum.toFixed(2)}€ / {total.toFixed(2)}€</span>
                    </div>
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>

          {/* Action buttons:
              - "Imprimir proforma" — no fiscal, papel térmico solo. Idempotente.
              - "Cobrar" — abandona /cuenta para abrir /caja, donde se elige
                metodo de pago y se emite el ticket fiscal.
              Las dos acciones se separan porque cumplen propósitos
              distintos: la proforma es para que el cliente vea su
              cuenta antes de pagar; el cobro es el evento fiscal real
              que solo debe ocurrir cuando confirma el pago. */}
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-14 text-lg gap-2"
              onClick={handleImprimirProforma}
              disabled={processing || total <= 0}
            >
              {processing ? <Spinner className="mr-2" /> : <Printer className="h-5 w-5" />}
              Imprimir proforma
            </Button>
            <Button
              className="w-full h-14 text-lg bg-green-500 hover:bg-green-600 gap-2"
              onClick={handleIrACobrar}
              disabled={!canGoToCobro || processing}
            >
              <CreditCard className="h-5 w-5" />
              Cobrar {total.toFixed(2)}€
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
