'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getReservation, updateReservation, deleteReservation, changeReservationTable } from '@/app/actions/reservations'
import { getTables } from '@/app/actions/floor-plan'
import type { Reservation, Table } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

export default function EditReservaPage() {
  const router = useRouter()
  const params = useParams()
  const reservationId = params.id as string

  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changingTable, setChangingTable] = useState(false)
  const [mesaSolicitada, setMesaSolicitada] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [res, allTables] = await Promise.all([
        getReservation(reservationId),
        getTables()
      ])
      setReservation(res)
      setTables(allTables)
      setMesaSolicitada(res?.mesa_solicitada || false)
      setLoading(false)
    }
    load()
  }, [reservationId])

  async function handleTableChange(newTableId: string) {
    if (!reservation || newTableId === reservation.table_id) return
    setChangingTable(true)
    const result = await changeReservationTable(reservationId, newTableId)
    if (result.error) {
      setError(result.error)
    } else {
      setReservation(prev => prev ? { ...prev, table_id: newTableId } : null)
    }
    setChangingTable(false)
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)

    // Add mesaSolicitada to formData
    formData.set('mesaSolicitada', mesaSolicitada ? 'true' : 'false')

    const result = await updateReservation(reservationId, formData)
    
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    router.push('/lista')
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta reserva?')) return
    
    setDeleting(true)
    const result = await deleteReservation(reservationId)
    
    if (result.error) {
      setError(result.error)
      setDeleting(false)
      return
    }

    router.push('/lista')
  }

  const timeSlots = []
  for (let h = 12; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      timeSlots.push(time)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Reserva no encontrada</p>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Modificar Reserva</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive hover:text-destructive"
        >
          {deleting ? <Spinner /> : <Trash2 className="h-5 w-5" />}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <form action={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="guestName">Nombre del Cliente</FieldLabel>
              <Input
                id="guestName"
                name="guestName"
                defaultValue={reservation.guest_name}
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
                defaultValue={reservation.guest_phone || ''}
                placeholder="+34 600 000 000"
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="partySize">Personas</FieldLabel>
              <Select name="partySize" defaultValue={reservation.party_size.toString()}>
                <SelectTrigger id="partySize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} {n === 1 ? 'persona' : 'personas'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="date">Fecha</FieldLabel>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={reservation.date}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="time">Hora</FieldLabel>
              <Select name="time" defaultValue={reservation.time.slice(0, 5)}>
                <SelectTrigger id="time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="notes">Notas (opcional)</FieldLabel>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={reservation.notes || ''}
                placeholder="Alergias, celebraciones, preferencias..."
                rows={3}
              />
            </Field>

            {/* Table selector */}
            <Field>
              <FieldLabel htmlFor="tableSelect">Mesa</FieldLabel>
              <Select 
                value={reservation.table_id || 'none'} 
                onValueChange={handleTableChange}
                disabled={changingTable}
              >
                <SelectTrigger id="tableSelect">
                  <SelectValue placeholder="Sin mesa asignada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin mesa asignada</SelectItem>
                  {ZONE_ORDER.map(zone => {
                    const zoneTables = tables.filter(t => t.zone === zone)
                    if (zoneTables.length === 0) return null
                    return (
                      <div key={zone}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                          {zone}
                        </div>
                        {zoneTables.sort((a, b) => a.label.localeCompare(b.label)).map(table => (
                          <SelectItem key={table.id} value={table.id}>
                            Mesa {table.label} ({table.capacity}p)
                          </SelectItem>
                        ))}
                      </div>
                    )
                  })}
                </SelectContent>
              </Select>
              {changingTable && <p className="text-xs text-muted-foreground mt-1">Cambiando mesa...</p>}
            </Field>

            {/* Mesa solicitada checkbox */}
            {reservation.table_id && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="mesaSolicitada"
                  checked={mesaSolicitada}
                  onCheckedChange={(checked) => setMesaSolicitada(checked === true)}
                />
                <label 
                  htmlFor="mesaSolicitada" 
                  className="text-sm font-medium cursor-pointer select-none"
                >
                  Mesa solicitada por el cliente
                </label>
              </div>
            )}
          </FieldGroup>

          {error && (
            <p className="mt-4 text-sm text-destructive text-center">{error}</p>
          )}

          <Button type="submit" className="w-full mt-6" disabled={saving}>
            {saving ? <Spinner className="mr-2" /> : null}
            Guardar Cambios
          </Button>
        </form>
      </div>
    </div>
  )
}
