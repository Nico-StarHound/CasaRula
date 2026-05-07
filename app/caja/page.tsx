'use client'

import Link from 'next/link'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

export default function CajaPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Caja</h1>
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        <div className="max-w-2xl mx-auto">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard />
              </EmptyMedia>
              <EmptyTitle>Sin cuentas por cobrar</EmptyTitle>
              <EmptyDescription>
                Las mesas listas para pagar apareceran aqui
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </main>
    </div>
  )
}
