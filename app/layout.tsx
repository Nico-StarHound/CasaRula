import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { Analytics } from '@vercel/analytics/next'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { PassColumn } from '@/components/pass-column'
import './globals.css'

const _inter = Inter({ subsets: ["latin"] })

// JWT secret usado para leer el rol del cookie de sesión. Mismo
// fallback que el resto de la app — si JWT_SECRET no está set, el
// middleware ya está redirigiendo al login, así que esto no es
// crítico para seguridad aquí.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'restaurant-reservation-secret-key-change-in-production'
)

export const metadata: Metadata = {
  title: 'Casa Rula',
  description: 'Sistema de gestión de Casa Rula',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Casa Rula',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Lee el rol del cookie de sesión para decidir si mostrar el
  // PassColumn. Sólo caja lo ve. El middleware ya garantiza que las
  // rutas protegidas tienen un token válido; aquí solo extraemos el
  // role del payload. Si falla, role queda como '' y PassColumn no
  // se renderiza, lo cual es el comportamiento seguro por defecto.
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  let role = ''
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      role = (payload as { role?: string }).role || ''
    } catch {
      // ignore — middleware ya habrá redirigido si el token es inválido
    }
  }

  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <ServiceWorkerRegistration />
        {/* Layout flex horizontal cuando PassColumn debe aparecer.
            Ojo: la columna SÓLO se renderiza para rol caja. Para
            cualquier otro rol (admin, camarero, cocina, reservas) el
            PassColumn no se monta y el contenido ocupa el 100% del
            ancho como siempre. */}
        {role === 'caja' ? (
          <div className="flex h-dvh overflow-hidden">
            <div className="flex-1 min-w-0 overflow-hidden">
              {children}
            </div>
            <PassColumn />
          </div>
        ) : (
          children
        )}
        <Analytics />
      </body>
    </html>
  )
}
