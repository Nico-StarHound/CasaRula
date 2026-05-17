'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Download, ChevronDown, ChevronUp } from 'lucide-react'

// URL of the signed APK in our own GitHub repo. We could also serve it
// straight from /public, but keeping the binary out of the Vercel deploy
// keeps the build artefact small.
const APK_URL =
  'https://github.com/Nico-StarHound/CasaRula/raw/main/android-app/casarula.apk'

/**
 * Settings card that lets staff download the Android wrapper APK.
 *
 * Many Android tablets (Lenovo Idea Tab Pro is a known case) ship with
 * launchers that hide Chrome's "Add to home screen" option, so the
 * standard PWA route doesn't work for them. The APK is a thin WebView
 * around r.casarula.com that gives them a real app icon and a
 * fullscreen kiosk-style experience instead.
 */
export function AndroidAppCard() {
  const [showInstructions, setShowInstructions] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle>App Android</CardTitle>
            <CardDescription>
              Descarga la app de Casa Rula como aplicación Android nativa.
              Útil para tablets de barra o móviles donde el navegador no
              permite añadir la web a la pantalla de inicio.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button asChild className="w-full sm:w-auto" size="lg">
          <a href={APK_URL} download="casarula.apk">
            <Download className="mr-2 h-4 w-4" />
            Descargar app para Android
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
              <strong>1.</strong> Abre esta página en el dispositivo donde
              quieras instalar la app y pulsa{' '}
              <strong>&quot;Descargar app para Android&quot;</strong>.
            </p>
            <p>
              <strong>2.</strong> Al intentar abrir el archivo descargado,
              Android avisará de que el origen es desconocido. Pulsa{' '}
              <strong>Ajustes</strong> en el aviso y activa{' '}
              <strong>&quot;Permitir desde esta fuente&quot;</strong> para el
              navegador.
            </p>
            <p>
              <strong>3.</strong> Vuelve atrás, abre el archivo descargado
              otra vez y pulsa <strong>Instalar</strong>.
            </p>
            <p>
              <strong>4.</strong> Aparecerá <strong>Casa Rula</strong> en la
              pantalla de inicio con icono propio.
            </p>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              La app es un acceso directo a esta misma web; las cuentas y
              datos son los mismos. No funciona en iPhone / iPad — para
              iOS usa &quot;Compartir → Añadir a pantalla de inicio&quot;
              desde Safari.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
