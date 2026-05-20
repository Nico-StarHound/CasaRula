'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Printer, Download, ChevronDown, ChevronUp } from 'lucide-react'

// URL del .dmg en Supabase Storage. El bucket "downloads" tiene que
// existir y ser público. Subes el archivo con el nombre exacto
// "casarula-print.dmg" cada vez que generes una versión nueva — la
// URL no cambia, así que el botón siempre apunta a la última.
//
// Para subir desde el Mac:
//   1. supabase login (una vez)
//   2. supabase storage cp \\
//        ./print-daemon-app/release/Casa\\ Rula\\ Print-0.1.0-arm64.dmg \\
//        ss:///downloads/casarula-print.dmg \\
//        --project-ref ryjnwzkrsodgadvqucqa
//
// O desde el dashboard de Supabase → Storage → downloads → Upload.
const DMG_URL =
  'https://ryjnwzkrsodgadvqucqa.supabase.co/storage/v1/object/public/downloads/casarula-print.dmg'

/**
 * Settings card para descargar la app de impresión de macOS.
 *
 * "Casa Rula Print" es una app Electron que vive en el menubar del
 * iMac y ejecuta el daemon de impresión (consume print_jobs de
 * Supabase y manda ESC/POS a las impresoras térmicas Munbyn).
 *
 * Solo necesario en UN ordenador del restaurante — típicamente el iMac
 * de la oficina, que está siempre encendido. Los TPVs (tablets) no
 * necesitan instalar nada: la impresión la hace el daemon en backend.
 */
export function MacAppCard() {
  const [showInstructions, setShowInstructions] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Printer className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle>App de impresión (macOS)</CardTitle>
            <CardDescription>
              Necesaria en el ordenador que actúa como puente con las impresoras
              térmicas. Se instala una sola vez en un Mac que esté siempre
              encendido (típicamente el de la oficina) y trabaja en segundo
              plano desde la barra de menú.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button asChild className="w-full sm:w-auto" size="lg">
          <a href={DMG_URL} download="casarula-print.dmg">
            <Download className="mr-2 h-4 w-4" />
            Descargar app para Mac
          </a>
        </Button>

        <button
          type="button"
          onClick={() => setShowInstructions(s => !s)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {showInstructions ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Cómo instalarla
        </button>

        {showInstructions && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <p>
              <strong>1.</strong> Descarga el archivo{' '}
              <code className="text-xs">casarula-print.dmg</code> desde el Mac
              donde quieres instalarla (el de la oficina, normalmente).
            </p>
            <p>
              <strong>2.</strong> Abre el .dmg con doble click. Verás un icono de
              la app y un acceso directo a Aplicaciones — arrastra el icono al
              acceso directo.
            </p>
            <p>
              <strong>3.</strong> Abre la carpeta <strong>Aplicaciones</strong>{' '}
              y busca <strong>Casa Rula Print</strong>. La primera vez tienes que
              abrirla con <strong>Ctrl+Click → Abrir</strong>; macOS avisará de
              que el origen no está verificado y pulsas <strong>Abrir</strong>{' '}
              igualmente. Solo hace falta una vez.
            </p>
            <p>
              <strong>4.</strong> La app aparecerá como un icono pequeño en la
              barra superior del Mac, junto al WiFi y el reloj. No hay ventana
              principal — la primera vez se abrirá una ventana de configuración
              donde rellenar las credenciales (pídelas al administrador).
            </p>
            <p>
              <strong>5.</strong> Para que arranque sola al encender el Mac, ve
              a <strong>Ajustes del sistema → General → Ítems de inicio de
              sesión</strong> y añádela.
            </p>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Solo funciona en macOS (Intel y Apple Silicon). Mantiene el
              ordenador despierto durante el horario de servicio para que las
              impresiones no se queden colgadas.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
