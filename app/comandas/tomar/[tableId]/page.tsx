'use client'

// Table order page v3 - responsive, tap animation, null-safe prices, toast + navigation
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Plus, Minus, Send, ShoppingBag, Check, X, StickyNote, Shuffle, ChevronUp, ChevronDown, FileText, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  getOrCreateOrder,
  getMenuWithCategories,
  addItemToOrder,
  updateOrderItemQuantity,
  updateComensales,
  sendToKitchen,
  cancelOrderItem,
  updateOrderItemNote,
  updateOrderServiceConfig,
  setOrderUrgente,
  type Order,
  type MenuCategory,
  type OrdenServicio,
  type MenuItem,
  type ModifierGroup,
} from '@/app/actions/comandas'
import { getTables } from '@/app/actions/floor-plan'

export default function TableOrderPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)
  const router = useRouter()
  
  const [tableName, setTableName] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [cancelItemId, setCancelItemId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  
  // Service config state
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)
  const [serviceMode, setServiceMode] = useState<OrdenServicio>('sin_orden')
  const [serviceNote, setServiceNote] = useState('')
  const [serviceRondas, setServiceRondas] = useState<string[][]>([])
  const [savingService, setSavingService] = useState(false)
  const [showServiceSavedToast, setShowServiceSavedToast] = useState(false)
  
  // Modifier sheet state
  const [modifierSheetOpen, setModifierSheetOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({}) // groupId -> optionIds
  const [addingItem, setAddingItem] = useState(false)
  const [isUrgente, setIsUrgente] = useState(false)

  useEffect(() => {
    async function load() {
      const [orderData, menuData, tables] = await Promise.all([
        getOrCreateOrder(tableId),
        getMenuWithCategories(),
        getTables()
      ])
      setOrder(orderData)
      setMenu(menuData)
      if (menuData.length > 0) setActiveCategory(menuData[0].id)
      const table = tables.find(t => t.id === tableId)
      setTableName(table?.label || 'Mesa')
      setLoading(false)
      
      // Debug: log modifier data
      const allItems = menuData.flatMap(c => c.items)
      const itemsWithModifiers = allItems.filter(i => i.modifier_groups && i.modifier_groups.length > 0)
      console.log('[v0] Total items:', allItems.length)
      console.log('[v0] Items with modifiers:', itemsWithModifiers.length)
      if (itemsWithModifiers.length > 0) {
        const sample = itemsWithModifiers[0]
        console.log('[v0] Sample item:', sample.name)
        console.log('[v0] Sample modifier_groups:', JSON.stringify(sample.modifier_groups, null, 2))
      }
    }
    load()
  }, [tableId])

  const handleTapMenuItem = (item: MenuItem, categoryPrinterTarget?: string) => {
    const hasModifiers = Array.isArray(item.modifier_groups) && item.modifier_groups.length > 0
    console.log('[v0] handleTapMenuItem:', item.name, 'hasModifiers:', hasModifiers, 'modifier_groups:', item.modifier_groups)
    
    if (hasModifiers) {
      setSelectedItem({ ...item, printer_target: categoryPrinterTarget } as MenuItem & { printer_target?: string })
      setSelectedModifiers({})
      setModifierSheetOpen(true)
    } else {
      // No modifiers, add directly
      handleAddItemDirectly(item.id, {
        name: item.name,
        price: item.price,
        printer_target: categoryPrinterTarget
      })
    }
  }

  const handleAddItemDirectly = async (itemId: string, item: { name: string; price: number; printer_target?: string }) => {
    if (!order) return
    await addItemToOrder(order.id, { ...item, quantity: 1, menu_item_id: itemId })
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    // Trigger animation
    setLastAddedId(itemId)
    setTimeout(() => setLastAddedId(null), 600)
  }

  const handleConfirmModifiers = async () => {
    if (!order || !selectedItem) return
    setAddingItem(true)
    
    // Check required modifiers
    for (const group of selectedItem.modifier_groups || []) {
      if (group.required && (!selectedModifiers[group.id] || selectedModifiers[group.id].length === 0)) {
        // Required modifier not selected - don't close sheet
        setAddingItem(false)
        return
      }
    }
    
    // Build modifier summary and calculate price
    let totalPrice = selectedItem.price || 0
    const modifierSummary: { name: string; price: number }[] = []
    
    for (const group of selectedItem.modifier_groups || []) {
      const selectedOptionIds = selectedModifiers[group.id] || []
      for (const optionId of selectedOptionIds) {
        const option = group.options.find(o => o.id === optionId)
        if (option) {
          totalPrice += option.price_delta
          modifierSummary.push({ name: option.name, price: option.price_delta })
        }
      }
    }
    
    // Build name with modifiers
    const modifierNames = modifierSummary.map(m => m.name).join(', ')
    const fullName = modifierNames ? `${selectedItem.name} (${modifierNames})` : selectedItem.name
    
    await addItemToOrder(order.id, {
      name: fullName,
      price: totalPrice,
      quantity: 1,
      printer_target: (selectedItem as MenuItem & { printer_target?: string }).printer_target,
      menu_item_id: selectedItem.id
    })
    
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setAddingItem(false)
    setModifierSheetOpen(false)
    setSelectedItem(null)
    setSelectedModifiers({})
    
    // Trigger animation
    setLastAddedId(selectedItem.id)
    setTimeout(() => setLastAddedId(null), 600)
  }

  const toggleModifierOption = (groupId: string, optionId: string, multiSelect: boolean) => {
    setSelectedModifiers(prev => {
      const current = prev[groupId] || []
      if (multiSelect) {
        // Toggle in multi-select mode
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter(id => id !== optionId) }
        } else {
          return { ...prev, [groupId]: [...current, optionId] }
        }
      } else {
        // Single select - replace
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: [] }
        } else {
          return { ...prev, [groupId]: [optionId] }
        }
      }
    })
  }

  const isModifierSelected = (groupId: string, optionId: string): boolean => {
    return (selectedModifiers[groupId] || []).includes(optionId)
  }

  const canConfirmModifiers = (): boolean => {
    if (!selectedItem) return false
    for (const group of selectedItem.modifier_groups || []) {
      if (group.required && (!selectedModifiers[group.id] || selectedModifiers[group.id].length === 0)) {
        return false
      }
    }
    return true
  }

  const calculateModifierTotal = (): number => {
    if (!selectedItem) return 0
    let total = selectedItem.price || 0
    for (const group of selectedItem.modifier_groups || []) {
      const selectedOptionIds = selectedModifiers[group.id] || []
      for (const optionId of selectedOptionIds) {
        const option = group.options.find(o => o.id === optionId)
        if (option) {
          total += option.price_delta
        }
      }
    }
    return total
  }

  const handleUpdateQuantity = async (itemId: string, delta: number) => {
    const item = order?.items.find(i => i.id === itemId)
    if (!item) return
    await updateOrderItemQuantity(itemId, item.quantity + delta)
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
  }

  const handleComensalesChange = async (delta: number) => {
    if (!order) return
    const newVal = Math.max(1, order.comensales + delta)
    await updateComensales(order.id, newVal)
    setOrder({ ...order, comensales: newVal })
  }

