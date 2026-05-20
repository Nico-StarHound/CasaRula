// Print daemon main loop.
//
// Strategy:
//   1. Subscribe to Realtime INSERT/UPDATE on print_jobs
//   2. On any signal, drain the queue (claim_next_print_job RPC + print + mark done/error)
//   3. Also poll every 30s as a safety net in case Realtime drops a beat

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ESCPOS } from './escpos.js'
import { renderComanda, renderFactura, renderAnulacion, renderCuentaProvisional, renderRectificativa, renderReclamacion } from './renderers.js'
import { sendChunksToPrinter, type PrinterTarget } from './printer.js'

const SUPABASE_URL = required('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const RESTAURANT_ID = required('RESTAURANT_ID')
const DRY_RUN = process.env.DRY_RUN === 'true'
const DEBUG_DUMP = process.env.DEBUG_DUMP === 'true' || DRY_RUN
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100)
const CHUNK_DELAY_MS = Number(process.env.CHUNK_DELAY_MS || 30)

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

import WebSocket from 'ws'

// Supabase Realtime espera el constructor global de WebSocket. Node
// 20 (que es el que embebe Electron 33) NO trae uno nativo —
// llegó en Node 22. Sin esto, el daemon crashea al instanciar el
// cliente con "Node.js 20 detected without native WebSocket support".
// Polyfill: parchear el global ANTES de crear el cliente. Lo hacemos
// con un cast no genérico para no enredarse con tipos.
;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------
// Resolve which printer to send a job to
//
// Strategy (the new printers table is the single source of truth):
//   1. If the job has printer_id, look that exact row up.
//   2. Otherwise look up the active printer by type for our restaurant.
//   3. Last resort: PRINTER_<TYPE>_IP env override (kept only for the
//      bootstrap case where the printers table is empty).
// ---------------------------------------------------------------------
async function resolvePrinter(
  printerType: string,
  printerId: string | null
): Promise<PrinterTarget | null> {
  if (printerId) {
    const { data } = await supabase
      .from('printers')
      .select('ip, port, enabled')
      .eq('id', printerId)
      .maybeSingle()
    if (data?.enabled && data.ip) {
      return { ip: data.ip, port: data.port || 9100 }
    }
    // printer_id was stamped on the job but the printer is now gone/disabled.
    // Fall through to type lookup.
  }

  const { data } = await supabase
    .from('printers')
    .select('ip, port')
    .eq('restaurant_id', RESTAURANT_ID)
    .eq('type', printerType)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()
  if (data?.ip) {
    return { ip: data.ip, port: data.port || 9100 }
  }

  // Last-resort env override (only useful when the printers table is empty)
  const envIp = ENV_PRINTERS[printerType]
  if (envIp) return { ip: envIp, port: PRINTER_PORT }

  return null
}

// ---------------------------------------------------------------------
// Process a single job
// ---------------------------------------------------------------------
async function processJob(job: {
  id: string
  kind: string
  printer_type: string
  printer_id: string | null
  payload: any
  attempts: number
  max_attempts: number
}): Promise<void> {
  console.log(`[daemon] processing job ${job.id} (${job.kind} → ${job.printer_type}, attempt ${job.attempts})`)

  try {
    // Render
    let escpos: ESCPOS
    switch (job.kind) {
      case 'comanda_cocina':
        escpos = renderComanda(job.payload, 'cocina')
        break
      case 'comanda_barra':
        escpos = renderComanda(job.payload, 'barra')
        break
      case 'anulacion':
        escpos = renderAnulacion(job.payload)
        break
      case 'factura':
        escpos = renderFactura(job.payload)
        break
      case 'rectificativa':
        escpos = renderRectificativa(job.payload)
        break
      case 'cuenta_provisional':
        escpos = renderCuentaProvisional(job.payload)
        break
      case 'reclamacion':
        escpos = renderReclamacion(job.payload)
        break
      case 'test':
        escpos = new ESCPOS().init().align('center').bold(true).line('CASA RULA - TEST OK').feed(3).cut()
        break
      default:
        throw new Error(`Unknown job kind: ${job.kind}`)
    }

    const chunks = escpos.buildChunks()
    const totalBytes = chunks.reduce((s, c) => s + c.length, 0)

    // Dump raw ESC/POS to disk for inspection (always when DRY_RUN, optional otherwise)
    if (DEBUG_DUMP) {
      const dumpDir = '/tmp'
      const dumpPath = path.join(dumpDir, `casarula-last-print-${job.kind}.bin`)
      fs.writeFileSync(dumpPath, Buffer.concat(chunks))
      console.log(`[daemon] DEBUG: dumped ${totalBytes} bytes to ${dumpPath}`)
    }

    // Send
    if (DRY_RUN) {
      console.log(`[daemon] DRY_RUN — would send ${chunks.length} chunks (${totalBytes} bytes)`)
    } else {
      const target = await resolvePrinter(job.printer_type, job.printer_id)
      if (!target) {
        throw new Error(`No printer configured for type "${job.printer_type}"`)
      }
      console.log(`[daemon] sending ${chunks.length} chunks (${totalBytes} bytes) to ${target.ip}:${target.port}`)
      await sendChunksToPrinter(target, chunks, CHUNK_DELAY_MS)
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
