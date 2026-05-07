// Print daemon main loop.
//
// Strategy:
//   1. Subscribe to Realtime INSERT/UPDATE on print_jobs
//   2. On any signal, drain the queue (claim_next_print_job RPC + print + mark done/error)
//   3. Also poll every 30s as a safety net in case Realtime drops a beat

import 'dotenv/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ESCPOS } from './escpos.js'
import { renderComanda, renderFactura, renderAnulacion, renderCuentaProvisional } from './renderers.js'
import { sendToPrinter, type PrinterTarget } from './printer.js'

const SUPABASE_URL = required('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const RESTAURANT_ID = required('RESTAURANT_ID')
const DRY_RUN = process.env.DRY_RUN === 'true'
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100)

const ENV_PRINTERS: Record<string, string | undefined> = {
  cocina: process.env.PRINTER_COCINA_IP,
  barra: process.env.PRINTER_BARRA_IP,
  caja: process.env.PRINTER_CAJA_IP,
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[daemon] Missing env var: ${name}`)
    process.exit(1)
  }
  return v
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------
// Resolve which printer to send a job to
// ---------------------------------------------------------------------
async function resolvePrinter(printerType: string): Promise<PrinterTarget | null> {
  // 1. .env override wins (handy for local testing)
  const envIp = ENV_PRINTERS[printerType]
  if (envIp) return { ip: envIp, port: PRINTER_PORT }

  // 2. Otherwise pick the first online printer of this type from DB
  const { data, error } = await supabase
    .from('printers')
    .select('ip_address, port')
    .eq('restaurant_id', RESTAURANT_ID)
    .eq('type', printerType)
    .eq('is_online', true)
    .limit(1)
    .single()

  if (error || !data) return null
  return { ip: data.ip_address, port: data.port || 9100 }
}

// ---------------------------------------------------------------------
// Process a single job
// ---------------------------------------------------------------------
async function processJob(job: {
  id: string
  kind: string
  printer_type: string
  payload: any
  attempts: number
  max_attempts: number
}): Promise<void> {
  console.log(`[daemon] processing job ${job.id} (${job.kind} → ${job.printer_type}, attempt ${job.attempts})`)

  try {
    // Render
    let bytes: Buffer
    switch (job.kind) {
      case 'comanda_cocina':
        bytes = renderComanda(job.payload, 'cocina')
        break
      case 'comanda_barra':
        bytes = renderComanda(job.payload, 'barra')
        break
      case 'anulacion':
        bytes = renderAnulacion(job.payload)
        break
      case 'factura':
        bytes = renderFactura(job.payload)
        break
      case 'cuenta_provisional':
        bytes = renderCuentaProvisional(job.payload)
        break
      case 'test':
        bytes = new ESCPOS().init().align('center').bold(true).line('CASA RULA - TEST OK').feed(3).cut().build()
        break
      default:
        throw new Error(`Unknown job kind: ${job.kind}`)
    }

    // Send
    if (DRY_RUN) {
      console.log(`[daemon] DRY_RUN — would print ${bytes.length} bytes:\n` + bytes.toString('latin1'))
    } else {
      const target = await resolvePrinter(job.printer_type)
      if (!target) {
        throw new Error(`No online printer of type "${job.printer_type}" found`)
      }
      await sendToPrinter(target, bytes)
    }

    // Success
    await supabase
      .from('print_jobs')
      .update({ status: 'done', completed_at: new Date().toISOString(), last_error: null })
      .eq('id', job.id)

    console.log(`[daemon] ✓ job ${job.id} done`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[daemon] ✗ job ${job.id} failed: ${msg}`)

    // If we've exhausted attempts mark as error so daemon stops retrying.
    // claim_next_print_job already incremented attempts when it claimed it.
    const finalStatus = job.attempts >= job.max_attempts ? 'error' : 'pending'

    await supabase
      .from('print_jobs')
      .update({
        status: finalStatus,
        last_error: msg,
        completed_at: finalStatus === 'error' ? new Date().toISOString() : null,
      })
      .eq('id', job.id)
  }
}

// ---------------------------------------------------------------------
// Drain the queue — keep claiming until nothing is left
// ---------------------------------------------------------------------
let draining = false
async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true

  try {
    while (true) {
      const { data: job, error } = await supabase.rpc('claim_next_print_job', {
        p_restaurant_id: RESTAURANT_ID,
      })

      if (error) {
        console.error('[daemon] claim error:', error.message)
        break
      }

      if (!job || !job.id) break // queue empty

      await processJob(job)
    }
  } finally {
    draining = false
  }
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main() {
  console.log('[daemon] starting')
  console.log(`[daemon] restaurant: ${RESTAURANT_ID}`)
  console.log(`[daemon] supabase:   ${SUPABASE_URL}`)
  console.log(`[daemon] dry-run:    ${DRY_RUN}`)
  for (const [type, ip] of Object.entries(ENV_PRINTERS)) {
    if (ip) console.log(`[daemon] printer ${type}: ${ip}:${PRINTER_PORT} (env override)`)
  }

  // Drain anything pending from before we started
  await drainQueue()

  // Subscribe to Realtime
  const channel = supabase
    .channel('print_jobs_watcher')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'print_jobs' },
      (payload) => {
        const newJob = payload.new as { restaurant_id?: string }
        if (newJob.restaurant_id !== RESTAURANT_ID) return
        console.log('[daemon] realtime: new job, draining…')
        drainQueue().catch((e) => console.error('[daemon] drain error:', e))
      }
    )
    .subscribe((status) => {
      console.log(`[daemon] realtime status: ${status}`)
    })

  // Safety net: poll every 30s in case realtime drops
  setInterval(() => {
    drainQueue().catch((e) => console.error('[daemon] poll drain error:', e))
  }, 30000)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[daemon] shutting down')
    await supabase.removeChannel(channel)
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('[daemon] fatal:', e)
  process.exit(1)
})
