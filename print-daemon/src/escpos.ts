// Minimal ESC/POS command builder for thermal printers (Munbyn ITPP047P, Epson, Star, etc.)
// 80mm paper, 48 chars per line in normal width.

import iconv from 'iconv-lite'

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const LINE_WIDTH = 48 // chars at normal width on 80mm paper

// Munbyn ITPP047P ignores ESC t (codepage select) and stays on its factory default.
// Empirically that default is CP437 on this model, which already covers ñ, áéíóú and €.
// We encode our strings to CP437 so the bytes match what the printer expects.
const PRINTER_CODEPAGE = 'cp437'

export class ESCPOS {
  private chunks: Buffer[] = []

  init() {
    this.chunks.push(Buffer.from([ESC, 0x40])) // ESC @ — initialize
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

  /** Beep — useful for kitchen tickets so cocina notice them */
  beep(times = 2, durationDeciseconds = 4) {
    this.chunks.push(Buffer.from([ESC, 0x42, times, durationDeciseconds]))
    return this
  }

  build(): Buffer {
    return Buffer.concat(this.chunks)
  }
}
