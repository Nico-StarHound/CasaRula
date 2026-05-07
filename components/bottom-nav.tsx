'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutGrid, ClipboardList, Users, Settings, Map, ChevronRight, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  ownerOnly?: boolean
  roles?: string[] // If specified, only show for these roles
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/mapa', label: 'Mapa', icon: LayoutGrid },
  { href: '/lista', label: 'Lista', icon: ClipboardList },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/ajustes', label: 'Ajustes', icon: Settings, ownerOnly: true },
  { href: '/tickets', label: 'Tickets', icon: Receipt, roles: ['admin', 'caja'] },
]

// Temporary routes for testing
const testRoutes = [
  { href: '/admin', label: 'Admin' },
  { href: '/comandas', label: 'Comandas' },
  { href: '/comandas/tomar', label: 'Tomar Comanda' },
  { href: '/cocina', label: 'Cocina' },
  { href: '/caja', label: 'Caja' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/lista', label: 'Lista' },
  { href: '/reservas/nueva', label: 'Nueva Reserva' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/ajustes', label: 'Ajustes' },
  { href: '/login', label: 'Login' },
]

interface BottomNavProps {
  isOwner?: boolean
  userRole?: string
}

export function BottomNav({ isOwner = false, userRole }: BottomNavProps) {
  const pathname = usePathname()
  const [routesOpen, setRoutesOpen] = useState(false)

  const visibleItems = navItems.filter(item => {
    // Check ownerOnly
    if (item.ownerOnly && !isOwner) return false
    // Check role-based access
    if (item.roles && userRole && !item.roles.includes(userRole)) return false
    // If roles specified but no userRole provided, hide it
    if (item.roles && !userRole) return false
    return true
  })

  return (
    <nav className="flex-shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14 px-2">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}

        {/* Temporary Routes Drawer */}
        <Sheet open={routesOpen} onOpenChange={setRoutesOpen}>
          <SheetTrigger asChild>
            <button
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Map className="h-5 w-5" />
              <span className="text-xs font-medium">Rutas</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle>Rutas de Prueba</SheetTitle>
              <SheetDescription>Navegar a cualquier ruta de la app</SheetDescription>
            </SheetHeader>
            <div className="mt-4 divide-y">
              {testRoutes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={() => setRoutesOpen(false)}
                  className="flex items-center justify-between py-3 px-1 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{route.label}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">{route.href}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
