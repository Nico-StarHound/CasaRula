'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'

interface CustomItemModalProps {
  open: boolean
  onClose: () => void
  // Destino fijado al abrir el modal — el botón que lo abrió determina
  // si el item va a 'cocina' o 'barra'. La modal solo pide nombre,
  // precio y notas. No se puede cambiar el destino dentro del modal.
  destination: 'cocina' | 'barra'
  // Callback al confirmar. Devuelve true si el padre lo añadió OK.
  onConfirm: (data: { name: string; price: number; notes?: string }) => Promise<boolean>
}

/**
 * Modal para item custom (categoría OTROS).
 *
 * Se abre desde la pantalla de comanda al pulsar uno de los dos botones
 * grandes que aparecen cuando la categoría activa es OTROS:
 *   - "Otros a cocina" → destination = 'cocina'
 *   - "Otros a barra"  → destination = 'barra'
 *
 * Validación:
 *   - Nombre obligatorio, ≥2 chars, ≤80 chars (sanity check).
 *   - Precio obligatorio, ≥0 (0 se permite por si es invitación).
 *   - Notas opcional, ≤200 chars.
 */
export function CustomItemModal({ open, onClose, destination, onConfirm }: CustomItemModalProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir/cerrar para que la próxima vez esté limpio.
  useEffect(() => {
    if (!open) {
      setName('')
      setPrice('')
      setNotes('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  const handleSubmit = async () => {
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    if (trimmedName.length > 80) {
      setError('El nombre es demasiado largo (máx 80 caracteres).')
      return
    }
    // Acepta coma o punto como separador decimal (camareros españoles
    // suelen usar coma). Convertimos antes de parseFloat.
    const normalizedPrice = price.replace(',', '.').trim()
    const parsedPrice = parseFloat(normalizedPrice)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('El precio debe ser un número válido (≥ 0).')
      return
    }
    if (parsedPrice > 9999) {
      setError('Precio sospechosamente alto. Confirma o reduce.')
      return
    }
    setSubmitting(true)
    const ok = await onConfirm({
      name: trimmedName,
      price: parsedPrice,
      notes: notes.trim() || undefined,
    })
    if (ok) {
      onClose()
    } else {
      setError('No se pudo añadir el item. Intenta de nuevo.')
      setSubmitting(false)
    }
  }

  const destLabel = destination === 'cocina' ? 'Cocina' : 'Barra'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Item personalizado</DialogTitle>
          <DialogDescription>
            Se enviará a <strong>{destLabel}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="custom-name">Nombre</Label>
            <Input
              id="custom-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Tarta de cumpleaños"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-price">Precio (€)</Label>
            <Input
              id="custom-price"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-notes">Notas (opcional)</Label>
            <Textarea
              id="custom-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin sal, alergia a frutos secos…"
              rows={2}
              disabled={submitting}
              maxLength={200}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Spinner className="mr-2" />}
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
