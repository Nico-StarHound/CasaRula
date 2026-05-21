'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Banknote, CreditCard, Wallet, Check, X, AlertTriangle, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getOrderForCaja,
  releaseTableAfterPayment,
  type Order,
} from '@/app/actions/comandas'
import { emitirTicket, type TicketItem } from '@/app/actions/tickets'
import { getSession } from '@/app/actions/auth'
import { Spinner } from '@/components/ui/spinner'

// =====================================================================
// /caja/[tableId] — pantalla final de COBRO
//
// Esta pantalla SOLO procesa el pago. Las invitaciones, descuentos,
// split y la proforma viven en /cuenta/[tableId]. La cajera entra
// aquí cuando el cliente ya está listo para pagar.
//
// Flujo:
//   1. Elegir método: efectivo / tarjeta / mixto
//   2. (Si efectivo) introducir entregado para calcular cambio
//   3. (Opcional) Botón "Factura completa" — abre modal de cliente
//   4. Pulsar Cobrar → modal de confirmación → emitir ticket fiscal
//
// El toggle entre simplificada (S, default) y completa (F) sigue la
// estrategia A2: el flujo principal NO pregunta tipo de factura. Solo
// si el cliente lo solicita expresamente, la cajera abre el formulario
// de "Factura completa" y mete NIF/nombre/dirección. Esto evita
// fricción en el 95% de cobros que son simplificadas anónimas.
// =====================================================================

interface OrderItemWithInvitation {
  id: string
  name: string
  quantity: number
  price: number
  es_invitacion?: boolean
}

// Validación NIF/CIF/NIE española básica. No es la oficial completa
// (la letra de control es opcional aquí), pero coge la mayoría de
// errores de tipeo. Para validación oficial habría que calcular el
// dígito de control con el algoritmo de Hacienda — lo dejamos para
// cuando se conecte Verifactu, que ya lo hará automáticamente.
function isValidNif(nif: string): boolean {
  const v = nif.trim().toUpperCase()
  // Persona física: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(v)) return true
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return true
  // CIF: letra + 7 dígitos + dígito/letra
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[\dA-J]$/.test(v)) return true
  return false
}

