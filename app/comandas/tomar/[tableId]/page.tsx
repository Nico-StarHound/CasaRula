'use client'

// Table order page v3 - responsive, tap animation, null-safe prices, toast + navigation
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Plus, Minus, Send, ShoppingBag, Check, X, StickyNote, Shuffle, ChevronUp, ChevronDown, FileText, Zap, Scissors, ArrowUpDown, AlertTriangle, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionWatcher } from '@/components/session-watcher'
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
import { CustomItemModal } from '@/components/custom-item-modal'
import { ChefHat, Coffee } from 'lucide-react'

export default function TableOrderPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)
  const router = useRouter()
  
  const [tableName, setTableName] = useState('')
  const [showToast, setShowToast] = useState(false)
  // Persistent error banner if "enviar a cocina" fails (network down, server error...).
  // We do NOT auto-dismiss this — the user has to see it and retry, because
  // assuming a comanda was sent when it wasn't is the worst-case bug in service.
  const [sendError, setSendError] = useState<string | null>(null)
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

  // Modal de item custom (categoría OTROS). Cuando es null → cerrado.
  // Cuando vale 'cocina' o 'barra' → abierto con ese destino fijado.
  const [customModalDest, setCustomModalDest] = useState<'cocina' | 'barra' | null>(null)
  
  // Service config state
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)
  const [serviceMode, setServiceMode] = useState<OrdenServicio>('sin_orden')
  const [serviceNote, setServiceNote] = useState('')
  const [serviceRondas, setServiceRondas] = useState<string[][]>([])
  // New unified UI: ordered list of "tandas" (rounds). Each has a list of
  // item ids and a "simultaneous" flag (kitchen waits for all items before serving).
  // - 1 tanda + simultaneous=true  → todo_junto
  // - 1 tanda + simultaneous=false → sin_orden
  // - N tandas (any flag)          → por_rondas
  const [tandas, setTandas] = useState<Array<{ items: string[]; simultaneous: boolean }>>([])
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
      setTableName(table?.label || '')
      setLoading(false)
    }
    load()
  }, [tableId])

  const handleTapMenuItem = (item: MenuItem, categoryPrinterTarget?: string) => {
    const hasModifiers = Array.isArray(item.modifier_groups) && item.modifier_groups.length > 0

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

  /**
   * Añadir item custom (sin entry en menu_items). Lo dispara el modal
   * CustomItemModal al confirmar, desde los botones grandes "Otros a
   * cocina / Otros a barra" que aparecen en la categoría OTROS.
   *
   * No hay menu_item_id porque el item no existe en la BBDD. El
   * server action addItemToOrder lo acepta así — guarda solo el
   * snapshot de nombre/precio/notas en order_items.
   *
   * Devuelve true al padre si OK para que cierre el modal. Si false,
   * el modal muestra error y deja al usuario reintentar.
   */
  const handleAddCustomItem = async (
    data: { name: string; price: number; notes?: string },
    destination: 'cocina' | 'barra'
  ): Promise<boolean> => {
    if (!order) return false
    const res = await addItemToOrder(order.id, {
      name: data.name,
      price: data.price,
      quantity: 1,
      notes: data.notes,
      printer_target: destination,
    })
    if (!res.success) return false
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    return true
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
  setSendError(null)

  // Critical path: do NOT show the success toast or navigate until we have
  // confirmation from the server that the comanda was accepted. If the
  // network is flaky (typical in restaurant gardens / far tables) or the
  // server returns success:false, the items stay 'pending' on screen and
  // the camarero can retry. Better to look like the button is sticky than
  // to lose a pedido silently.
  try {
    if (isUrgente) {
      await setOrderUrgente(order.id, true)
    }

    const result = await sendToKitchen(order.id)

    if (!result.success) {
      // Server reachable but it told us something went wrong (e.g. printer
      // queue insert failed). Items are still pending in DB — retry is safe.
      setSendError('No se pudo enviar a cocina. Vuelve a intentarlo.')
      setSending(false)
      return
    }

    // Confirmed accepted — refresh state from DB, success toast, navigate.
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setSending(false)
    setSheetOpen(false)
    setShowToast(true)
    setTimeout(() => {
      router.push('/mapa')
    }, 1000)
  } catch (e) {
    // Network error, timeout, server 5xx, etc. The action either never
    // reached the server, or we don't know its outcome. Stay on screen
    // with the pending items visible so the camarero can retry once the
    // connection comes back. Do NOT navigate.
    console.error('[sendToKitchen]', e)
    setSendError('Sin conexión o error del servidor. La comanda NO se ha enviado. Reintenta cuando recuperes la red.')
    setSending(false)
  }
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
    // Initialize from the saved order. We collapse the four legacy modes into
    // the new "tandas" representation:
    //   sin_orden    → 1 tanda, simultaneous=false
    //   todo_junto   → 1 tanda, simultaneous=true
    //   por_rondas   → N tandas (preserve order), simultaneous=true on all
    //   uno_a_uno    → N tandas (1 item each), simultaneous=false
    setServiceNote(order?.nota_mesa || '')

    const allItemIds = pendingItems.map(i => i.id)
    const mode = order?.orden_servicio || 'sin_orden'
    const savedRondas = order?.rondas || []

    if (mode === 'sin_orden') {
      setTandas([{ items: allItemIds, simultaneous: false }])
    } else if (mode === 'todo_junto') {
      setTandas([{ items: allItemIds, simultaneous: true }])
    } else if (mode === 'por_rondas' && savedRondas.length > 0) {
      // Reuse saved rondas, but also pick up any items added after the config
      // was last saved (so they don't silently disappear from the UI).
      const known = new Set(savedRondas.flat())
      const extra = allItemIds.filter(id => !known.has(id))
      const restored = savedRondas
        .map(items => ({ items: items.filter(id => allItemIds.includes(id)), simultaneous: true }))
        .filter(t => t.items.length > 0)
      if (extra.length > 0) {
        restored.push({ items: extra, simultaneous: true })
      }
      setTandas(restored.length > 0 ? restored : [{ items: allItemIds, simultaneous: false }])
    } else if (mode === 'uno_a_uno' && savedRondas[0]) {
      setTandas(savedRondas[0].map(id => ({ items: [id], simultaneous: false })))
    } else {
      setTandas([{ items: allItemIds, simultaneous: false }])
    }

    setServiceSheetOpen(true)
  }

  const handleSaveServiceConfig = async () => {
    if (!order) return
    setSavingService(true)

    // Map "tandas" back to the legacy fields. Empty tandas are dropped.
    const filled = tandas.filter(t => t.items.length > 0)
    let mode: OrdenServicio
    let rondas: string[][] | null
    if (filled.length === 0) {
      mode = 'sin_orden'
      rondas = null
    } else if (filled.length === 1) {
      mode = filled[0].simultaneous ? 'todo_junto' : 'sin_orden'
      rondas = null
    } else {
      mode = 'por_rondas'
      rondas = filled.map(t => t.items)
    }

    await updateOrderServiceConfig(order.id, {
      nota_mesa: serviceNote,
      orden_servicio: mode,
      rondas: rondas
    })
    setServiceMode(mode)
    setServiceRondas(rondas || [])
    const updated = await getOrCreateOrder(tableId)
    setOrder(updated)
    setSavingService(false)
    setServiceSheetOpen(false)
    setShowServiceSavedToast(true)
    setTimeout(() => setShowServiceSavedToast(false), 2000)
  }

  // Tandas helpers — operate on the new unified state
  const moveItem = (itemId: string, direction: 'up' | 'down') => {
    setTandas(prev => {
      const next = prev.map(t => ({ ...t, items: [...t.items] }))
      // Locate item
      let tandaIdx = -1
      let itemIdx = -1
      for (let i = 0; i < next.length; i++) {
        const idx = next[i].items.indexOf(itemId)
        if (idx !== -1) { tandaIdx = i; itemIdx = idx; break }
      }
      if (tandaIdx === -1) return prev

      if (direction === 'up') {
        if (itemIdx > 0) {
          // Swap inside the same tanda
          const arr = next[tandaIdx].items
          ;[arr[itemIdx - 1], arr[itemIdx]] = [arr[itemIdx], arr[itemIdx - 1]]
        } else if (tandaIdx > 0) {
          // Move to end of previous tanda
          next[tandaIdx].items.splice(itemIdx, 1)
          next[tandaIdx - 1].items.push(itemId)
        }
      } else {
        const arr = next[tandaIdx].items
        if (itemIdx < arr.length - 1) {
          ;[arr[itemIdx], arr[itemIdx + 1]] = [arr[itemIdx + 1], arr[itemIdx]]
        } else if (tandaIdx < next.length - 1) {
          next[tandaIdx].items.splice(itemIdx, 1)
          next[tandaIdx + 1].items.unshift(itemId)
        }
      }
      return next.filter(t => t.items.length > 0)
    })
  }

  const toggleTandaSimultaneous = (idx: number) => {
    setTandas(prev => prev.map((t, i) => i === idx ? { ...t, simultaneous: !t.simultaneous } : t))
  }

  // Split: take everything from `splitAt` index onwards in tanda `tandaIdx`
  // and move it to a new tanda right after.
  const splitTandaAt = (tandaIdx: number, splitAt: number) => {
    setTandas(prev => {
      const next = prev.map(t => ({ ...t, items: [...t.items] }))
      const tail = next[tandaIdx].items.splice(splitAt)
      if (tail.length === 0) return prev
      next.splice(tandaIdx + 1, 0, { items: tail, simultaneous: next[tandaIdx].simultaneous })
      return next
    })
  }

  // Merge tanda `tandaIdx` into the previous one.
  const mergeTandaWithPrev = (tandaIdx: number) => {
    if (tandaIdx === 0) return
    setTandas(prev => {
      const next = prev.map(t => ({ ...t, items: [...t.items] }))
      next[tandaIdx - 1].items.push(...next[tandaIdx].items)
      next.splice(tandaIdx, 1)
      return next
    })
  }

  // Legacy helpers kept for any external callers that might still rely on them.
  // No longer used by the new UI.
  const moveItemBetweenRondas = (_itemId: string, _direction: 'up' | 'down') => { /* legacy */ }
  const addRonda = () => { /* legacy */ }
  const removeRonda = (_index: number) => { /* legacy */ }
  const setAllInOneRonda = () => { /* legacy */ }
  const setOnePerRonda = () => { /* legacy */ }
  const moveItemInOrder = (_itemId: string, _direction: 'up' | 'down') => { /* legacy */ }
  void moveItemBetweenRondas; void addRonda; void removeRonda
  void setAllInOneRonda; void setOnePerRonda; void moveItemInOrder

  // Reorder helper: when the order has explicit rondas configured (via
  // the "tandas" sheet), respect that order in the main comanda view.
  // Otherwise fall back to insertion order (created_at, which is how
  // the server already returns them).
  //
  // Without this, after the waiter reordered tandas and pressed Guardar,
  // the main list still showed items in their original add order — which
  // is confusing because the "new order" only became visible inside the
  // tandas sheet again. The kitchen ticket already respects rondas, but
  // visual feedback on the screen was missing.
  function sortByRondas<T extends { id: string }>(arr: T[]): T[] {
    const rondas = order?.rondas
    if (!rondas || rondas.length === 0) return arr
    // Build a map: itemId -> sequential position across all rondas.
    const posMap = new Map<string, number>()
    let pos = 0
    for (const ronda of rondas) {
      for (const itemId of ronda) {
        posMap.set(itemId, pos++)
      }
    }
    // Items present in rondas first (in ronda order), then any items
    // not yet placed in a ronda (newly added since last Guardar) appended
    // at the end in their original order.
    return [...arr].sort((a, b) => {
      const pa = posMap.has(a.id) ? posMap.get(a.id)! : Number.MAX_SAFE_INTEGER
      const pb = posMap.has(b.id) ? posMap.get(b.id)! : Number.MAX_SAFE_INTEGER
      return pa - pb
    })
  }

  const pendingItems = sortByRondas(order?.items.filter(i => i.status === 'pending') || [])
  const sentItems = sortByRondas(order?.items.filter(i => i.status !== 'pending') || [])
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

  // If we couldn't resolve a table label, the tableId in the URL is invalid.
  // Show a friendly error rather than letting the user think this is a real mesa.
  if (!tableName) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Mesa no encontrada</h1>
        <p className="text-muted-foreground max-w-sm">
          La mesa indicada en la URL no existe. Vuelve al mapa y selecciónala desde ahí.
        </p>
        <Link href="/mapa">
          <Button variant="outline">Volver al mapa</Button>
        </Link>
      </div>
    )
  }

  const activeItems = menu.find(c => c.id === activeCategory)?.items || []

  // Order summary component (reused in both mobile sheet and desktop panel)
  const OrderSummary = ({ inSheet = false }: { inSheet?: boolean }) => (
    <div className={cn("flex flex-col min-h-0", inSheet ? "h-full" : "h-full")}>
      {/* `min-h-0` aquí Y en el ScrollArea wrapper es clave.
          Sin él, el ScrollArea de shadcn (que vive sobre Radix
          ScrollAreaPrimitive) toma todo el contenido como altura
          natural en lugar de respetar el flex-1 del padre. Resultado:
          la lista de items crece sin scroll cuando hay muchos, y el
          footer con el botón "Enviar" se sale fuera de la zona
          visible del sheet — el usuario no puede pulsarlo. */}
      <ScrollArea className="flex-1 min-h-0">
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
                      {/* Cancel button for in_kitchen items.
                          Antes: Popover anidado por item — fallaba en táctil
                          porque el blur del input cerraba el Popover, y el
                          tap pasaba a través al precio. Ahora: el botón solo
                          abre un Sheet unificado (montado al final del JSX),
                          controlado por cancelItemId. Mucho más fiable en
                          tablet. */}
                      {item.status === 'in_kitchen' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 touch-manipulation"
                          onClick={() => {
                            setCancelItemId(item.id)
                            setCancelMotivo('')
                          }}
                        >
                          <X className="h-5 w-5" />
                        </Button>
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
          // Nothing pending to send. We don't show "Cuenta" here anymore
          // because the sticky button at the top of the screen already
          // handles that — having it in two places caused mis-taps when
          // the layout shifted. This bottom slot just shows a disabled
          // hint that the order is fully sent, which is useful context.
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
      <SessionWatcher />
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link href="/mapa">
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

      {/* Sticky top bar with "Cuenta" button.
          Sits between the header and the menu so the cajera/camarera
          ALWAYS has it visible at the top. Before, the entry to /cuenta
          was at the bottom of the screen (replacing or next to the
          "Enviar" button), which caused mis-taps: when the keyboard or
          a sheet collapsed and shifted the layout, the bottom button
          jumped and people tapped it accidentally. Up here it's stable
          and out of the way of the action buttons below.
          Hidden when order.total === 0 (mesa nueva sin nada cobrable). */}
      {order && order.total > 0 && (
        <div className="flex-shrink-0 border-b bg-background px-4 py-2">
          <Button
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
            onClick={() => router.push(`/cuenta/${tableId}`)}
          >
            <CreditCard className="h-4 w-4" />
            Cuenta · {order.total.toFixed(2)}€
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Menu section - full width on mobile, left panel on desktop */}
        <div className="flex-1 flex flex-col lg:border-r">
          {/* Category tabs.
              Multi-fila con flex-wrap: cuando las categorías no caben
              en una sola línea, saltan a la siguiente. Antes era un
              ScrollArea horizontal con whitespace-nowrap; en tablets
              estrechas (Lenovo / Redmi) el scroll lateral pasaba
              desapercibido y categorías como CAFES E INF o AGUA Y
              REFRESCOS no se veían sin tocar y arrastrar.
              Ahora ocupa más altura pero todas visibles siempre. */}
          <div className="flex-shrink-0 border-b">
            <div className="flex flex-wrap gap-1 p-2">
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
          </div>

          {/* Menu items grid.
              Caso especial: si la categoría activa es OTROS (comodín
              para items que no están en la carta), en lugar de mostrar
              los items normales mostramos dos botones grandes que abren
              el modal de item custom. El camarero teclea nombre +
              precio + notas y el item va directo a cocina o a barra
              según qué botón haya pulsado. */}
          <ScrollArea className="flex-1">
            {menu.find(c => c.id === activeCategory)?.name === 'OTROS' ? (
              <div className="flex flex-col gap-3 p-3 pb-24 lg:pb-3">
                <p className="text-sm text-muted-foreground text-center mb-1">
                  Crea un item personalizado y elige a dónde se envía.
                </p>
                <button
                  onClick={() => setCustomModalDest('cocina')}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed bg-card hover:bg-accent active:scale-95 transition-all touch-manipulation"
                >
                  <ChefHat className="h-10 w-10 text-primary" />
                  <span className="font-semibold text-base">Otros a cocina</span>
                  <span className="text-xs text-muted-foreground">
                    Plato custom para cocina
                  </span>
                </button>
                <button
                  onClick={() => setCustomModalDest('barra')}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed bg-card hover:bg-accent active:scale-95 transition-all touch-manipulation"
                >
                  <Coffee className="h-10 w-10 text-primary" />
                  <span className="font-semibold text-base">Otros a barra</span>
                  <span className="text-xs text-muted-foreground">
                    Bebida o consumición custom para barra
                  </span>
                </button>
              </div>
            ) : (
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
            )}
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

      {/* Send error banner — persistent until user dismisses or retries.
          Critical for network-flaky locations (e.g. garden tables): if the
          comanda didn't make it to the server, we MUST make that visible
          instead of pretending success. */}
      {sendError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{sendError}</div>
          <button
            onClick={() => setSendError(null)}
            className="flex-shrink-0 hover:opacity-80"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
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
              {/* Tandas — single unified UI replaces the old mode selector. */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Tandas de salida</label>
                  <span className="text-xs text-muted-foreground">
                    {tandas.length} {tandas.length === 1 ? 'tanda' : 'tandas'}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Usa las flechas para mover platos. Pulsa <span className="inline-flex items-center gap-0.5"><Scissors className="h-3 w-3 inline" /> Separar</span> entre dos platos para dividir la tanda.
                </p>

                <div className="space-y-3">
                  {tandas.map((tanda, tandaIdx) => (
                    <div key={tandaIdx} className="border-2 rounded-lg overflow-hidden">
                      {/* Tanda header */}
                      <div className="flex items-center justify-between bg-muted/40 px-3 py-2 border-b">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            Tanda {tandaIdx + 1}
                          </span>
                          {tandaIdx > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => mergeTandaWithPrev(tandaIdx)}
                            >
                              ↑ Unir con anterior
                            </Button>
                          )}
                        </div>
                        <Button
                          variant={tanda.simultaneous ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => toggleTandaSimultaneous(tandaIdx)}
                        >
                          <Users className="h-3 w-3" />
                          {tanda.simultaneous ? 'Todo a la vez' : 'Según lista'}
                        </Button>
                      </div>

                      {/* Items in this tanda — vertical cells with arrows + split-after */}
                      <div className="divide-y">
                        {tanda.items.map((itemId, itemIdx) => {
                          const item = pendingItems.find(i => i.id === itemId)
                          if (!item) return null
                          const isLastInTanda = itemIdx === tanda.items.length - 1

                          return (
                            <div key={itemId}>
                              <div className="flex items-center gap-2 px-3 py-2 bg-background">
                                <span className="flex-1 text-sm">
                                  <span className="font-medium">{item.quantity}x</span>{' '}
                                  {item.name}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => moveItem(itemId, 'up')}
                                  disabled={tandaIdx === 0 && itemIdx === 0}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => moveItem(itemId, 'down')}
                                  disabled={
                                    tandaIdx === tandas.length - 1 &&
                                    itemIdx === tanda.items.length - 1
                                  }
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Split-after-this-item separator (not on last item of last tanda) */}
                              {!isLastInTanda && (
                                <button
                                  type="button"
                                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 py-1 flex items-center justify-center gap-1 border-y border-dashed border-transparent hover:border-muted-foreground/40 transition-colors"
                                  onClick={() => splitTandaAt(tandaIdx, itemIdx + 1)}
                                >
                                  <Scissors className="h-3 w-3" />
                                  Separar aquí
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {tanda.items.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            Tanda vacía — se eliminará al guardar
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* Modal de item custom (categoría OTROS).
          customModalDest controla apertura + destino. null = cerrado. */}
      <CustomItemModal
        open={customModalDest !== null}
        destination={customModalDest || 'cocina'}
        onClose={() => setCustomModalDest(null)}
        onConfirm={async (data) => {
          if (!customModalDest) return false
          return handleAddCustomItem(data, customModalDest)
        }}
      />

      {/* Sheet de cancelación de item ya enviado a cocina/barra.
          Único en todo el componente — se controla con cancelItemId
          (id del item a cancelar, null si está cerrado). Antes había
          un Popover por item, lo que fallaba en táctil: al tocar el
          campo de motivo, a veces el Popover detectaba blur y se
          cerraba, dejando el tap "perdido". Un Sheet único que sube
          desde abajo es el patrón estándar de la app y se comporta
          fiable en tablet. */}
      <Sheet
        open={cancelItemId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelItemId(null)
            setCancelMotivo('')
          }
        }}
      >
        <SheetContent side="bottom" className="h-auto max-h-[90vh]">
          <SheetHeader className="text-left">
            <SheetTitle>
              {(() => {
                const it = order?.items.find(i => i.id === cancelItemId)
                return it ? `¿Anular "${it.name}"?` : '¿Anular item?'
              })()}
            </SheetTitle>
            <SheetDescription>
              Se imprimirá un aviso de anulación en la impresora correspondiente.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 py-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-14 text-base"
                onClick={() => {
                  setCancelItemId(null)
                  setCancelMotivo('')
                }}
              >
                No
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="flex-1 h-14 text-base"
                onClick={() => {
                  if (cancelItemId) handleCancelItem(cancelItemId)
                }}
              >
                Sí, anular
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </>
  )
}
