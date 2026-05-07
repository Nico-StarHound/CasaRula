'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getTablesForComandas } from '@/app/actions/comandas'
import type { Table } from '@/lib/types'

interface TableWithOrder extends Table {
  hasOpenOrder: boolean
  orderTotal?: number
  comensales?: number
}

export default function TomarComandasPage() {
  const [tables, setTables] = useState<TableWithOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTablesForComandas().then(data => {
      setTables(data)
      setLoading(false)
    })
  }, [])

  // Group tables by zone
  const zones = ['Jovino', 'Árboles', 'Porche Nuevo', 'Cristal', 'Dentro', 'Sombrilla'] as const
  const tablesByZone = zones.map(zone => ({
    zone,
    tables: tables.filter(t => t.zone === zone).sort((a, b) => 
      a.label.localeCompare(b.label, undefined, { numeric: true })
    )
  })).filter(g => g.tables.length > 0)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/comandas">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Tomar Comanda</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {tablesByZone.map(({ zone, tables: zoneTables }) => (
              <div key={zone}>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {zone}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {zoneTables.map(table => (
                    <Link
                      key={table.id}
                      href={`/comandas/tomar/${table.id}`}
                      className={cn(
                        'relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all active:scale-95',
                        'min-h-[88px] touch-manipulation',
                        table.hasOpenOrder
                          ? 'bg-amber-50 border-amber-400 dark:bg-amber-950/30 dark:border-amber-600'
                          : 'bg-card border-border hover:border-primary/50'
                      )}
                    >
                      <span className={cn(
                        'text-xl font-bold',
                        table.hasOpenOrder ? 'text-amber-700 dark:text-amber-400' : ''
                      )}>
                        {table.label}
                      </span>
                      {table.hasOpenOrder && table.comensales && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                          <Users className="h-3 w-3" />
                          <span>{table.comensales}</span>
                        </div>
                      )}
                      {table.hasOpenOrder && table.orderTotal !== undefined && table.orderTotal > 0 && (
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                          {table.orderTotal.toFixed(2)}€
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
