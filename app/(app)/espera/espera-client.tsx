'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Empty } from '@/components/ui/empty'
import { Plus, Users, Clock, Phone, Bell, UserCheck, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { WaitlistEntry, WaitlistStatus } from '@/lib/types'
import { addToWaitlist, updateWaitlistStatus, removeFromWaitlist } from '@/app/actions/waitlist'
import { cn } from '@/lib/utils'

interface EsperaClientProps {
  initialWaitlist: WaitlistEntry[]
}

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  waiting: 'Esperando',
  notified: 'Notificado',
  seated: 'Sentado',
  cancelled: 'Cancelado',
}

export function EsperaClient({ initialWaitlist }: EsperaClientProps) {
  const router = useRouter()
  const [waitlist, setWaitlist] = useState(initialWaitlist)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (formData: FormData) => {
    setLoading(true)
    setError(null)

    const result = await addToWaitlist(formData)
    
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.entry) {
      setWaitlist(prev => [...prev, result.entry!])
    }
    
    setLoading(false)
    setShowAddDialog(false)
  }

  const handleStatusUpdate = async (id: string, status: WaitlistStatus) => {
    await updateWaitlistStatus(id, status)
    
    if (status === 'seated' || status === 'cancelled') {
      setWaitlist(prev => prev.filter(e => e.id !== id))
    } else {
      setWaitlist(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    }
    
    setShowDetails(false)
  }

  const handleRemove = async (id: string) => {
    await removeFromWaitlist(id)
    setWaitlist(prev => prev.filter(e => e.id !== id))
    setShowDetails(false)
  }

  const handleSeat = (entry: WaitlistEntry) => {
    // Navigate to floor plan to select table
    router.push(`/mapa?seatWaitlist=${entry.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-lg font-semibold">Lista de Espera</h1>
          <p className="text-sm text-muted-foreground">
            {waitlist.length} {waitlist.length === 1 ? 'persona' : 'personas'} esperando
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </header>

      {/* Waitlist */}
      <div className="flex-1 overflow-y-auto p-4">
        {waitlist.length === 0 ? (
          <Empty
            title="No hay nadie esperando"
            description="Agrega clientes a la lista de espera cuando no haya mesas disponibles"
          />
        ) : (
          <div className="space-y-3">
            {waitlist.map((entry, index) => (
              <Card 
                key={entry.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  setSelectedEntry(entry)
                  setShowDetails(true)
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold truncate">{entry.guest_name}</span>
                        {entry.status === 'notified' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-table-reserved text-white">
                            Notificado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {entry.party_size}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDistanceToNow(new Date(entry.created_at), { 
                            addSuffix: false, 
                            locale: es 
                          })}
                        </span>
                        {entry.quoted_wait_minutes && (
                          <span className="text-xs">
                            ~{entry.quoted_wait_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Agregar a Lista de Espera</DialogTitle>
            <DialogDescription>
              Ingresa los datos del cliente para agregarlo a la lista
            </DialogDescription>
          </DialogHeader>

          <form action={handleAdd}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="guestName">Nombre</FieldLabel>
                <Input
                  id="guestName"
                  name="guestName"
                  placeholder="Juan García"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="guestPhone">Teléfono (opcional)</FieldLabel>
                <Input
                  id="guestPhone"
                  name="guestPhone"
                  type="tel"
                  placeholder="+34 600 000 000"
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="partySize">Personas</FieldLabel>
                <Select name="partySize" defaultValue="2">
                  <SelectTrigger id="partySize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} {n === 1 ? 'persona' : 'personas'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="quotedWait">Tiempo Estimado (min)</FieldLabel>
                <Select name="quotedWait" defaultValue="">
                  <SelectTrigger id="quotedWait">
                    <SelectValue placeholder="Sin estimar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin estimar</SelectItem>
                    <SelectItem value="10">10 minutos</SelectItem>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="20">20 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            {error && (
              <p className="text-sm text-destructive text-center mb-4">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner className="mr-2" /> : null}
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Entry Details Sheet */}
      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent side="bottom" className="rounded-t-xl">
          {selectedEntry && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{selectedEntry.guest_name}</SheetTitle>
                <SheetDescription>
                  {selectedEntry.party_size} personas - Esperando desde {' '}
                  {formatDistanceToNow(new Date(selectedEntry.created_at), { 
                    addSuffix: false, 
                    locale: es 
                  })}
                </SheetDescription>
              </SheetHeader>

              <div className="py-4 space-y-3">
                {selectedEntry.guest_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${selectedEntry.guest_phone}`} className="text-primary">
                      {selectedEntry.guest_phone}
                    </a>
                  </div>
                )}
                {selectedEntry.notes && (
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    {selectedEntry.notes}
                  </p>
                )}
              </div>

              <div className="grid gap-3 pb-4">
                <Button
                  variant="outline"
                  className="justify-start h-12"
                  onClick={() => handleSeat(selectedEntry)}
                >
                  <UserCheck className="mr-3 h-5 w-5" />
                  Sentar en Mesa
                </Button>
                
                {selectedEntry.status === 'waiting' && (
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => handleStatusUpdate(selectedEntry.id, 'notified')}
                  >
                    <Bell className="mr-3 h-5 w-5" />
                    Marcar como Notificado
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  className="justify-start h-12 text-destructive"
                  onClick={() => handleRemove(selectedEntry.id)}
                >
                  <X className="mr-3 h-5 w-5" />
                  Quitar de la Lista
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