export default function CajaPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItemWithInvitation[]>([])
  const [tableInfo, setTableInfo] = useState<{ label: string; zone: string } | null>(null)
  const [staffName, setStaffName] = useState('')

  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'mixto' | null>(null)
  const [efectivoEntregado, setEfectivoEntregado] = useState('')
  const [efectivoMixto, setEfectivoMixto] = useState('')
  const [tarjetaMixto, setTarjetaMixto] = useState('')

  // Datos del cliente para factura completa. Solo se envían si el
  // cajero ha activado el modo "completa".
  const [emitirCompleta, setEmitirCompleta] = useState(false)
  const [clienteOpen, setClienteOpen] = useState(false)
  const [clienteNif, setClienteNif] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [clienteError, setClienteError] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  // Persistent error if the charge fails. We refuse to navigate or
  // claim success unless the server returned a real ticket.
  const [chargeError, setChargeError] = useState<string | null>(null)
  // Confirmation modal — emitting a ticket is fiscally irreversible
  // (the only "undo" is a rectificativa). We make the cashier confirm.
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Load order on mount.
  useEffect(() => {
    const load = async () => {
      const [orderData, session] = await Promise.all([
        getOrderForCaja(tableId),
        getSession(),
      ])
      if (orderData && orderData.order && orderData.table) {
        setOrder(orderData.order)
        setItems(orderData.order.items as OrderItemWithInvitation[])
        setTableInfo(orderData.table)
      }
      if (session?.staff?.name) setStaffName(session.staff.name)
      setLoading(false)
    }
    load()
  }, [tableId])

  // Totals — mirror what /cuenta computed. We don't re-apply discounts
  // here because those mutations already happened upstream and were
  // persisted on the order rows.
  // Los precios ya incluyen IVA (10% hostelería). Total = lo que paga
  // el cliente. Desglosamos base e IVA solo para mostrar y guardar
  // ticket fiscal.
  const total = items
    .filter(i => !i.es_invitacion)
    .reduce((sum, item) => sum + item.price * item.quantity, 0)
  const base = total / 1.10
  const iva = total - base

  // Cambio = 0 siempre. Antes pediamos efectivo entregado para calcular
  // vuelta, pero el camarero lo hace mental con el cliente delante y
  // no necesita la app para eso. Simplificado: solo marcar metodo.
  const cambio = 0

  const canCobrar = paymentMethod !== null && (
    (paymentMethod === 'tarjeta') ||
    (paymentMethod === 'efectivo') ||
    (paymentMethod === 'mixto' && parseFloat(efectivoMixto || '0') + parseFloat(tarjetaMixto || '0') >= total)
  )

  // Open the cliente modal. If user re-opens after first filling it in,
  // we keep the previous values so they don't lose typing.
  const handleAbrirCompleta = () => {
    setClienteError(null)
    setClienteOpen(true)
  }

  // Validate the cliente form before accepting it. NIF format,
  // non-empty nombre/direccion. We re-validate at submit time too in
  // case the cashier edits something after confirming.
  const handleConfirmarCliente = () => {
    setClienteError(null)
    if (!clienteNif.trim() || !clienteNombre.trim() || !clienteDireccion.trim()) {
      setClienteError('Los tres campos son obligatorios para emitir factura completa.')
      return
    }
    if (!isValidNif(clienteNif)) {
      setClienteError('NIF/CIF/NIE no válido. Revisa el formato.')
      return
    }
    setEmitirCompleta(true)
    setClienteOpen(false)
  }

  const handleQuitarCompleta = () => {
    setEmitirCompleta(false)
    setClienteOpen(false)
  }

  // Click on "Cobrar" → open the confirmation modal. We do NOT bill yet.
  const handleClickCobrar = () => {
    if (!canCobrar) return
    setChargeError(null)
    setConfirmOpen(true)
  }

  // Confirm → emit the fiscal ticket. This is the point of no return.
  const handleConfirmarCobro = async () => {
    if (!order || !paymentMethod) return
    setConfirmOpen(false)
    setProcessing(true)
    setChargeError(null)

    const ticketItems: TicketItem[] = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.es_invitacion ? 0 : item.price,
    }))

    try {
      const ticket = await emitirTicket({
        order_id: order.id,
        serie: emitirCompleta ? 'F' : 'S',
        table_label: tableInfo?.label || 'Mesa',
        staff_name: staffName,
        comensales: order.comensales,
        items: ticketItems,
        payment_method: paymentMethod,
        efectivo_entregado: undefined,
        cliente: emitirCompleta
          ? {
              nif: clienteNif.trim().toUpperCase(),
              nombre: clienteNombre.trim(),
              direccion: clienteDireccion.trim(),
            }
          : null,
      })

      if (!ticket) {
        setChargeError('No se pudo registrar el cobro. Vuelve a intentarlo.')
        setProcessing(false)
        return
      }

      // Release only the current seated reservation (not all — table could be doblada).
      await releaseTableAfterPayment(tableId)
      window.location.href = '/mapa'
    } catch (e) {
      console.error('[handleConfirmarCobro]', e)
      setChargeError('Sin conexión o error del servidor. El cobro NO se ha registrado. Reintenta cuando recuperes la red.')
      setProcessing(false)
    }
  }

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
      {/* Error banner — persistent until user dismisses */}
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
            <Link href={`/cuenta/${tableId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Cobrar · Mesa {tableInfo?.label}</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
        {/* Total — front and center */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">Total a cobrar</p>
          <p className="text-5xl font-bold">{total.toFixed(2)}€</p>
        </div>

        {/* Indicador de factura completa si está activa.
            Es visible y con opción de quitar porque emitir una completa
            cuando el cliente no la quería es un error caro (genera R+F
            para arreglarlo). */}
        {emitirCompleta && (
          <div className="mb-4 rounded-lg border border-primary bg-primary/5 p-3 flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Factura completa</p>
              <p className="text-xs text-muted-foreground truncate">
                {clienteNombre} · {clienteNif}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClienteOpen(true)}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleQuitarCompleta}
              aria-label="Quitar factura completa"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Botón factura completa (cuando aún no está activa) */}
        {!emitirCompleta && (
          <Button
            variant="outline"
            className="w-full mb-4 gap-2"
            onClick={handleAbrirCompleta}
          >
            <FileText className="h-4 w-4" />
            Factura completa (con datos del cliente)
          </Button>
        )}

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

        {/* Antes habia un input 'Efectivo entregado' + calculo de cambio
            cuando paymentMethod === 'efectivo'. Quitado a peticion del
            usuario: el camarero hace la vuelta de cabeza con el cliente
            delante, no necesita la app para eso. Solo marca el metodo
            y cobra. */}

        {/* Mixto inputs */}
        {paymentMethod === 'mixto' && (
          <div className="space-y-4 mb-6">
            <div>
              <Label htmlFor="mix-efectivo">Efectivo</Label>
              <Input
                id="mix-efectivo"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={efectivoMixto}
                onChange={(e) => setEfectivoMixto(e.target.value)}
                className="text-xl h-12"
              />
            </div>
            <div>
              <Label htmlFor="mix-tarjeta">Tarjeta</Label>
              <Input
                id="mix-tarjeta"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={tarjetaMixto}
                onChange={(e) => setTarjetaMixto(e.target.value)}
                className="text-xl h-12"
              />
            </div>
          </div>
        )}

        {/* Cobrar */}
        <Button
          className={cn(
            "w-full h-14 text-lg gap-2",
            emitirCompleta
              ? "bg-primary hover:bg-primary/90"
              : "bg-green-500 hover:bg-green-600"
          )}
          onClick={handleClickCobrar}
          disabled={!canCobrar || processing}
        >
          {processing ? <Spinner className="mr-2" /> : <Check className="h-5 w-5" />}
          {processing
            ? 'Procesando...'
            : emitirCompleta
              ? `Emitir factura ${total.toFixed(2)}€`
              : `Cobrar ${total.toFixed(2)}€`}
        </Button>
      </div>

      {/* Confirmación final — punto de no retorno.
          Después de OK aquí se inserta un ticket fiscal en BD; si fue
          un error se necesita una rectificativa para anularlo. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cobro</DialogTitle>
            <DialogDescription>
              Se emitirá {emitirCompleta ? 'una factura completa' : 'un ticket simplificado'}{' '}
              por <strong>{total.toFixed(2)}€</strong>. Esta acción no se puede deshacer
              sin emitir una rectificativa.
            </DialogDescription>
          </DialogHeader>
          {emitirCompleta && (
            <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
              <p><strong>NIF:</strong> {clienteNif}</p>
              <p><strong>Nombre:</strong> {clienteNombre}</p>
              <p><strong>Dirección:</strong> {clienteDireccion}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarCobro}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formulario factura completa */}
      <Dialog open={clienteOpen} onOpenChange={setClienteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Datos para factura completa</DialogTitle>
            <DialogDescription>
              Los tres campos son obligatorios. La AEAT requiere NIF,
              nombre / razón social y dirección completos para que la
              factura sea válida para el cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="cli-nif">NIF / CIF / NIE</Label>
              <Input
                id="cli-nif"
                value={clienteNif}
                onChange={e => setClienteNif(e.target.value.toUpperCase())}
                placeholder="B12345678"
                autoComplete="off"
                className="uppercase"
              />
            </div>
            <div>
              <Label htmlFor="cli-nombre">Nombre / Razón social</Label>
              <Input
                id="cli-nombre"
                value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)}
                placeholder="Mariscos del Sella S.L."
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="cli-dir">Dirección completa</Label>
              <Input
                id="cli-dir"
                value={clienteDireccion}
                onChange={e => setClienteDireccion(e.target.value)}
                placeholder="Calle Mayor 12, 33500 Llanes, Asturias"
                autoComplete="off"
              />
            </div>
            {clienteError && (
              <p className="text-sm text-destructive">{clienteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClienteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarCliente}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
