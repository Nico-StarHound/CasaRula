'use client'

import type { RestaurantConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface TicketItem {
  name: string
  quantity: number
  price: number
}

interface TicketPreviewProps {
  config: RestaurantConfig | null
  restaurantName: string
  items?: TicketItem[]
  tableLabel?: string
  staffName?: string
  paymentMethod?: 'efectivo' | 'tarjeta' | 'mixto'
  amountPaid?: number
  change?: number
  ticketNumber?: string
  className?: string
}

export function TicketPreview({
  config,
  restaurantName,
  items = [],
  tableLabel = 'Otin',
  staffName = 'Maria',
  paymentMethod = 'efectivo',
  amountPaid = 100,
  change = 25.50,
  ticketNumber = 'T260403001',
  className,
}: TicketPreviewProps) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit' 
  })
  const timeStr = now.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })

  // Demo items if none provided
  const displayItems = items.length > 0 ? items : [
    { name: 'Muergos', quantity: 2, price: 22.00 },
    { name: 'Cachopo', quantity: 1, price: 25.00 },
    { name: 'Sorbete de limon', quantity: 1, price: 5.50 },
  ]

  const subtotal = displayItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const iva = subtotal * 0.10
  const total = subtotal + iva

  const formatPrice = (price: number) => `${price.toFixed(2)}€`

  return (
    <div className={cn(
      "bg-white text-black font-mono text-xs w-72 mx-auto p-4 shadow-lg rounded border",
      className
    )}>
      {/* Logo */}
      {config?.logo_url && (
        <div className="flex justify-center mb-3">
          <img 
            src={config.logo_url} 
            alt="Logo" 
            className="max-w-[200px] max-h-[60px] object-contain grayscale"
          />
        </div>
      )}

      {/* Restaurant Header */}
      <div className="text-center mb-3">
        <div className="font-bold text-sm uppercase tracking-wide">
          {restaurantName || 'CASA RULA'}
        </div>
        {config?.titular && (
          <div className="mt-1">{config.titular}</div>
        )}
        {config?.direccion && (
          <div>{config.direccion}</div>
        )}
        {(config?.codigo_postal || config?.ciudad) && (
          <div>
            {config.codigo_postal} {config.ciudad}
          </div>
        )}
        {config?.provincia && (
          <div>{config.provincia}</div>
        )}
        {config?.telefono && (
          <div>{config.telefono}</div>
        )}
        {config?.nif && (
          <div className="mt-1">NIF: {config.nif}</div>
        )}
      </div>

      {/* Ticket Info */}
      <div className="border-t border-dashed border-gray-400 pt-2 mb-2">
        <div className="flex justify-between">
          <span>N: {ticketNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Mesa: {tableLabel}</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex justify-between">
          <span>Hora entrada: {timeStr}</span>
        </div>
        <div>Atendido por: {staffName}</div>
      </div>

      {/* Items Header */}
      <div className="border-t border-dashed border-gray-400 pt-2 mb-1">
        <div className="flex text-[10px] font-bold">
          <span className="w-8">CANT</span>
          <span className="flex-1">DESCRIPCION</span>
          <span className="w-14 text-right">PVP</span>
          <span className="w-14 text-right">TOTAL</span>
        </div>
      </div>

      {/* Items */}
      <div className="mb-2">
        {displayItems.map((item, idx) => (
          <div key={idx} className="flex text-[11px]">
            <span className="w-8">{item.quantity}</span>
            <span className="flex-1 truncate">{item.name}</span>
            <span className="w-14 text-right">{formatPrice(item.price)}</span>
            <span className="w-14 text-right">{formatPrice(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-gray-400 pt-2">
        <div className="flex justify-end">
          <span className="w-24">Subtotal:</span>
          <span className="w-16 text-right">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-end">
          <span className="w-24">IVA 10%:</span>
          <span className="w-16 text-right">{formatPrice(iva)}</span>
        </div>
        <div className="flex justify-end font-bold">
          <span className="w-24">TOTAL:</span>
          <span className="w-16 text-right">{formatPrice(total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
        <div className="flex justify-end">
          <span className="w-24 capitalize">{paymentMethod}:</span>
          <span className="w-16 text-right">{formatPrice(amountPaid)}</span>
        </div>
        {paymentMethod === 'efectivo' && change > 0 && (
          <div className="flex justify-end">
            <span className="w-24">Cambio:</span>
            <span className="w-16 text-right">{formatPrice(change)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {config?.pie_ticket && (
        <div className="border-t border-dashed border-gray-400 pt-3 mt-3 text-center text-[10px]">
          {config.pie_ticket}
        </div>
      )}
    </div>
  )
}
