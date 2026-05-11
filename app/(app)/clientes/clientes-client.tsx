'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Phone, Mail, Pencil, Trash2, Star, AlertTriangle } from 'lucide-react'
import type { Guest } from '@/lib/types'
import { createGuest, updateGuest, deleteGuest, toggleVip } from '@/app/actions/guests'

interface ClientesClientProps {
  initialGuests: Guest[]
}

export function ClientesClient({ initialGuests }: ClientesClientProps) {
  const router = useRouter()
  const [guests, setGuests] = useState(initialGuests)
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredGuests = useMemo(() => {
    if (!search) return guests
    const searchLower = search.toLowerCase()
    return guests.filter(g => 
      g.name.toLowerCase().includes(searchLower) ||
      g.phone?.toLowerCase().includes(searchLower) ||
      g.email?.toLowerCase().includes(searchLower)
    )
  }, [guests, search])

  const handleAdd = async (formData: FormData) => {
    setLoading(true)
    setError(null)

    const result = await createGuest(formData)
    
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.guest) {
      setGuests(prev => [result.guest!, ...prev])
    }
    
    setLoading(false)
    setShowAddDialog(false)
  }

  const handleEdit = async (formData: FormData) => {
    if (!selectedGuest) return

    setLoading(true)
    setError(null)

    const result = await updateGuest(selectedGuest.id, formData)
    
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Update local state
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const email = formData.get('email') as string
    const notes = formData.get('notes') as string
    const tagsStr = formData.get('tags') as string
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []

    setGuests(prev => prev.map(g => 
      g.id === selectedGuest.id 
        ? { ...g, name, phone: phone || null, email: email || null, notes: notes || null, tags }
        : g
    ))
    
    setLoading(false)
    setShowEditDialog(false)
    setShowDetails(false)
  }

  const handleDelete = async () => {
    if (!selectedGuest) return

    setLoading(true)
    const result = await deleteGuest(selectedGuest.id)
    
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setGuests(prev => prev.filter(g => g.id !== selectedGuest.id))
    setLoading(false)
    setShowDetails(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Clientes</h1>
            <p className="text-sm text-muted-foreground">
              {guests.length} {guests.length === 1 ? 'cliente' : 'clientes'}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </header>

      {/* Guests List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredGuests.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{search ? 'Sin resultados' : 'No hay clientes'}</EmptyTitle>
              <EmptyDescription>
                {search
                  ? 'Intenta con otra búsqueda'
                  : 'Los clientes se agregan automáticamente al hacer reservas o puedes crearlos manualmente'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {filteredGuests.map((guest) => (
              <Card 
                key={guest.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  setSelectedGuest(guest)
                  setShowDetails(true)
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold truncate">{guest.name}</span>
                        {guest.is_vip && (
                          <span className="text-amber-500">⭐</span>
                        )}
                        {!guest.is_vip && guest.visit_count > 5 && (
                          <Star className="h-4 w-4 text-table-reserved fill-table-reserved" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {guest.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {guest.phone}
                          </span>
                        )}
                        <span>{guest.visit_count} visitas</span>
                        {guest.no_show_count >= 2 && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {guest.no_show_count} no-shows
                          </span>
                        )}
                      </div>
                      {guest.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {guest.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {guest.tags.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{guest.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
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
            <DialogTitle>Nuevo Cliente</DialogTitle>
            <DialogDescription>
              Agrega un nuevo cliente al directorio
            </DialogDescription>
          </DialogHeader>

          <form action={handleAdd}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="name">Nombre</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Juan García"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+34 600 000 000"
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="juan@ejemplo.com"
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tags">Etiquetas (separadas por coma)</FieldLabel>
                <Input
                  id="tags"
                  name="tags"
                  placeholder="VIP, alergia gluten, cumpleaños"
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="notes">Notas</FieldLabel>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Preferencias, alergias, etc..."
                  rows={3}
                />
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
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Guest Details Sheet */}
      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent side="bottom" className="rounded-t-xl">
          {selectedGuest && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  {selectedGuest.name}
                  {selectedGuest.is_vip && (
                    <span className="text-amber-500 text-lg">⭐</span>
                  )}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  {selectedGuest.visit_count} visitas
                  {selectedGuest.no_show_count >= 2 && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {selectedGuest.no_show_count} no-shows
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="py-4 space-y-3">
                {selectedGuest.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${selectedGuest.phone}`} className="text-primary">
                      {selectedGuest.phone}
                    </a>
                  </div>
                )}
                {selectedGuest.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${selectedGuest.email}`} className="text-primary">
                      {selectedGuest.email}
                    </a>
                  </div>
                )}
                {selectedGuest.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedGuest.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {selectedGuest.notes && (
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    {selectedGuest.notes}
                  </p>
                )}
              </div>

              <div className="grid gap-3 pb-4">
                <Button
                  variant={selectedGuest.is_vip ? "default" : "outline"}
                  className={selectedGuest.is_vip 
                    ? "justify-start h-12 bg-amber-500 hover:bg-amber-600 text-white" 
                    : "justify-start h-12"
                  }
                  onClick={async () => {
                    const newVip = !selectedGuest.is_vip
                    await toggleVip(selectedGuest.id, newVip)
                    setGuests(prev => prev.map(g => 
                      g.id === selectedGuest.id ? { ...g, is_vip: newVip } : g
                    ))
                    setSelectedGuest({ ...selectedGuest, is_vip: newVip })
                  }}
                >
                  <span className="mr-3 text-lg">⭐</span>
                  {selectedGuest.is_vip ? 'Cliente VIP' : 'Marcar como VIP'}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-12"
                  onClick={() => {
                    setShowEditDialog(true)
                  }}
                >
                  <Pencil className="mr-3 h-5 w-5" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-12 text-destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? <Spinner className="mr-3" /> : <Trash2 className="mr-3 h-5 w-5" />}
                  Eliminar
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>

          {selectedGuest && (
            <form action={handleEdit}>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor="edit-name">Nombre</FieldLabel>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={selectedGuest.name}
                    required
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-phone">Teléfono</FieldLabel>
                  <Input
                    id="edit-phone"
                    name="phone"
                    type="tel"
                    defaultValue={selectedGuest.phone || ''}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-email">Email</FieldLabel>
                  <Input
                    id="edit-email"
                    name="email"
                    type="email"
                    defaultValue={selectedGuest.email || ''}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-tags">Etiquetas</FieldLabel>
                  <Input
                    id="edit-tags"
                    name="tags"
                    defaultValue={selectedGuest.tags.join(', ')}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-notes">Notas</FieldLabel>
                  <Textarea
                    id="edit-notes"
                    name="notes"
                    defaultValue={selectedGuest.notes || ''}
                    rows={3}
                  />
                </Field>
              </FieldGroup>

              {error && (
                <p className="text-sm text-destructive text-center mb-4">{error}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner className="mr-2" /> : null}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
