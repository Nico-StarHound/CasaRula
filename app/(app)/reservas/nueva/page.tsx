'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, AlertTriangle, UserCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createReservation } from '@/app/actions/reservations'
import { searchGuestsByPhone } from '@/app/actions/guests'
import { getTables } from '@/app/actions/floor-plan'
import type { Guest, Table, TableZone } from '@/lib/types'
import { ZONE_ORDER } from '@/lib/types'

export default function NuevaReservaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tableId = searchParams.get('table')
  const isWalkIn = searchParams.get('walkIn') === 'true'
  const isDoblar = searchParams.get('doblar') === 'true'
  const fechaParam = searchParams.get('fecha')
  const shiftParam = searchParams.get('shift') as 'comida' | 'cena' | null

  // Calculate default date/time BEFORE using in useState
  const today = new Date().toISOString().split('T')[0]
  const defaultDate = fechaParam || today
  
  // Determine default turno from shift param or current time
  const now = new Date()
  const currentHour = now.getHours()
  const defaultTurno: 'comida' | 'cena' = shiftParam || (currentHour >= 19 || currentHour < 5 ? 'cena' : 'comida')
  
  // Default time based on turno
  const defaultTime = isDoblar
    ? `${Math.min(currentHour + 2, 23).toString().padStart(2, '0')}:00`
    : defaultTurno === 'comida' ? '13:30' : '21:00'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // All tables for multi-select
  const [allTables, setAllTables] = useState<Table[]>([])
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(tableId ? [tableId] : [])

  // Controlled fields (for auto-fill)
  const [phone, setPhone] = useState('')
  const [guestName, setGuestName] = useState('')
  const [notes, setNotes] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [mesaSolicitada, setMesaSolicitada] = useState(false)
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [selectedTime, setSelectedTime] = useState(defaultTime)
  const [selectedTurno, setSelectedTurno] = useState<'comida' | 'cena'>(defaultTurno)
  const [showCustomTime, setShowCustomTime] = useState(false)

  // Load tables on mount
  useEffect(() => {
    getTables().then(setAllTables)
  }, [])

  // Guest search
  const [searchResults, setSearchResults] = useState<Guest[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Debounced phone search
  useEffect(() => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 3 || (selectedGuest && selectedGuest.phone?.includes(digits))) {
      setSearchResults([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      const results = await searchGuestsByPhone(phone)
      setSearchResults(results)
      setShowSuggestions(results.length > 0)
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [phone, selectedGuest])

  const handleSelectGuest = (guest: Guest) => {
    setSelectedGuest(guest)
    setPhone(guest.phone || '')
    setGuestName(guest.name)
    setNotes(guest.notes || '')
    setShowSuggestions(false)
  }

  const handlePhoneChange = (value: string) => {
    setPhone(value)
    if (selectedGuest) {
      setSelectedGuest(null)
      // Don't clear name/notes — user might have edited them
    }
  }

  const toggleTable = (id: string) => {
    setSelectedTableIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.set('guestPhone', phone)
    formData.set('guestName', guestName)
    formData.set('partySize', partySize)
    formData.set('notes', notes)

    // Use state values for date and time
    formData.set('date', selectedDate)
    formData.set('time', selectedTime)

    // Send multiple table IDs
    if (selectedTableIds.length > 0) {
      formData.set('tableIds', selectedTableIds.join(','))
    }
    if (isWalkIn) formData.set('walkIn', 'true')
    if (mesaSolicitada) formData.set('mesaSolicitada', 'true')

    const result = await createReservation(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.push('/lista')
  }

  // Time slots by turno
  const comidaSlots = ['13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00', '15:15', '15:30', '15:45', '16:00']
  const cenaSlots = ['21:00', '21:15', '21:30', '21:45', '22:00', '22:15', '22:30', '22:45', '23:00']
  const currentSlots = selectedTurno === 'comida' ? comidaSlots : cenaSlots
  
  const handleTurnoChange = (turno: 'comida' | 'cena') => {
    setSelectedTurno(turno)
    // Auto-select first slot of new turno if current selection isn't in it
    const slots = turno === 'comida' ? comidaSlots : cenaSlots
    if (!slots.includes(selectedTime)) {
      setSelectedTime(slots[0])
      setShowCustomTime(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 p-4 border-b flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">
          {isWalkIn ? 'Sentar sin Reserva' : isDoblar ? 'Doblar Mesa' : 'Nueva Reserva'}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {/* 1. PHONE — first, with live search */}
            <Field>
              <FieldLabel htmlFor="guestPhone">Teléfono</FieldLabel>
              <div className="relative">
                <Input
                  id="guestPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+34 600 000 000"
                  autoComplete="off"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="h-4 w-4" />
                  </div>
                )}
                {showSuggestions && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
                    {searchResults.map((guest) => (
                      <button
                        key={guest.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0 flex items-center justify-between"
                        onClick={() => handleSelectGuest(guest)}
                      >
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {guest.is_vip && <span className="text-amber-500">⭐</span>}
                            {guest.name}
                          </p>
                          <p className="text-sm text-muted-foreground">{guest.phone}</p>
                        </div>
                        {guest.no_show_count > 0 && (
                          <span className="text-xs text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {guest.no_show_count} no-show
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            {/* No-show warning */}
            {selectedGuest && selectedGuest.no_show_count > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Atencion: {selectedGuest.no_show_count} no-show{selectedGuest.no_show_count > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    Confirma la reserva por telefono
                  </p>
                </div>
              </div>
            )}

            {/* VIP indicator */}
            {selectedGuest?.is_vip && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <span className="text-lg">⭐</span>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Cliente VIP — {selectedGuest.name}
                </p>
              </div>
            )}

            {/* Guest found confirmation */}
            {selectedGuest && !selectedGuest.is_vip && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Cliente encontrado: {selectedGuest.name}
                </span>
              </div>
            )}

            {/* Doblar info */}
            {isDoblar && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Doblando mesa — ya tiene reserva en este turno
                </p>
              </div>
            )}

            {/* 2. NAME */}
            <Field>
              <FieldLabel htmlFor="guestName">Nombre del Cliente</FieldLabel>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Juan Garcia"
                required
                autoComplete="off"
              />
            </Field>

            {/* 3. PAX */}
            <Field>
              <FieldLabel htmlFor="partySize">Personas</FieldLabel>
              <div className="flex items-center gap-2">
                {/* Quick select buttons for common sizes */}
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPartySize(n.toString())}
                      className={cn(
                        'w-10 h-10 rounded-lg border text-sm font-medium transition-colors',
                        partySize === n.toString()
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-input'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {/* Custom number input */}
                <Input
                  id="partySize"
                  type="number"
                  min="1"
                  max="99"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="w-16 text-center"
                />
              </div>
            </Field>

            {/* 4. DATE + TIME */}
            {!isWalkIn && (
              <>
                <Field>
                  <FieldLabel htmlFor="date">Fecha</FieldLabel>
                  <Input 
                    id="date" 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    min={today} 
                    required 
                  />
                </Field>
                
                {/* Turno selector */}
                <Field>
                  <FieldLabel>Turno</FieldLabel>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleTurnoChange('comida')}
                      className={cn(
                        'flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors',
                        selectedTurno === 'comida'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-input'
                      )}
                    >
                      Comida
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTurnoChange('cena')}
                      className={cn(
                        'flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors',
                        selectedTurno === 'cena'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-input'
                      )}
                    >
                      Cena
                    </button>
                  </div>
                </Field>

                {/* Time pills */}
                <Field>
                  <FieldLabel>Hora</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {currentSlots.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setSelectedTime(t)
                          setShowCustomTime(false)
                        }}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-sm font-medium transition-colors min-w-[60px]',
                          selectedTime === t && !showCustomTime
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-background hover:bg-accent border-input text-muted-foreground'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  
                  {/* Custom time option */}
                  {!showCustomTime ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomTime(true)}
                      className="mt-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      Hora personalizada
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="time"
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="w-32"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomTime(false)
                          // Reset to first slot of current turno
                          setSelectedTime(currentSlots[0])
                        }}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </Field>
              </>
            )}

            {/* 5. NOTES */}
            <Field>
              <FieldLabel htmlFor="notes">Notas (opcional)</FieldLabel>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alergias, celebraciones, preferencias..."
                rows={3}
              />
            </Field>

            {/* 6. TABLE SELECTION */}
            <Field>
              <FieldLabel>
                Mesas {selectedTableIds.length > 0 && `(${selectedTableIds.length} seleccionadas)`}
              </FieldLabel>
              <div className="space-y-3 mt-2">
                {ZONE_ORDER.map(zone => {
                  const zoneTables = allTables.filter(t => t.zone === zone)
                  if (zoneTables.length === 0) return null
                  return (
                    <div key={zone}>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">{zone}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {zoneTables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map(table => {
                          const isSelected = selectedTableIds.includes(table.id)
                          return (
                            <button
                              key={table.id}
                              type="button"
                              onClick={() => toggleTable(table.id)}
                              className={cn(
                                'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                                isSelected
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-accent border-input'
                              )}
                            >
                              {table.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Field>

            {/* 7. MESA SOLICITADA — only show if table(s) assigned */}
            {selectedTableIds.length > 0 && !isWalkIn && (
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

          <Button type="submit" className="w-full mt-6" disabled={loading || !guestName.trim()}>
            {loading ? <Spinner className="mr-2" /> : null}
            {isWalkIn ? 'Sentar Cliente' : 'Crear Reserva'}
          </Button>
        </form>
      </div>
    </div>
  )
}
