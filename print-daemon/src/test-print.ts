// Quick test: send a sample ticket directly to a printer IP.
// Usage:
//   PRINTER_IP=192.168.1.50 npm run test:print               # all 3 (uses paper!)
//   PRINTER_IP=192.168.1.50 ONLY=normal npm run test:print   # just one
//   ONLY=normal DRY_RUN=true npm run test:print              # NO printing, dump bin only
//
// In DRY_RUN, no bytes go to the printer. The raw ESC/POS is dumped to
// /tmp/casarula-test-*.bin so we can inspect it without wasting paper.

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { sendChunksToPrinter } from './printer.js'
import { renderComanda, renderFactura } from './renderers.js'
import { ESCPOS } from './escpos.js'

const ip = process.env.PRINTER_IP || process.env.PRINTER_COCINA_IP
const port = Number(process.env.PRINTER_PORT || 9100)
const dryRun = process.env.DRY_RUN === 'true'
const only = (process.env.ONLY || 'all').toLowerCase() // 'normal' | 'urgente' | 'factura' | 'all'
const chunkDelay = Number(process.env.CHUNK_DELAY_MS || 60)

if (!ip && !dryRun) {
  console.error('Set PRINTER_IP=x.x.x.x (or PRINTER_COCINA_IP in .env), or use DRY_RUN=true')
  process.exit(1)
}

console.log(dryRun
  ? 'DRY RUN — nothing will be sent to the printer'
  : `Sending test ticket(s) to ${ip}:${port}…`)

const sampleComandaNormal = renderComanda(
  {
    table_label: '12',
    staff_name: 'Nico',
    comensales: 4,
    nota_mesa: 'Niño con alergia a frutos secos',
    urgente: false,
    items: [
      { name: 'Croquetas de jamón', quantity: 2, modifiers: [], notes: 'Sin perejil' },
      { name: 'Ensaladilla rusa', quantity: 1, modifiers: [] },
      { name: 'Solomillo al whisky', quantity: 1, modifiers: [{ name: 'Poco hecho' }] },
    ],
    printed_at: new Date().toISOString(),
  },
  'cocina'
)

const sampleComandaUrgente = renderComanda(
  {
    table_label: '7',
    staff_name: 'Maria',
    comensales: 2,
    nota_mesa: null,
    urgente: true,
    items: [
      { name: 'Tortilla española', quantity: 1, modifiers: [] },
      { name: 'Pulpo a la gallega', quantity: 1, modifiers: [] },
    ],
    printed_at: new Date().toISOString(),
  },
  'cocina'
)

const sampleFactura = renderFactura({
  numero: 'T251207001',
  table_label: '12',
  staff_name: 'Nico',
  comensales: 4,
  items: [
    { name: 'Croquetas de jamón', quantity: 2, price: 12.0 },
    { name: 'Ensaladilla rusa', quantity: 1, price: 8.5 },
    { name: 'Solomillo al whisky', quantity: 1, price: 18.0 },
    { name: 'Vino tinto Rioja crianza', quantity: 1, price: 22.0 },
  ],
  subtotal: 54.09,
  iva: 5.41,
  total: 60.5,
  payment_method: 'efectivo',
  efectivo_entregado: 70.0,
  cambio: 9.5,
  printed_at: new Date().toISOString(),
  restaurant: {
    name: 'CASA RULA',
    nif: 'B12345678',
    direccion: 'Calle Real 1, 33500 Llanes, Asturias',
    telefono: '985 40 00 00',
    pie_ticket: 'Gracias por su visita',
  },
})

async function send(label: string, escpos: ESCPOS, kind: string) {
  const chunks = escpos.buildChunks()
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const dumpPath = path.join('/tmp', `casarula-test-${kind}.bin`)
  fs.writeFileSync(dumpPath, Buffer.concat(chunks))
  console.log(`— ${label}: ${chunks.length} chunks · ${total} bytes · dumped to ${dumpPath}`)
  if (dryRun) return
  await sendChunksToPrinter({ ip: ip!, port }, chunks, chunkDelay)
}

async function run() {
  if (only === 'all' || only === 'normal') {
    await send('Comanda cocina (con nota)', sampleComandaNormal, 'comanda-normal')
  }
  if (only === 'all' || only === 'urgente') {
    await send('Comanda cocina (URGENTE)', sampleComandaUrgente, 'comanda-urgente')
  }
  if (only === 'all' || only === 'factura') {
    await send('Factura', sampleFactura, 'factura')
  }
  console.log('Done. ✓')
}

run().catch((e) => {
  console.error('Failed:', e.message)
  process.exit(1)
})
