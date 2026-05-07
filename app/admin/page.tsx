'use client'

import Link from 'next/link'
import { ClipboardList, LayoutGrid, ChefHat, CreditCard, Settings, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

const modules = [
  {
    href: '/dashboard',
    label: 'Reservas',
    description: 'Gestión de reservas y mesas',
    icon: LayoutGrid,
    color: 'bg-emerald-500',
  },
  {
    href: '/comandas',
    label: 'Comandas',
    description: 'Pedidos y cocina',
    icon: ClipboardList,
    color: 'bg-amber-500',
  },
  {
    href: '/cocina',
    label: 'Cocina',
    description: 'Vista de cocina',
    icon: ChefHat,
    color: 'bg-orange-500',
  },
  {
    href: '/caja',
    label: 'Caja',
    description: 'Cobros y cierres',
    icon: CreditCard,
    color: 'bg-blue-500',
  },
  {
    href: '/tickets',
    label: 'Tickets',
    description: 'Historico de cobros',
    icon: Receipt,
    color: 'bg-violet-500',
  },
  {
    href: '/ajustes',
    label: 'Ajustes',
    description: 'Configuracion del sistema',
    icon: Settings,
    color: 'bg-stone-500',
  },
]

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-6 text-center">
        <h1 className="text-2xl font-bold">Casa Rula</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecciona un módulo</p>
      </header>

      {/* Module Grid */}
      <main className="flex-1 p-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="flex flex-col items-center justify-center p-6 rounded-xl border bg-card hover:bg-accent transition-colors text-center"
            >
              <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-3', mod.color)}>
                <mod.icon className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold">{mod.label}</span>
              <span className="text-xs text-muted-foreground mt-1">{mod.description}</span>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t p-4 text-center text-xs text-muted-foreground">
        v1.0 — Casa Rula Reservas
      </footer>
    </div>
  )
}
