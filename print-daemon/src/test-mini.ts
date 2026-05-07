// Minimal smoke test: print just "MESA 12" (~100px tall) using ESC *
// to confirm the printer accepts that bitmap mode.
//
// Usage: PRINTER_IP=192.168.0.27 npx tsx src/test-mini.ts

import 'dotenv/config'
import { sendChunksToPrinter } from './printer.js'
import { ESCPOS } from './escpos.js'
import { createTicketCanvas, canvasToMonoBitmap, drawText, type CursorState } from './image-renderer.js'

const ip = process.env.PRINTER_IP || process.env.PRINTER_COCINA_IP
const port = Number(process.env.PRINTER_PORT || 9100)
if (!ip) { console.error('Set PRINTER_IP'); process.exit(1) }

// Tiny canvas: just MESA 12, 144px tall
const { canvas, ctx } = createTicketCanvas(144)
const cursor: CursorState = { y: 24 }
drawText(ctx, cursor, 'MESA 12', { size: 80, bold: true, align: 'center' })

const { bitmap, width, height } = canvasToMonoBitmap(canvas)
console.log(`Bitmap: ${width}x${height}`)

const e = new ESCPOS()
e.init()
e.rasterImageEscStar(bitmap, width, height)
e.feed(2).cut()

const chunks = e.buildChunks()
const total = chunks.reduce((s, c) => s + c.length, 0)
console.log(`Sending ${chunks.length} chunks, ${total} bytes to ${ip}:${port}`)

await sendChunksToPrinter({ ip: ip!, port }, chunks, 60)
console.log('Done.')
