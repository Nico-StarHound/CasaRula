// Minimal ESC/POS command builder for thermal printers (Munbyn ITPP047P, Epson, Star, etc.)
// 80mm paper, 48 chars per line in normal width.

import iconv from 'iconv-lite'

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const LINE_WIDTH = 48 // chars at normal width on 80mm paper

// Munbyn ITPP047P uses its own codepage numbering (printed on its self-test page).
// Code 14 = CP858 on this model (NOT 19 as in Epson standard).
// CP858 = CP850 + Euro, covers ñ, áéíóú, ¿¡ and €.
const PRINTER_CODEPAGE = 'cp858'
const SET_CODEPAGE = Buffer.from([ESC, 0x74, 14]) // ESC t 14 = CP858 on Munbyn ITPP047P

export class ESCPOS {
  private chunks: Buffer[] = []

  init() {
    this.chunks.push(Buffer.from([ESC, 0x40])) // ESC @ — initialize
    this.chunks.push(SET_CODEPAGE)
    return this
  }

  text(s: string) {
    this.chunks.push(iconv.encode(s, PRINTER_CODEPAGE))
    return this
  }

  line(s = '') {
    return this.text(s).newline()
  }

  newline(n = 1) {
    for (let i = 0; i < n; i++) this.chunks.push(Buffer.from([LF]))
    return this
  }

  align(a: 'left' | 'center' | 'right') {
    const v = a === 'left' ? 0 : a === 'center' ? 1 : 2
    this.chunks.push(Buffer.from([ESC, 0x61, v]))
    return this
  }

  bold(on: boolean) {
    this.chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0]))
    return this
  }

  /** Width/height multiplier 1..8. Use {w:2,h:2} for big titles. */
  size(w: 1 | 2 | 3, h: 1 | 2 | 3) {
    const n = ((w - 1) << 4) | (h - 1)
    this.chunks.push(Buffer.from([GS, 0x21, n]))
    return this
  }

  resetSize() {
    return this.size(1, 1)
  }

  hr(char = '-') {
    return this.line(char.repeat(LINE_WIDTH))
  }

  /** Two-column row: left text and right text aligned to LINE_WIDTH. */
  row(left: string, right: string) {
    const space = Math.max(1, LINE_WIDTH - left.length - right.length)
    return this.line(left + ' '.repeat(space) + right)
  }

  cut() {
    // GS V 1 — partial cut. Some printers want full cut (0). Munbyn handles partial.
    this.chunks.push(Buffer.from([GS, 0x56, 1]))
    return this
  }

  feed(n = 3) {
    return this.newline(n)
  }

  /** Reverse video: white text on black background. Hugely visible. */
  invert(on: boolean) {
    this.chunks.push(Buffer.from([GS, 0x42, on ? 1 : 0]))
    return this
  }

  /** Beep — useful for kitchen tickets so cocina notice them */
  beep(times = 2, durationDeciseconds = 4) {
    this.chunks.push(Buffer.from([ESC, 0x42, times, durationDeciseconds]))
    return this
  }

  /**
   * Print a raster bitmap (1bpp, black/white).
   *
   * Uses GS v 0 (raster bit image command). For large images we slice the
   * bitmap into horizontal bands of MAX_BAND_HEIGHT rows and send each
   * with its own GS v 0 command — many small printers (Munbyn included)
   * have a limited image buffer and silently corrupt big single-shot
   * bitmaps, dumping the leftover bytes as garbage text.
   *
   * Input: a Buffer of width*height bits packed MSB-first into bytes.
   * Each bit = 1 means "print black pixel".
   *
   * widthPx must be a multiple of 8.
   */
  rasterImage(bitmap: Buffer, widthPx: number, heightPx: number) {
    const widthBytes = widthPx / 8
    if (!Number.isInteger(widthBytes)) {
      throw new Error(`rasterImage: width ${widthPx} must be multiple of 8`)
    }

    // Most ESC/POS printers handle ~256 row bands safely. We use 128 to be
    // extra conservative on the Munbyn ITPP047P.
    const MAX_BAND_HEIGHT = 128

    let rowOffset = 0
    while (rowOffset < heightPx) {
      const bandHeight = Math.min(MAX_BAND_HEIGHT, heightPx - rowOffset)
      const bandStart = rowOffset * widthBytes
      const bandEnd = bandStart + bandHeight * widthBytes
      const band = bitmap.subarray(bandStart, bandEnd)

      // GS v 0 m xL xH yL yH d1 d2 ... dk
      // m = 0 → normal mode (no horizontal/vertical scaling)
      const header = Buffer.from([
        GS, 0x76, 0x30, 0x00,
        widthBytes & 0xff, (widthBytes >> 8) & 0xff,
        bandHeight & 0xff, (bandHeight >> 8) & 0xff,
      ])
      this.chunks.push(header)
      this.chunks.push(band)

      rowOffset += bandHeight
    }
    return this
  }

  build(): Buffer {
    return Buffer.concat(this.chunks)
  }
}
