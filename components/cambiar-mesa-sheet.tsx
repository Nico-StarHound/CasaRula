'use client'

import { useState } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { AlertTriangle } from 'lucide-react'
import type { Table, TableStatus, Reservation } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CambiarMesaSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservation: Reservation | null
  tables: (Table & { status?: TableStatus })[]
  onConfirm: (reservationId: string, newTableId: string) => Promise<void>
}

export function CambiarMesaSheet({
  open,
  onOpenChange,
  reservation,
  tables,
  onConfirm,
}: CambiarMesaSheetProps) {
  const [loading, setLoading] = useState(false)
  const [confirmTable, setConfirmTable] = useState<Table | null>(null)

  if (!reservation) return null

  const currentTable = tables.find(t => t.id === reservation.table_id)

  // Group tables by zone
  const tablesByZone = ZONE_ORDER.map(zone => ({
    name: zone,
    tables: tables.filter(t => t.zone === zone).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter(z => z.tables.length > 0)

  const handleMove = async (tableId: string) => {
    setLoading(true)
    await onConfirm(reservation.id, tableId)
    setLoading(false)
    onOpenChange(false)
  }

  const handleTableClick = (table: Table & { status?: TableStatus }) => {
    const isCurrent = table.id === reservation.table_id
    const isBlocked = table.status === 'blocked'
    const isOccupied = table.status === 'reserved' || table.status === 'seated'

    if (isCurrent || isBlocked) return

    if (isOccupied) {
      setConfirmTable(table)
    } else {
      handleMove(table.id)
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Cambiar Mesa</DrawerTitle>
            <DrawerDescription>
              Mover reserva de {reservation.guest_name} ({reservation.party_size}p)
              {currentTable && (
                <span className="block mt-1">
                  Mesa actual: {currentTable.label} ({currentTable.zone})
                </span>
              )}
            </DrawerDescription>
          </DrawerHeader>

          {/* Mesa solicitada warning */}
          {reservation.mesa_solicitada && (
            <div className="mx-4 mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Mesa solicitada
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  El cliente pidio especificamente esta mesa
                </p>
              </div>
            </div>
          )}

          <div className="px-4 pb-6 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <div className="space-y-4">
                {tablesByZone.map(zone => (
                  <div key={zone.name}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {zone.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {zone.tables.map(table => {
                        const isCurrent = table.id === reservation.table_id
                        const isBlocked = table.status === 'blocked'

                        return (
                          <button
                            key={table.id}
                            type="button"
                            disabled={isCurrent || isBlocked || loading}
                            onClick={() => handleTableClick(table)}
                            className={cn(
                              'w-14 h-14 rounded-lg flex flex-col items-center justify-center text-sm font-medium border transition-colors',
                              isCurrent && 'ring-2 ring-primary opacity-50 cursor-not-allowed',
                              isBlocked && 'opacity-30 cursor-not-allowed bg-stone-100 dark:bg-stone-800',
                              !isCurrent && !isBlocked && table.status === 'available' && 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400',
                              !isCurrent && !isBlocked && table.status === 'reserved' && 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400',
                              !isCurrent && !isBlocked && table.status === 'seated' && 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400',
                            )}
                          >
                            <span className="font-bold">{table.label}</span>
                            <span className="text-[10px] opacity-70">{table.capacity}p</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Confirmation dialog for occupied tables */}
      <AlertDialog open={!!confirmTable} onOpenChange={(open) => !open && setConfirmTable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mesa ocupada</AlertDialogTitle>
            <AlertDialogDescription>
              La mesa {confirmTable?.label} ya tiene una reserva. ¿Quieres mover aquí de todos modos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTable) {
                  handleMove(confirmTable.id)
                  setConfirmTable(null)
                }
              }}
            >
              Mover aquí
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
