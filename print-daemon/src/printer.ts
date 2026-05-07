// Send raw bytes to a network thermal printer over TCP:9100.

import net from 'node:net'

export interface PrinterTarget {
  ip: string
  port: number
}

const CONNECT_TIMEOUT_MS = 5000
const SEND_TIMEOUT_MS = 10000

export async function sendToPrinter(target: PrinterTarget, data: Buffer): Promise<void> {
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

    socket.connect(target.port, target.ip, () => {
      clearTimeout(connectTimer)

      const sendTimer = setTimeout(() => {
        fail(new Error(`Send timeout to ${target.ip}:${target.port}`))
      }, SEND_TIMEOUT_MS)

      socket.write(data, (err) => {
        if (err) {
          clearTimeout(sendTimer)
          return fail(err)
        }
        // Give printer a moment to chew through the buffer before closing
        setTimeout(() => {
          clearTimeout(sendTimer)
          socket.end(() => ok())
        }, 200)
      })
    })
  })
}
