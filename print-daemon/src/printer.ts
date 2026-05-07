// Send raw bytes to a network thermal printer over TCP:9100.

import net from 'node:net'

export interface PrinterTarget {
  ip: string
  port: number
}

const CONNECT_TIMEOUT_MS = 5000
const SEND_TIMEOUT_MS = 30000 // raster images can take a while

/**
 * Send a payload to the printer. The payload is split into chunks (the
 * caller passes them) and we wait briefly between chunks so the printer's
 * input buffer can drain. This is what fixes the "first part prints fine,
 * rest comes out as garbage" symptom on small thermal printers — they
 * silently drop / misinterpret bytes when overrun.
 */
export async function sendChunksToPrinter(
  target: PrinterTarget,
  chunks: Buffer[],
  delayBetweenChunksMs = 60
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let settled = false

    const cleanup = () => {
      socket.removeAllListeners()
      socket.destroy()
    }

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const ok = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const connectTimer = setTimeout(() => {
      fail(new Error(`Connect timeout to ${target.ip}:${target.port}`))
    }, CONNECT_TIMEOUT_MS)

    socket.once('error', (err) => {
      clearTimeout(connectTimer)
      fail(err)
    })

    socket.connect(target.port, target.ip, async () => {
      clearTimeout(connectTimer)
      const sendTimer = setTimeout(() => {
        fail(new Error(`Send timeout to ${target.ip}:${target.port}`))
      }, SEND_TIMEOUT_MS)

      try {
        for (let i = 0; i < chunks.length; i++) {
          await new Promise<void>((res, rej) => {
            socket.write(chunks[i], (err) => err ? rej(err) : res())
          })
          if (i < chunks.length - 1 && delayBetweenChunksMs > 0) {
            await new Promise(r => setTimeout(r, delayBetweenChunksMs))
          }
        }
        // Let the printer chew through the last bytes before closing.
        await new Promise(r => setTimeout(r, 300))
        clearTimeout(sendTimer)
        socket.end(() => ok())
      } catch (err) {
        clearTimeout(sendTimer)
        fail(err as Error)
      }
    })
  })
}

/**
 * Backwards-compatible single-buffer send (for callers that pre-built
 * a flat Buffer). Internally it just calls sendChunksToPrinter with
 * one chunk and no delay.
 */
export async function sendToPrinter(target: PrinterTarget, data: Buffer): Promise<void> {
  return sendChunksToPrinter(target, [data], 0)
}
