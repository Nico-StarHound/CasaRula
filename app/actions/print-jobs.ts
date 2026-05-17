'use server'

// Print jobs queue helpers.
// All print operations go through here so the daemon can pick them up.

import { createServiceClient } from '@/lib/supabase/service'

export type PrintJobKind =
  | 'comanda_cocina'
  | 'comanda_barra'
  | 'anulacion'
  | 'factura'
  | 'rectificativa'
  | 'cuenta_provisional'
  | 'test'

export type PrinterType = 'cocina' | 'barra' | 'caja'

interface EnqueueArgs {
  restaurantId: string
  kind: PrintJobKind
  printerType: PrinterType
  payload: Record<string, unknown>
  orderId?: string | null
  ticketId?: string | null
}

/**
 * Inserts a print job into the queue. The daemon (via Realtime)
 * will pick it up and print it. Failures here are logged but
 * never throw — printing must not break order flow.
 */
export async function enqueuePrintJob(args: EnqueueArgs): Promise<{ success: boolean; jobId?: string }> {
  try {
    const supabase = createServiceClient()

    // Resolve the active printer for this type (single source of truth = the
    // printers table). If none is configured, we still enqueue — the daemon
    // will record a 'no printer configured' error. This way the absence of
    // a configured printer is visible/diagnosable rather than silent.
    const { data: printer } = await supabase
      .from('printers')
      .select('id')
      .eq('restaurant_id', args.restaurantId)
      .eq('type', args.printerType)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('print_jobs')
      .insert({
        restaurant_id: args.restaurantId,
        kind: args.kind,
        printer_type: args.printerType,
        printer_id: printer?.id ?? null,
        payload: args.payload,
        order_id: args.orderId || null,
        ticket_id: args.ticketId || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[print_jobs] enqueue failed:', error.message)
      return { success: false }
    }

    return { success: true, jobId: data.id }
  } catch (e) {
    console.error('[print_jobs] enqueue exception:', e)
    return { success: false }
  }
}

/**
 * Builds the payload for a kitchen/bar comanda ticket.
 * Daemon receives this and renders ESC/POS.
 */
export interface ComandaTicketItem {
  name: string
  quantity: number
  notes?: string | null
  modifiers?: { name: string }[]
}

export interface ComandaPayload {
  table_label: string
  staff_name: string | null
  comensales: number
  nota_mesa: string | null
  urgente: boolean
  items: ComandaTicketItem[]
  printed_at: string
}

/**
 * Builds the payload for a sale ticket (factura simplificada).
 */
export interface FacturaPayload {
  numero: string
  table_label: string
  staff_name: string | null
  comensales: number
  items: { name: string; quantity: number; price: number }[]
  subtotal: number
  iva: number
  total: number
  payment_method: 'efectivo' | 'tarjeta' | 'mixto'
  efectivo_entregado: number | null
  cambio: number | null
  printed_at: string
  // Pulled from restaurant_config when daemon renders, but we send a snapshot
  restaurant: {
    name: string
    nif?: string | null
    direccion?: string | null
    telefono?: string | null
    pie_ticket?: string | null
  }
}

/**
 * Payload for an anulación (item cancelled after being sent to kitchen/bar).
 * Cocina/barra need to retire the dish.
 */
export interface AnulacionPayload {
  table_label: string
  staff_name: string | null
  motivo: string | null
  items: { name: string; quantity: number }[]
  printed_at: string
}
