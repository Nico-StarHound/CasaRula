// Minimal smoke test: print just "MESA 12" (~100px tall) using ESC *
// to confirm the printer accepts that bitmap mode.
//
// Usage: PRINTER_IP=192.168.0.27 npx tsx src/test-mini.ts

import 'dotenv/config'
import { sendChunksToPrinter } from './printer.js'
import { ESCPOS } from './escpos.js'
import { createTicketCanvas, canvasToMonoBitmap, drawText, drawHr, type CursorState } from './image-renderer.js'

const ip = process.env.PRINTER_IP || process.env.PRINTER_COCINA_IP
const port = Number(process.env.PRINTER_PORT || 9100)
const size = process.env.SIZE || 'small' // 'small' | 'medium' | 'large'
if (!ip) { console.error('Set PRINTER_IP'); process.exit(1) }

let canvasH = 144
if (size === 'medium') canvasH = 432
if (size === 'large')  canvasH = 720

const { canvas, ctx } = createTicketCanvas(canvasH)
const cursor: CursorState = { y: 24 }
drawText(ctx, cursor, 'MESA 12', { size: 80, bold: true, align: 'center' })

if (size !== 'small') {
  drawText(ctx, cursor, '4 PAX  ·  NICO  ·  13:42', { size: 26, align: 'center' })
  drawHr(ctx, cursor, { thickness: 2, marginY: 16 })
  drawText(ctx, cursor, '2x  CROQUETAS DE JAMON', { size: 36, bold: true })
  drawText(ctx, cursor, '1x  ENSALADILLA RUSA', { size: 36, bold: true })
}
if (size === 'large') {
  drawText(ctx, cursor, '1x  SOLOMILLO AL WHISKY', { size: 36, bold: true })
  drawText(ctx, cursor, '1x  PULPO A LA GALLEGA', { size: 36, bold: true })
  drawText(ctx, cursor, '2x  CHIPIRONES PLANCHA', { size: 36, bold: true })
  drawText(ctx, cursor, '1x  TORTILLA ESPANOLA', { size: 36, bold: true })
}

const { bitmap, width, height } = canvasToMonoBitmap(canvas)
console.log(`Size=${size}, bitmap ${width}x${height}`)

const e = new ESCPOS()
e.init()
e.rasterImageEscStar(bitmap, width, height)
e.feed(2).cut()

const chunks = e.buildChunks()
const total = chunks.reduce((s, c) => s + c.length, 0)
console.log(`Sending ${chunks.length} chunks, ${total} bytes to ${ip}:${port}`)

await sendChunksToPrinter({ ip: ip!, port }, chunks, 60)
console.log('Done.')
