'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Printer as PrinterIcon, Plus, Trash2, Pencil } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  listPrinters,
  createPrinter,
  updatePrinter,
  deletePrinter,
} from '@/app/actions/printers'
import type { Printer, PrinterType } from '@/lib/types'

const TYPE_LABELS: Record<PrinterType, string> = {
  cocina: 'Cocina',
  barra: 'Barra',
  caja: 'Caja',
}

const TYPE_DESCRIPTIONS: Record<PrinterType, string> = {
  cocina: 'Recibe comandas de platos (entrantes, principales, postres)',
  barra: 'Recibe comandas de bebidas y café',
  caja: 'Imprime facturas y cuentas provisionales',
}

interface FormState {
  name: string
  type: PrinterType
  ip: string
  port: string
  enabled: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'cocina',
  ip: '',
  port: '9100',
  enabled: true,
}

export function PrintersSection() {
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Printer | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<Printer | null>(null)

  const refresh = async () => {
    setLoading(true)
    const data = await listPrinters()
    setPrinters(data)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (p: Printer) => {
    setEditing(p)
    setForm({
      name: p.name,
      type: p.type,
      ip: p.ip,
      port: String(p.port),
      enabled: p.enabled,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  const handleSave = () => {
    setFormError(null)
    const port = parseInt(form.port, 10) || 9100
    startSaving(async () => {
      const payload = {
        name: form.name,
        type: form.type,
        ip: form.ip,
        port,
        enabled: form.enabled,
      }
      const result = editing
        ? await updatePrinter(editing.id, payload)
        : await createPrinter(payload)
      if (result.error) {
        setFormError(result.error)
        return
      }
      setDialogOpen(false)
      await refresh()
    })
  }

  const handleToggleEnabled = (p: Printer, enabled: boolean) => {
    startSaving(async () => {
      const result = await updatePrinter(p.id, { enabled })
      if (result.error) {
        // Roll back optimistic update by refetching
        await refresh()
        // surface the error to the user
        alert(result.error)
        return
      }
      await refresh()
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) return
    startSaving(async () => {
      await deletePrinter(confirmDelete.id)
      setConfirmDelete(null)
      await refresh()
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Impresoras</h2>
          <p className="text-sm text-muted-foreground">
            Las comandas y facturas se envían a estas impresoras según su tipo.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Añadir
        </Button>
      </div>

      {printers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <PrinterIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aún no hay impresoras configuradas.</p>
          <p className="text-xs mt-1">
            Añade al menos una de tipo &quot;cocina&quot; para que las comandas se impriman.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {printers.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-lg ${
                  p.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <PrinterIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="secondary">{TYPE_LABELS[p.type]}</Badge>
                    {!p.enabled && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Desactivada
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                    {p.ip}:{p.port}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={c => handleToggleEnabled(p, c)}
                    disabled={saving}
                    aria-label="Activar / desactivar"
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDelete(p)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar impresora' : 'Nueva impresora'}
            </DialogTitle>
            <DialogDescription>
              {TYPE_DESCRIPTIONS[form.type]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="printer-name">Nombre</Label>
              <Input
                id="printer-name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Impresora cocina"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer-type">Tipo</Label>
              <Select
                value={form.type}
                onValueChange={v => setForm({ ...form, type: v as PrinterType })}
              >
                <SelectTrigger id="printer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cocina">Cocina</SelectItem>
                  <SelectItem value="barra">Barra</SelectItem>
                  <SelectItem value="caja">Caja</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="printer-ip">IP</Label>
                <Input
                  id="printer-ip"
                  value={form.ip}
                  onChange={e => setForm({ ...form, ip: e.target.value })}
                  placeholder="192.168.0.27"
                  inputMode="decimal"
                  autoComplete="off"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="printer-port">Puerto</Label>
                <Input
                  id="printer-port"
                  type="number"
                  inputMode="numeric"
                  value={form.port}
                  onChange={e => setForm({ ...form, port: e.target.value })}
                  placeholder="9100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="printer-enabled" className="cursor-pointer">Activa</Label>
                <p className="text-xs text-muted-foreground">
                  Solo una impresora activa por tipo a la vez
                </p>
              </div>
              <Switch
                id="printer-enabled"
                checked={form.enabled}
                onCheckedChange={c => setForm({ ...form, enabled: c })}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="mr-2" /> : null}
              {editing ? 'Guardar cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar impresora?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} ({confirmDelete?.ip}). Esta acción no se puede deshacer.
              Las comandas pendientes no se imprimirán hasta que configures otra impresora del mismo tipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving} className="bg-destructive hover:bg-destructive/90">
              {saving ? <Spinner className="mr-2" /> : null}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