const handleSendToKitchen = async () => {
  if (!order || pendingItems.length === 0) return
  setSending(true)
  
  // Set urgente flag if selected
  if (isUrgente) {
    await setOrderUrgente(order.id, true)
  }
  
  // Send to kitchen — print daemon will pick up the print job from Supabase
  // and physically print on the kitchen/bar printers via ESC/POS.
  await sendToKitchen(order.id)
  const updated = await getOrCreateOrder(tableId)
  setOrder(updated)
  setSending(false)
  setSheetOpen(false)
  
  // Show toast and navigate
  setShowToast(true)
  setTimeout(() => {
    router.push('/comandas')
  }, 1000)
}

  const handleCancelItem = async (itemId: string) => {
    await cancelOrderItem(itemId, cancelMotivo || undefined)
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setCancelItemId(null)
    setCancelMotivo('')
  }

  const handleSaveNote = async (itemId: string) => {
    await updateOrderItemNote(itemId, noteText)
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setEditingNoteId(null)
    setNoteText('')
  }

  const startEditingNote = (itemId: string, currentNote?: string) => {
    setEditingNoteId(itemId)
    setNoteText(currentNote || '')
  }

  const openServiceSheet = () => {
    // Initialize state from current order
    setServiceMode(order?.orden_servicio || 'sin_orden')
    setServiceNote(order?.nota_mesa || '')
    // Initialize rondas: all pending items in one ronda by default
    if (order?.rondas && order.rondas.length > 0) {
      setServiceRondas(order.rondas)
    } else {
      setServiceRondas([pendingItems.map(i => i.id)])
    }
    setServiceSheetOpen(true)
  }

  const handleSaveServiceConfig = async () => {
    if (!order) return
    setSavingService(true)
    await updateOrderServiceConfig(order.id, {
      nota_mesa: serviceNote,
      orden_servicio: serviceMode,
      rondas: serviceMode === 'por_rondas' ? serviceRondas : null
    })
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setSavingService(false)
    setServiceSheetOpen(false)
    setShowServiceSavedToast(true)
    setTimeout(() => setShowServiceSavedToast(false), 2000)
  }

  // Rondas management
  const moveItemBetweenRondas = (itemId: string, direction: 'up' | 'down') => {
    const newRondas = [...serviceRondas]
    for (let i = 0; i < newRondas.length; i++) {
      const idx = newRondas[i].indexOf(itemId)
      if (idx !== -1) {
        newRondas[i] = newRondas[i].filter(id => id !== itemId)
        if (direction === 'up' && i > 0) {
          newRondas[i - 1].push(itemId)
        } else if (direction === 'down' && i < newRondas.length - 1) {
          newRondas[i + 1].push(itemId)
        } else {
          // Can't move, put it back
          newRondas[i].splice(idx, 0, itemId)
        }
        break
      }
    }
    // Remove empty rondas
    setServiceRondas(newRondas.filter(r => r.length > 0))
  }

  const addRonda = () => {
    setServiceRondas([...serviceRondas, []])
  }

  const removeRonda = (index: number) => {
    if (serviceRondas.length <= 1) return
    const newRondas = [...serviceRondas]
    // Move items to previous ronda
    if (newRondas[index].length > 0 && index > 0) {
      newRondas[index - 1] = [...newRondas[index - 1], ...newRondas[index]]
    }
    newRondas.splice(index, 1)
    setServiceRondas(newRondas)
  }

  const setAllInOneRonda = () => {
    setServiceRondas([pendingItems.map(i => i.id)])
  }

  const setOnePerRonda = () => {
    setServiceRondas(pendingItems.map(i => [i.id]))
  }

  const moveItemInOrder = (itemId: string, direction: 'up' | 'down') => {
    // For uno_a_uno mode: reorder within single ronda
    const items = [...serviceRondas[0] || []]
    const idx = items.indexOf(itemId)
    if (idx === -1) return
    if (direction === 'up' && idx > 0) {
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
    } else if (direction === 'down' && idx < items.length - 1) {
      [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]
    }
    setServiceRondas([items])
  }

  const pendingItems = order?.items.filter(i => i.status === 'pending') || []
  const sentItems = order?.items.filter(i => i.status !== 'pending') || []
  const pendingTotal = pendingItems.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0)
  const totalItems = order?.items.reduce((sum, i) => sum + i.quantity, 0) || 0

  // Generate kitchen ticket HTML for printing
  const generateKitchenTicketHTML = (
    items: typeof pendingItems,
    tableLabel: string,
    comensales: number
  ): string => {
    const now = new Date()
    const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    
    const ordenServicio = order?.orden_servicio || 'sin_orden'
    const notaMesa = order?.nota_mesa
    const rondas = order?.rondas || []
    
    // Build nota mesa section
    const notaHTML = notaMesa ? `
      <div class="nota-box">
        <strong>NOTA:</strong> ${notaMesa}
      </div>` : ''
    
    // Build banner for service mode
    let bannerHTML = ''
    if (ordenServicio === 'todo_junto') {
      bannerHTML = '<div class="banner">⚠️ SERVIR TODO JUNTO</div>'
    }
    
    // Build items HTML based on service mode
    let itemsHTML = ''
    
    if (ordenServicio === 'por_rondas' && rondas.length > 0) {
      rondas.forEach((rondaItemIds, idx) => {
        const rondaItems = items.filter(i => rondaItemIds.includes(i.id))
        if (rondaItems.length === 0) return
        itemsHTML += `<div class="ronda-header">── RONDA ${idx + 1} ──</div>`
        rondaItems.forEach(i => {
          itemsHTML += `
            <div class="item">
              <span class="qty">${i.quantity}x</span>
              <span class="name">${i.name}</span>
              ${i.notes ? `<div class="note">→ ${i.notes}</div>` : ''}
            </div>`
        })
      })
    } else if (ordenServicio === 'uno_a_uno' && rondas[0]) {
      rondas[0].forEach((itemId, idx) => {
        const item = items.find(i => i.id === itemId)
        if (!item) return
        itemsHTML += `
          <div class="item">
            <span class="order-num">${idx + 1}.</span>
            <span class="qty">${item.quantity}x</span>
            <span class="name">${item.name}</span>
            ${item.notes ? `<div class="note">→ ${item.notes}</div>` : ''}
          </div>`
      })
    } else {
      // sin_orden or todo_junto: normal list
      items.filter(i => i.status === 'pending').forEach(i => {
        itemsHTML += `
          <div class="item">
            <span class="qty">${i.quantity}x</span>
            <span class="name">${i.name}</span>
            ${i.notes ? `<div class="note">→ ${i.notes}</div>` : ''}
          </div>`
      })
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Comanda - Mesa ${tableLabel}</title>
<style>
  body { font-family: monospace; width: 300px; margin: 0 auto; padding: 20px; }
  h2 { text-align: center; font-size: 18px; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-top: 0; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  .banner { background: #000; color: #fff; text-align: center; padding: 8px; font-weight: bold; font-size: 14px; margin-bottom: 12px; }
  .nota-box { border: 2px solid #000; padding: 8px; margin-bottom: 12px; font-size: 13px; }
  .ronda-header { text-align: center; font-weight: bold; margin: 12px 0 8px 0; font-size: 14px; }
  .item { font-size: 16px; margin: 8px 0; }
  .qty { font-weight: bold; margin-right: 8px; }
  .order-num { font-weight: bold; margin-right: 4px; }
  .note { font-size: 12px; color: #555; margin-left: 24px; font-style: italic; }
  .divider { border-top: 1px dashed #000; margin: 12px 0; }
  @media print { body { width: 100%; } }
</style>
</head>
<body>
  <h2>COCINA</h2>
  <div class="meta">
    <strong>Mesa ${tableLabel}</strong> · ${comensales} pax<br>
    Hora: ${time}
  </div>
  <div class="divider"></div>
  ${notaHTML}
  ${bannerHTML}
  ${itemsHTML}
  <div class="divider"></div>
</body>
</html>`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const activeItems = menu.find(c => c.id === activeCategory)?.items || []

  // Order summary component (reused in both mobile sheet and desktop panel)
  const OrderSummary = ({ inSheet = false }: { inSheet?: boolean }) => (
    <div className={cn("flex flex-col", inSheet ? "h-full" : "h-full")}>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Pending items */}
          {pendingItems.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
                Por enviar
              </h3>
              <div className="space-y-2">
                {pendingItems.map(item => (
                  <div key={item.id} className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.price != null ? `${item.price.toFixed(2)}€` : 'Consultar'}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Note button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditingNote(item.id, item.notes)}
                        >
                          <StickyNote className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-6 text-center font-medium text-sm">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        {/* Cancel button */}
                        <Popover open={cancelItemId === item.id} onOpenChange={(open) => {
                          if (open) setCancelItemId(item.id)
                          else { setCancelItemId(null); setCancelMotivo('') }
                        }}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64" align="end">
                            <div className="space-y-3">
                              <p className="font-medium text-sm">Cancelar item</p>
                              <Input
                                placeholder="Motivo (opcional)"
                                value={cancelMotivo}
                                onChange={(e) => setCancelMotivo(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => { setCancelItemId(null); setCancelMotivo('') }}
                                >
                                  No cancelar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => handleCancelItem(item.id)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {/* Note editing */}
                    {editingNoteId === item.id && (
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Nota para cocina..."
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNote(item.id)
                            if (e.key === 'Escape') { setEditingNoteId(null); setNoteText('') }
                          }}
                        />
                        <Button size="sm" onClick={() => handleSaveNote(item.id)}>
                          OK
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sent items */}
          {sentItems.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Enviado
              </h3>
              <div className="space-y-1">
                {sentItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm text-muted-foreground py-1 group">
                    <div className="flex-1">
                      <span>{item.quantity}x {item.name}</span>
                      {item.notes && (
                        <p className="text-xs italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>
                        {item.price != null ? `${((item.price ?? 0) * item.quantity).toFixed(2)}€` : 'Consultar'}
                      </span>
                      {/* Cancel button for in_kitchen items */}
                      {item.status === 'in_kitchen' && (
                        <Popover open={cancelItemId === item.id} onOpenChange={(open) => {
                          if (open) setCancelItemId(item.id)
                          else { setCancelItemId(null); setCancelMotivo('') }
                        }}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64" align="end">
                            <div className="space-y-3">
                              <p className="font-medium text-sm">Cancelar item enviado</p>
                              <Input
                                placeholder="Motivo (requerido)"
                                value={cancelMotivo}
                                onChange={(e) => setCancelMotivo(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => { setCancelItemId(null); setCancelMotivo('') }}
                                >
                                  No cancelar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => handleCancelItem(item.id)}
                                  disabled={!cancelMotivo.trim()}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order?.items.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Toca un producto para añadirlo
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Footer with total and send button */}
      <div className="flex-shrink-0 border-t p-3 space-y-3 bg-background">
        {/* Service config badges */}
        {(order?.orden_servicio !== 'sin_orden' || order?.nota_mesa) && (
          <div className="flex flex-wrap gap-2">
            {order?.orden_servicio === 'todo_junto' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                <Shuffle className="h-3 w-3" />
                Todo junto
              </span>
            )}
            {order?.orden_servicio === 'por_rondas' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                <Shuffle className="h-3 w-3" />
                Por rondas ({order?.rondas?.length || 0})
              </span>
            )}
            {order?.orden_servicio === 'uno_a_uno' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">
                <Shuffle className="h-3 w-3" />
                Uno a uno
              </span>
            )}
            {order?.nota_mesa && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                <FileText className="h-3 w-3" />
                Nota
              </span>
            )}
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-bold">{(order?.total || 0).toFixed(2)}€</span>
        </div>
        
        {/* Service config button - only show if pending items */}
        {pendingItems.length > 0 && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={openServiceSheet}
          >
            <Shuffle className="h-4 w-4" />
            Orden de servicio
          </Button>
        )}
        
        {pendingItems.length > 0 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={isUrgente ? "destructive" : "outline"}
              className="flex-shrink-0 gap-1"
              onClick={() => setIsUrgente(!isUrgente)}
            >
              <Zap className="h-4 w-4" />
              {isUrgente ? 'Urgente' : 'Normal'}
            </Button>
            <Button 
              className="flex-1 gap-2" 
              size="lg"
              onClick={handleSendToKitchen}
              disabled={sending}
            >
              <Send className="h-4 w-4" />
              Enviar ({pendingTotal.toFixed(2)}€)
            </Button>
          </div>
        )}
        
        {pendingItems.length === 0 && (
          <Button 
            className="w-full gap-2" 
            size="lg"
            disabled
          >
            Todo enviado
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <style jsx global>{`
        @keyframes fadeInOut {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href="/comandas">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Mesa {tableName}</h1>
          </div>
          {/* Comensales */}
          <div className="flex items-center gap-2 bg-muted rounded-lg px-2 py-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleComensalesChange(-1)}
              disabled={order?.comensales === 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 min-w-[3rem] justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{order?.comensales || 1}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleComensalesChange(1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Menu section - full width on mobile, left panel on desktop */}
        <div className="flex-1 flex flex-col lg:border-r">
          {/* Category tabs */}
          <ScrollArea className="flex-shrink-0 border-b">
            <div className="flex gap-1 p-2">
              {menu.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors touch-manipulation',
                    activeCategory === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Menu items grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2 p-3 pb-24 lg:pb-3">
              {activeItems.map(item => {
                const isAdded = lastAddedId === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTapMenuItem(
                      item,
                      menu.find(c => c.id === activeCategory)?.printer_target || undefined
                    )}
                    className={cn(
                      "relative flex flex-col items-start p-3 rounded-lg border bg-card text-left touch-manipulation transition-transform duration-150",
                      isAdded ? "scale-95" : "hover:bg-accent active:scale-95"
                    )}
                  >
                    {/* Green checkmark overlay */}
                    <div 
                      className={cn(
                        "absolute inset-0 bg-green-500/90 rounded-lg flex items-center justify-center transition-opacity duration-300",
                        isAdded ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}
                      style={{ 
                        animation: isAdded ? 'fadeInOut 600ms ease-out forwards' : 'none'
                      }}
                    >
                      <Check className="h-8 w-8 text-white" strokeWidth={3} />
                    </div>
                    <span className="font-medium text-sm line-clamp-2">{item.name}</span>
                    <span className="text-sm text-muted-foreground mt-1">
                      {item.price != null ? `${item.price.toFixed(2)}€` : 'Consultar'}
                    </span>
                  </button>
                )
              })}
              {activeItems.length === 0 && (
                <p className="col-span-full text-center text-muted-foreground py-8">
                  No hay productos en esta categoría
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

{/* Desktop: Right panel - order summary (hidden on mobile) */}
  <div className="hidden lg:flex w-96 flex-col bg-muted/30">
          <div className="flex-shrink-0 p-3 border-b">
            <h2 className="font-semibold">Comanda</h2>
          </div>
          <OrderSummary />
        </div>
      </div>

      {/* Mobile: Floating button + Sheet (hidden on desktop) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button 
              className="w-full h-14 rounded-xl text-base gap-3 bg-amber-500 hover:bg-amber-600 text-white shadow-lg"
              size="lg"
            >
              <ShoppingBag className="h-5 w-5" />
              <span>Ver comanda</span>
              {totalItems > 0 && (
                <>
                  <span className="font-medium">· {totalItems} items</span>
                  <span className="font-bold">· {(order?.total || 0).toFixed(2)}€</span>
                </>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0">
            <SheetHeader className="px-4 py-3 border-b">
              <SheetTitle>Comanda - Mesa {tableName}</SheetTitle>
              <SheetDescription>
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'} · Total: {(order?.total || 0).toFixed(2)}€
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <OrderSummary inSheet />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Success toast */}
      {showToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <Check className="h-5 w-5" />
          <span className="font-medium">Pedido enviado</span>
        </div>
      )}

      {/* Service config saved toast */}
      {showServiceSavedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <Check className="h-5 w-5" />
          <span className="font-medium">Configuracion guardada</span>
        </div>
      )}

      {/* Modifier sheet */}
      <Sheet open={modifierSheetOpen} onOpenChange={setModifierSheetOpen}>
        <SheetContent side="bottom" className="h-[80dvh] flex flex-col p-0">
          {/* Fixed header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b">
            <SheetTitle>{selectedItem?.name}</SheetTitle>
            <SheetDescription>
              {selectedItem?.price ? `${selectedItem.price.toFixed(2)}€` : 'Consultar precio'}
            </SheetDescription>
          </div>
          
          {/* Scrollable modifier groups */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
            {selectedItem?.modifier_groups?.map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-medium">{group.name}</h3>
                  {group.required && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Obligatorio</span>
                  )}
                  {group.multi_select && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Varios</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(group.options || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">Sin opciones configuradas</p>
                  )}
                  {(group.options || []).map(option => {
                    const isSelected = isModifierSelected(group.id, option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleModifierOption(group.id, option.id, group.multi_select)}
                        className={cn(
                          "px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors min-h-[48px]",
                          isSelected
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "bg-background border-input hover:border-amber-300"
                        )}
                      >
                        {option.name}
                        {option.price_delta > 0 && (
                          <span className="ml-1 opacity-75">+{option.price_delta.toFixed(2)}€</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Fixed footer */}
          <div className="flex-shrink-0 px-4 py-3 border-t">
            <Button
              type="button"
              className="w-full bg-amber-500 hover:bg-amber-600 h-14 text-lg"
              onClick={handleConfirmModifiers}
              disabled={addingItem || !canConfirmModifiers()}
            >
              {addingItem ? 'Anadiendo...' : `Anadir · ${calculateModifierTotal().toFixed(2)}€`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Service config sheet */}
      <Sheet open={serviceSheetOpen} onOpenChange={setServiceSheetOpen}>
        <SheetContent side="bottom" className="h-[90dvh] flex flex-col p-0">
          {/* Fixed header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b">
            <SheetTitle>Orden de servicio · Mesa {tableName}</SheetTitle>
            <SheetDescription>
              Configura como quieres que la cocina sirva los platos
            </SheetDescription>
          </div>
          
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-6">
              {/* Mode selector */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Modo de servicio</label>
                <ToggleGroup 
                  type="single" 
                  value={serviceMode} 
                  onValueChange={(v) => v && setServiceMode(v as OrdenServicio)}
                  className="grid grid-cols-2 gap-2"
                >
                  <ToggleGroupItem value="sin_orden" className="h-12 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Sin orden
                  </ToggleGroupItem>
                  <ToggleGroupItem value="todo_junto" className="h-12 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Todo junto
                  </ToggleGroupItem>
                  <ToggleGroupItem value="por_rondas" className="h-12 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Por rondas
                  </ToggleGroupItem>
                  <ToggleGroupItem value="uno_a_uno" className="h-12 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Uno a uno
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Mode-specific content */}
              <div className="rounded-lg border p-4 bg-muted/30">
                {serviceMode === 'sin_orden' && (
                  <p className="text-sm text-muted-foreground">
                    La cocina servira los platos segun vayan estando listos.
                  </p>
                )}

                {serviceMode === 'todo_junto' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      La cocina esperara a tener todos los platos listos antes de servir.
                    </p>
                    <div className="space-y-1">
                      {pendingItems.map(item => (
                        <div key={item.id} className="text-sm py-1">
                          {item.quantity}x {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {serviceMode === 'por_rondas' && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={setAllInOneRonda}>
                        Todo en una ronda
                      </Button>
                      <Button variant="outline" size="sm" onClick={setOnePerRonda}>
                        Una ronda por plato
                      </Button>
                    </div>
                    
                    {serviceRondas.map((rondaItems, rondaIdx) => (
                      <div key={rondaIdx} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">Ronda {rondaIdx + 1}</span>
                          {serviceRondas.length > 1 && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive h-8"
                              onClick={() => removeRonda(rondaIdx)}
                            >
                              Eliminar
                            </Button>
                          )}
                        </div>
                        {rondaItems.map(itemId => {
                          const item = pendingItems.find(i => i.id === itemId)
                          if (!item) return null
                          return (
                            <div key={itemId} className="flex items-center justify-between bg-background rounded p-2">
                              <span className="text-sm">{item.quantity}x {item.name}</span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => moveItemBetweenRondas(itemId, 'up')}
                                  disabled={rondaIdx === 0}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => moveItemBetweenRondas(itemId, 'down')}
                                  disabled={rondaIdx === serviceRondas.length - 1}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                        {rondaItems.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Mueve platos aqui
                          </p>
                        )}
                      </div>
                    ))}
                    
                    <Button variant="outline" className="w-full" onClick={addRonda}>
                      + Anadir ronda
                    </Button>
                  </div>
                )}

                {serviceMode === 'uno_a_uno' && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">
                      Los platos se serviran uno a uno en este orden:
                    </p>
                    {(serviceRondas[0] || []).map((itemId, idx) => {
                      const item = pendingItems.find(i => i.id === itemId)
                      if (!item) return null
                      return (
                        <div key={itemId} className="flex items-center justify-between bg-background rounded p-2">
                          <span className="text-sm">
                            <span className="font-bold mr-2">{idx + 1}.</span>
                            {item.quantity}x {item.name}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => moveItemInOrder(itemId, 'up')}
                              disabled={idx === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => moveItemInOrder(itemId, 'down')}
                              disabled={idx === (serviceRondas[0]?.length || 0) - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Nota de mesa */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Nota de mesa</label>
                </div>
                <Textarea
                  placeholder="Alergicos, tienen prisa, punto de la carne, cualquier indicacion..."
                  value={serviceNote}
                  onChange={(e) => setServiceNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Fixed footer */}
          <div className="flex-shrink-0 px-4 py-3 border-t flex gap-2">
            <Button 
              type="button"
              variant="outline" 
              className="flex-1"
              onClick={() => setServiceSheetOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="button"
              className="flex-1 bg-amber-500 hover:bg-amber-600"
              onClick={handleSaveServiceConfig}
              disabled={savingService}
            >
              {savingService ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </>
  )
}
