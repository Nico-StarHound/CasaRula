// Render tickets as images using @napi-rs/canvas, then convert to the
// 1-bit-per-pixel bitmap format that ESC/POS thermal printers expect.

import { createCanvas, type SKRSContext2D, type Canvas } from '@napi-rs/canvas'

// Munbyn ITPP047P: 80mm paper, 203 dpi → ~576 printable px wide.
// Must be multiple of 8 for ESC/POS raster command.
export const PRINT_WIDTH_PX = 576

/**
 * Create a fresh canvas of the given height (and full print width).
 * Returns canvas + 2D context, with white background already filled
 * and black as the default ink color.
 */
export function createTicketCanvas(heightPx: number): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(PRINT_WIDTH_PX, heightPx)
  const ctx = canvas.getContext('2d') as SKRSContext2D
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, PRINT_WIDTH_PX, heightPx)
  ctx.fillStyle = 'black'
  ctx.textBaseline = 'top'
  return { canvas, ctx }
}

/**
 * Convert a canvas to a 1-bit-per-pixel bitmap (MSB-first) ready for
 * the ESC/POS GS v 0 command. Pixels with luminance < 128 become "ink".
 */
export function canvasToMonoBitmap(canvas: Canvas): { bitmap: Buffer; width: number; height: number } {
  const ctx = canvas.getContext('2d') as SKRSContext2D
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const src = imageData.data // RGBA bytes

  if (width % 8 !== 0) {
    throw new Error(`Canvas width ${width} must be multiple of 8 for raster image`)
  }

  const widthBytes = width / 8
  const out = Buffer.alloc(widthBytes * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Luminance (perceived). White paper = no ink, dark = ink.
      const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
      const alpha = src[i + 3]
      const isInk = alpha > 128 && lum < 128
      if (isInk) {
        const byteIdx = y * widthBytes + (x >> 3)
        const bitIdx = 7 - (x & 7) // MSB first
        out[byteIdx] |= 1 << bitIdx
      }
    }
  }

  return { bitmap: out, width, height }
}

// =====================================================================
// Drawing helpers (a small DSL on top of canvas) so renderers stay readable
// =====================================================================

export interface CursorState {
  y: number // current Y in px, advances as we draw
}

export const FONT = {
  // System fonts on macOS: "Helvetica" is bundled and renders cleanly.
  // For the Windows build we'll bundle a TTF (Inter or similar) and load it
  // via GlobalFonts.registerFromPath at startup.
  sans: 'Helvetica',
  sansBold: 'Helvetica',
  mono: 'Menlo',
}

/** Draw a horizontal line across the page at current cursor. */
export function drawHr(ctx: SKRSContext2D, cursor: CursorState, opts: { dashed?: boolean; thickness?: number; marginY?: number } = {}) {
  const { dashed = false, thickness = 2, marginY = 12 } = opts
  cursor.y += marginY
  ctx.save()
  ctx.strokeStyle = 'black'
  ctx.lineWidth = thickness
  if (dashed) ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(8, cursor.y)
  ctx.lineTo(PRINT_WIDTH_PX - 8, cursor.y)
  ctx.stroke()
  ctx.restore()
  cursor.y += marginY
}

/** Add vertical space. */
export function space(cursor: CursorState, px: number) {
  cursor.y += px
}

interface TextOpts {
  size: number          // px
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  paddingX?: number     // horizontal padding from edges (default 16)
  invert?: boolean      // white text on black band, full width
  invertPaddingY?: number // vertical padding inside the inverted band
  letterSpacing?: number
}

/** Draw a single line of text and advance cursor by line height. */
export function drawText(ctx: SKRSContext2D, cursor: CursorState, text: string, opts: TextOpts) {
  const padX = opts.paddingX ?? 16
  const family = opts.bold ? FONT.sansBold : FONT.sans
  const weight = opts.bold ? 'bold' : 'normal'
  ctx.font = `${weight} ${opts.size}px ${family}`

  const lineHeight = Math.round(opts.size * 1.18)

  if (opts.invert) {
    const padY = opts.invertPaddingY ?? Math.round(opts.size * 0.25)
    const bandHeight = opts.size + padY * 2
    ctx.fillStyle = 'black'
    ctx.fillRect(0, cursor.y, PRINT_WIDTH_PX, bandHeight)
    ctx.fillStyle = 'white'
    ctx.textAlign = opts.align ?? 'center'
    const x = textX(opts.align ?? 'center', padX)
    ctx.fillText(text, x, cursor.y + padY)
    ctx.fillStyle = 'black'
    cursor.y += bandHeight
  } else {
    ctx.fillStyle = 'black'
    ctx.textAlign = opts.align ?? 'left'
    const x = textX(opts.align ?? 'left', padX)
    ctx.fillText(text, x, cursor.y)
    cursor.y += lineHeight
  }
}

function textX(align: 'left' | 'center' | 'right', padX: number): number {
  if (align === 'center') return PRINT_WIDTH_PX / 2
  if (align === 'right') return PRINT_WIDTH_PX - padX
  return padX
}

/**
 * Two-column row: label on left, value on right, both at the same baseline.
 * Auto-wraps long labels (rare in our tickets).
 */
export function drawRow(ctx: SKRSContext2D, cursor: CursorState, left: string, right: string, opts: { size: number; bold?: boolean; padX?: number }) {
  const padX = opts.padX ?? 16
  const weight = opts.bold ? 'bold' : 'normal'
  ctx.font = `${weight} ${opts.size}px ${FONT.sans}`
  ctx.fillStyle = 'black'

  ctx.textAlign = 'left'
  ctx.fillText(left, padX, cursor.y)
  ctx.textAlign = 'right'
  ctx.fillText(right, PRINT_WIDTH_PX - padX, cursor.y)

  cursor.y += Math.round(opts.size * 1.18)
}

/**
 * Wrap text to fit within (PRINT_WIDTH_PX - padX*2). Returns the lines
 * that were drawn so the caller can know how much vertical space was used.
 */
export function drawWrappedText(ctx: SKRSContext2D, cursor: CursorState, text: string, opts: TextOpts & { indentX?: number }): string[] {
  const padX = opts.paddingX ?? 16
  const indentX = opts.indentX ?? 0
  const startX = padX + indentX
  const maxWidth = PRINT_WIDTH_PX - padX - startX
  const family = opts.bold ? FONT.sansBold : FONT.sans
  const weight = opts.bold ? 'bold' : 'normal'
  ctx.font = `${weight} ${opts.size}px ${family}`
  ctx.fillStyle = 'black'
  ctx.textAlign = 'left'

  const lineHeight = Math.round(opts.size * 1.18)
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const w of words) {
    const test = current ? current + ' ' + w : w
    if (ctx.measureText(test).width <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)

  for (const line of lines) {
    ctx.fillText(line, startX, cursor.y)
    cursor.y += lineHeight
  }

  return lines
}
