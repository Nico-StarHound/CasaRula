// Quick test: send a sample ticket directly to a printer IP.
// Usage: PRINTER_IP=192.168.1.50 npx tsx src/test-print.ts
//
// If this works, the printer is reachable and ESC/POS-compatible.
// Then you can move on to running the full daemon.

import 'dotenv/config'
import { sendToPrinter } from './printer.js'
import { renderComanda, renderFactura } from './renderers.js'

const ip = process.env.PRINTER_IP || process.env.PRINTER_COCINA_IP
const port = Number(process.env.PRINTER_PORT || 9100)

if (!ip) {
  console.error('Set PRINTER_IP=x.x.x.x (or PRINTER_COCINA_IP in .env)')
  process.exit(1)
}

console.log(`Sending test ticket to ${ip}:${port}…`)

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

async function run() {
  const target = { ip: ip!, port }
  console.log('— Comanda cocina (con nota)')
  await sendToPrinter(target, sampleComandaNormal)
  console.log('— Comanda cocina (URGENTE)')
  await sendToPrinter(target, sampleComandaUrgente)
  console.log('— Factura')
  await sendToPrinter(target, sampleFactura)
  console.log('Done. ✓')
}

run().catch((e) => {
  console.error('Failed:', e.message)
  process.exit(1)
})
