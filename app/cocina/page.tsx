'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, Zap, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { UserMenu } from '@/components/user-menu'
import { SessionWatcher } from '@/components/session-watcher'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getKdsItems,
  markItemReady,
  markAllItemsReady,
  addItemToPrepQueue,
  removeItemFromPrepQueue,
  reorderPrepQueue,
  restoreItemToKitchen,
  type KdsItem
} from '@/app/actions/comandas'
import { getRestaurantConfig } from '@/app/actions/config'

// Acciones reversibles del KDS. Cada una guarda lo mínimo para
// poder revertirla con una llamada al server.
// - 'add_to_queue':    el revert es removeItemFromPrepQueue.
// - 'remove_from_queue': el revert es addItemToPrepQueue. Guardamos
//                        la position que tenía por si tocaba reordenar
//                        (lo simplificamos: la añadimos al final, ya
//                        que la cola es un orden de trabajo flexible).
// - 'mark_ready':      el revert es restoreItemToKitchen, restituyendo
//                       in_prep_queue_at + prep_queue_position si los
//                       tenía.
// - 'mark_all_ready':  el revert es restoreItemToKitchen por cada item
//                       afectado.
//
// Limitamos el stack a las últimas 5 acciones — el caso de uso es
// "ups, acabo de tocar mal", no historial completo. Más acciones
// solo gastan memoria sin aportar.
type UndoAction =
  | { kind: 'add_to_queue'; itemId: string; label: string }
  | { kind: 'remove_from_queue'; itemId: string; label: string }
  | {
      kind: 'mark_ready'
      itemId: string
      label: string
      wasInQueueAt: string | null
      wasQueuePosition: number | null
    }
  | {
      kind: 'mark_all_ready'
      orderId: string
      label: string
      affected: Array<{ id: string; in_prep_queue_at: string | null; prep_queue_position: number | null }>
    }

const UNDO_STACK_LIMIT = 5

interface OrderGroup {
  orderId: string
  tableLabel: string
  comensales: number
  notaMesa: string | null
  urgente: boolean
  items: KdsItem[]
  earliestSentAt: Date | null
}

export default function CocinaPage() {
  const [items, setItems] = useState<KdsItem[]>([])
  const [warningMinutes, setWarningMinutes] = useState(10)
  const [dangerMinutes, setDangerMinutes] = useState(20)
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)
  // Stack de acciones que se pueden deshacer. El más reciente al final.
  // Se vacía solo cuando se pulsa Deshacer (saca una) o cuando excede
  // el límite (descarta la más antigua).
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])

  // Set of orderIds we've already seen in this session. Used to detect
  // "comanda nueva" and ring a soft chime when a NEW order arrives.
  // - First render: just records whatever's already on screen, no sound
  //   (so refreshing the page doesn't blast a chime for every active order).
  // - After that: any orderId that wasn't in the previous set rings once.
  // - One ding per ORDER, not per item — five items hitting at once
  //   from the same table = 1 chime, not 5.
  const seenOrderIdsRef = useRef<Set<string> | null>(null)

  // Plays a soft two-note chime — like a doorbell or a hotel reception
  // bell, not a robotic alarm. We don't ship an audio file because
  // browsers can be picky about autoplay and external resources; a
  // synthesized chime with Web Audio works offline.
  const playDing = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()

      // Master gain con un low-pass filter para quitarle el chirrido
      // metálico del oscilador puro y darle calidez (más a "campanilla
      // de hotel" y menos a "alarma de horno").
      const master = ctx.createGain()
      master.gain.value = 0.35
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 3000
      lowpass.Q.value = 0.8
      master.connect(lowpass)
      lowpass.connect(ctx.destination)

      // Una "nota" de campanilla: tono base + segundo armónico una
      // octava arriba para darle brillo. Triangle wave en lugar de
      // square = mucho más suave, sin armónicos altos chirriantes.
      // Envelope con attack rápido (10ms) y release largo (600ms)
      // para que suene como algo que vibra y se apaga, no como un
      // pitido que se corta seco.
      const note = (offset: number, baseFreq: number) => {
        const t = ctx.currentTime + offset

        // Fundamental
        const o1 = ctx.createOscillator()
        o1.type = 'triangle'
        o1.frequency.value = baseFreq
        // Armónico para brillo de campana
        const o2 = ctx.createOscillator()
        o2.type = 'sine'
        o2.frequency.value = baseFreq * 2
        const o2gain = ctx.createGain()
        o2gain.gain.value = 0.3 // armónico al 30% del volumen del fundamental

        // Envelope compartido. Ataque suave (10ms) — sin clic — y
        // release exponencial de 600ms simulando la resonancia
        // natural de una campana.
        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, t)
        env.gain.exponentialRampToValueAtTime(1.0, t + 0.012)
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.65)

        o1.connect(env)
        o2.connect(o2gain)
        o2gain.connect(env)
        env.connect(master)

        o1.start(t)
        o2.start(t)
        o1.stop(t + 0.7)
        o2.stop(t + 0.7)
      }

      // Dos notas, intervalo de tercera mayor descendente:
      //   Do alto (C6 = 1046.5 Hz) → Mi alto (E5 = 659.25 Hz)
      // Suena a "ding-dong" agradable estilo recepción de hotel.
      // Las notas se solapan: la segunda entra antes de que la
      // primera termine, lo que da continuidad.
      note(0, 1046.5)
      note(0.25, 659.25)

      // Cerramos el contexto cuando ya no suene nada.
      setTimeout(() => { void ctx.close() }, 1100)
    } catch {
      // Audio context creation can fail (autoplay policy on a tab
      // that's never been touched). We silently ignore — the cook
      // will still see the new comanda visually.
    }
  }, [])

  const fetchItems = useCallback(async () => {
    const [kdsItems, config] = await Promise.all([
      getKdsItems(),
      getRestaurantConfig()
    ])

    // Detect new orderIds vs the previous snapshot.
    const currentOrderIds = new Set<string>()
    for (const item of kdsItems) {
      if (item.order?.id) currentOrderIds.add(item.order.id)
    }
    if (seenOrderIdsRef.current === null) {
      // First load — record baseline, no sound.
      seenOrderIdsRef.current = currentOrderIds
    } else {
      // Any orderId in current that wasn't in the previous snapshot is new.
      let hasNew = false
      for (const id of currentOrderIds) {
        if (!seenOrderIdsRef.current.has(id)) {
          hasNew = true
          break
        }
      }
      // We rebuild the set fresh each tick so orders that disappear (all
      // items marked ready) re-trigger if they come back later — useful
      // when a comanda was fully served and then the table adds another
      // round.
      seenOrderIdsRef.current = currentOrderIds
      if (hasNew) playDing()
    }

    setItems(kdsItems)
    setWarningMinutes(config?.kds_warning_minutes ?? 10)
    setDangerMinutes(config?.kds_danger_minutes ?? 20)
    setLoading(false)
  }, [playDing])

  // Initial fetch and realtime subscription
  useEffect(() => {
    fetchItems()

    const supabase = createClient()
    const channel = supabase
      .channel('kds-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items'
      }, () => {
        fetchItems()
      })
      .subscribe()

    // Auto-refresh fallback every 30s
    const interval = setInterval(fetchItems, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchItems])

  // Update clock every second for timers
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Group items by order
  const orderGroups: OrderGroup[] = []
  const seenOrders = new Set<string>()

  for (const item of items) {
    if (!item.order) continue
    const orderId = item.order.id
    
    if (!seenOrders.has(orderId)) {
      seenOrders.add(orderId)
      const orderItems = items.filter(i => i.order?.id === orderId)
      const sentTimes = orderItems
        .map(i => i.sent_at ? new Date(i.sent_at) : null)
        .filter((d): d is Date => d !== null)
      
      orderGroups.push({
        orderId,
        tableLabel: item.order.table?.label || 'Mesa',
        comensales: item.order.comensales,
        notaMesa: item.order.nota_mesa,
        urgente: item.order.urgente,
        items: orderItems,
        earliestSentAt: sentTimes.length > 0 ? new Date(Math.min(...sentTimes.map(d => d.getTime()))) : null
      })
    }
  }

  // Sort: urgente first, then by earliest sent_at
  orderGroups.sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1
    if (!a.earliestSentAt) return 1
    if (!b.earliestSentAt) return -1
    return a.earliestSentAt.getTime() - b.earliestSentAt.getTime()
  })

  // Get elapsed time in seconds
  const getElapsedSeconds = (sentAt: string | null): number => {
    if (!sentAt) return 0
    return Math.floor((now.getTime() - new Date(sentAt).getTime()) / 1000)
  }

  // Format MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Get timer color class based on elapsed time
  const getTimerColor = (seconds: number): string => {
    const minutes = seconds / 60
    if (minutes >= dangerMinutes) return 'bg-red-900 text-red-300 animate-pulse'
    if (minutes >= warningMinutes) return 'bg-yellow-900 text-yellow-300'
    return 'bg-blue-900 text-blue-300'
  }

  // Get dot color for sidebar
  const getDotColor = (seconds: number): string => {
    const minutes = seconds / 60
    if (minutes >= dangerMinutes) return 'bg-red-500 animate-pulse'
    if (minutes >= warningMinutes) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  const handleMarkReady = async (itemId: string) => {
    // Antes de quitarlo, capturar lo necesario para deshacer: si
    // estaba en cola, su position; etiqueta para el botón.
    const item = items.find(i => i.id === itemId)
    if (!item) return

    pushUndo({
      kind: 'mark_ready',
      itemId,
      label: `${item.quantity}x ${item.name}`,
      wasInQueueAt: item.in_prep_queue_at,
      wasQueuePosition: item.prep_queue_position,
    })

    // Optimistic UI: quita el item de la lista local antes de esperar
    // a la BD. El Realtime de Supabase repondría el estado correcto
    // si algo falla pero la respuesta visual es inmediata.
    setItems(prev => prev.filter(i => i.id !== itemId))
    await markItemReady(itemId)
  }

  const handleMarkAllReady = async (orderId: string) => {
    // Capturar TODOS los items que esa orden tenía en cocina, con sus
    // estados de cola, para poder restituir uno por uno si se deshace.
    const affected = items
      .filter(i => i.order?.id === orderId)
      .map(i => ({
        id: i.id,
        in_prep_queue_at: i.in_prep_queue_at,
        prep_queue_position: i.prep_queue_position,
      }))
    const tableLabel = items.find(i => i.order?.id === orderId)?.order?.table?.label ?? 'mesa'

    pushUndo({
      kind: 'mark_all_ready',
      orderId,
      label: `Mesa ${tableLabel} (${affected.length} platos)`,
      affected,
    })

    setItems(prev => prev.filter(i => i.order?.id !== orderId))
    await markAllItemsReady(orderId)
  }

  // Push a undo action with stack limit. Most recent at the end.
  const pushUndo = (action: UndoAction) => {
    setUndoStack(prev => {
      const next = [...prev, action]
      if (next.length > UNDO_STACK_LIMIT) next.shift()
      return next
    })
  }

  // Pop+revert the most recent action. The button is disabled while
  // the stack is empty so we only get here with at least one entry.
  const handleUndo = async () => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))

    // Realtime traerá el estado correcto en segundos, pero hacemos
    // optimistic para que el undo sea instantáneo. La lógica de
    // optimistic varía según el tipo de acción.
    switch (last.kind) {
      case 'add_to_queue':
        // Revertir un "añadir a cola" = sacar de cola.
        setItems(prev => prev.map(i =>
          i.id === last.itemId
            ? { ...i, in_prep_queue_at: null, prep_queue_position: null }
            : i
        ))
        await removeItemFromPrepQueue(last.itemId)
        break

      case 'remove_from_queue':
        // Revertir un "sacar de cola" = volver a meter. Lo añadimos
        // al final; si el cocinero quería un orden específico, puede
        // arrastrar después.
        await addItemToPrepQueue(last.itemId)
        break

      case 'mark_ready':
        // Restituir status='in_kitchen' + opcionalmente la cola.
        await restoreItemToKitchen(last.itemId, {
          restoreToQueueAt: last.wasInQueueAt ?? undefined,
          restoreToQueuePosition: last.wasQueuePosition ?? undefined,
        })
        break

      case 'mark_all_ready':
        // Por cada item afectado, restituirlo. Los hacemos en
        // paralelo — son updates independientes.
        await Promise.all(
          last.affected.map(a =>
            restoreItemToKitchen(a.id, {
              restoreToQueueAt: a.in_prep_queue_at ?? undefined,
              restoreToQueuePosition: a.prep_queue_position ?? undefined,
            })
          )
        )
        break
    }

    // Forzar refetch para que el estado local refleje exactamente lo
    // que hay en BD (en caso de divergencia con el optimistic).
    await fetchItems()
  }

  // Toggle del item entre "en cocina normal" y "en cola de preparación".
  // Click en la fila del item de la izquierda añade/saca de la cola.
  // - El botón "Listo" tiene stopPropagation así que no dispara esto.
  // - Si el item no estaba en la cola, lo añadimos (entra al final).
  // - Si ya estaba, lo sacamos (caso "ups, toqué sin querer").
  const handleToggleInQueue = async (item: KdsItem) => {
    const isInQueue = item.in_prep_queue_at !== null

    if (isInQueue) {
      // Sacar de la cola — registrar undo "remove_from_queue".
      pushUndo({
        kind: 'remove_from_queue',
        itemId: item.id,
        label: `${item.quantity}x ${item.name}`,
      })
      // Optimistic remove
      setItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, in_prep_queue_at: null, prep_queue_position: null }
          : i
      ))
      await removeItemFromPrepQueue(item.id)
    } else {
      // Añadir a la cola — registrar undo "add_to_queue".
      pushUndo({
        kind: 'add_to_queue',
        itemId: item.id,
        label: `${item.quantity}x ${item.name}`,
      })
      // Optimistic add — calcular siguiente posición localmente
      const maxPos = items.reduce(
        (max, i) => i.prep_queue_position !== null && i.prep_queue_position > max
          ? i.prep_queue_position
          : max,
        0
      )
      setItems(prev => prev.map(i =>
        i.id === item.id
          ? {
              ...i,
              in_prep_queue_at: new Date().toISOString(),
              prep_queue_position: maxPos + 1,
            }
          : i
      ))
      await addItemToPrepQueue(item.id)
    }
  }

  // Drag-drop dentro de la cola de preparación. Recibe ids y los manda
  // al server en el nuevo orden — el server les asigna posiciones 1..N.
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const queueItems = items
      .filter(i => i.in_prep_queue_at !== null)
      .sort((a, b) => (a.prep_queue_position ?? 0) - (b.prep_queue_position ?? 0))

    const oldIndex = queueItems.findIndex(i => i.id === active.id)
    const newIndex = queueItems.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(queueItems, oldIndex, newIndex)

    // Optimistic: reasignamos posiciones locales 1..N en el orden nuevo.
    const newPosById = new Map<string, number>()
    reordered.forEach((it, idx) => newPosById.set(it.id, idx + 1))
    setItems(prev => prev.map(i => {
      const np = newPosById.get(i.id)
      return np !== undefined ? { ...i, prep_queue_position: np } : i
    }))

    // Persistimos.
    await reorderPrepQueue(reordered.map(i => i.id))
  }

  // Items que el cocinero ha activado en la cola de preparación.
  // Sólo estos aparecen en la columna derecha (antes salían todos).
  const queueItems = items
    .filter(i => i.in_prep_queue_at !== null)
    .sort((a, b) => (a.prep_queue_position ?? 0) - (b.prep_queue_position ?? 0))

  // Sensors para dnd-kit: PointerSensor para mouse, TouchSensor para
  // tablet. activationConstraint con un delay pequeño en touch para
  // que un tap "rápido" se distinga del inicio de un drag (sin esto,
  // el tap accidental movía el item).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Cargando...</div>
      </div>
    )
  }

  return (
    // El KDS es una pantalla de uso pulsable, no de lectura — desactivar
    // la selección de texto a nivel root evita que un drag-and-drop o
    // un tap mantenido en la cola seleccione texto y se vea raro o
    // dispare el menú contextual del navegador en tablets. Caret se
    // sigue permitiendo en inputs si los hubiera por el "caret-auto".
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none [-webkit-user-select:none]">
      <SessionWatcher />
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <h1 className="text-lg font-semibold">Cocina</h1>
        <span className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? 'plato' : 'platos'} en cocina
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* Botón Deshacer — solo activo si hay al menos una acción
              en el stack. Muestra el label de la última acción para
              que el cocinero sepa qué va a revertir antes de pulsar.
              Limit visible para que no crezca infinitamente — el
              tooltip nativo del title atribute basta. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title={
              undoStack.length === 0
                ? 'Nada que deshacer'
                : `Deshacer: ${undoStack[undoStack.length - 1].label}`
            }
            className="text-gray-300 hover:text-white"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Deshacer
          </Button>
          <UserMenu />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Order cards */}
        <main className="flex-1 p-4 overflow-y-auto">
          {orderGroups.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">&#10003;</div>
                <h2 className="text-2xl font-bold text-green-400">Todo al dia</h2>
                <p className="text-gray-500 mt-2">No hay platos pendientes en cocina</p>
              </div>
            </div>
          ) : (
            // items-start: cada card mide lo suyo en lugar de estirarse
            // al alto del item más grande de su fila — antes una card
            // con 5 items dejaba a su vecino con 1 item con espacio
            // blanco enorme abajo. Ahora cada card encoge al marcar
            // items listos.
            //
            // grid-flow-dense: las cards rellenan los huecos que dejan
            // las cards superiores al encoger, en lugar de mantener el
            // orden estrictamente fila-por-fila. Útil aquí porque el
            // orden visual (urgente > antiguo) no es crítico — el
            // cocinero igual mira la card por mesa.
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 items-start grid-flow-dense">
              {orderGroups.map(group => (
                <div 
                  key={group.orderId} 
                  className={cn(
                    "bg-gray-900 rounded-xl p-4",
                    group.urgente && "ring-2 ring-red-500"
                  )}
                >
                  {/* Order header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">{group.tableLabel}</span>
                      <span className="text-gray-500">· {group.comensales} pax</span>
                      {group.urgente && (
                        <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                          <Zap className="h-3 w-3" /> URGENTE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {group.earliestSentAt && (
                        <span className={cn(
                          "px-2 py-1 rounded text-sm font-mono",
                          getTimerColor(getElapsedSeconds(group.earliestSentAt.toISOString()))
                        )}>
                          {formatTime(getElapsedSeconds(group.earliestSentAt.toISOString()))}
                        </span>
                      )}
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 h-10 px-4"
                        onClick={() => handleMarkAllReady(group.orderId)}
                      >
                        <Check className="h-4 w-4 mr-1" /> Mesa lista
                      </Button>
                    </div>
                  </div>

                  {/* Nota de mesa */}
                  {group.notaMesa && (
                    <div className="bg-amber-900/50 text-amber-200 px-3 py-2 rounded-lg mb-3 text-sm">
                      <span className="mr-2">&#128203;</span>
                      {group.notaMesa}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-2">
                    {group.items.map(item => {
                      const elapsed = getElapsedSeconds(item.sent_at)
                      const inQueue = item.in_prep_queue_at !== null
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleInQueue(item)}
                          className={cn(
                            "flex items-start justify-between rounded-lg p-3 cursor-pointer transition-colors select-none",
                            // Estado "en cola": azul claro. El cocinero
                            // ve de un vistazo qué tiene activo. Tocar
                            // otra vez la fila lo saca de la cola.
                            inQueue
                              ? "bg-sky-900/60 ring-1 ring-sky-500"
                              : "bg-gray-800 hover:bg-gray-700"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-lg font-medium">
                              <span className="font-bold">{item.quantity}x</span> {item.name}
                            </div>
                            {item.modifier_summary && item.modifier_summary.length > 0 && (
                              <div className="text-sm text-gray-400 mt-1">
                                {item.modifier_summary.map(m => m.name).join(', ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-sm text-amber-400 italic mt-1">
                                {item.notes}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                            <span className={cn(
                              "px-2 py-1 rounded text-xs font-mono",
                              getTimerColor(elapsed)
                            )}>
                              {formatTime(elapsed)}
                            </span>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 h-10 w-20"
                              // Stop propagation: el "Listo" tiene su
                              // propia acción y no debe a la vez togglear
                              // el estado de cola del item.
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkReady(item.id)
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" /> Listo
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right: cola de preparación activa.
            Sólo muestra items que el cocinero ha tocado en la izquierda
            (in_prep_queue_at !== null). Soporta drag-drop con dnd-kit.
            Cada item tiene su propio botón "Listo" pequeño — marcar
            listo aquí también marca listo en la izquierda (mismo
            order_item por debajo). */}
        <aside className="hidden lg:flex w-80 bg-gray-900 border-l border-gray-800 flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cola de preparación
            </h2>
            <p className="text-[10px] text-gray-600 mt-0.5">
              Toca un plato a la izquierda para añadirlo aquí
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {queueItems.length === 0 ? (
              <div className="p-4 text-center text-gray-600 text-sm">
                Sin platos en cola
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={queueItems.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-gray-800">
                    {queueItems.map((item, idx) => (
                      <QueueRow
                        key={item.id}
                        item={item}
                        index={idx}
                        elapsed={getElapsedSeconds(item.sent_at)}
                        dotColor={getDotColor(getElapsedSeconds(item.sent_at))}
                        onReady={() => handleMarkReady(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// Una fila de la cola de preparación. Componente aparte porque dnd-kit
// requiere un hook (useSortable) por elemento sortable, y meterlo en
// el render del padre no funciona (hooks no se pueden invocar en map).
// Vive en este archivo en lugar de en components/ porque sólo lo usa
// el KDS — si en el futuro otra pantalla necesita drag-drop similar,
// se promociona a su propio archivo.
function QueueRow({
  item,
  index,
  elapsed,
  dotColor,
  onReady,
}: {
  item: KdsItem
  index: number
  elapsed: number
  dotColor: string
  onReady: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        isDragging && "bg-gray-800"
      )}
    >
      {/* Drag handle — los listeners van aquí y NO en el botón Listo
          para que tocar "Listo" no inicie un drag por accidente. */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none flex items-center gap-2 flex-1 min-w-0"
      >
        <span className="text-xs text-gray-600 w-5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {item.order?.urgente && (
              <Zap className="h-3 w-3 inline text-red-500 mr-1" />
            )}
            <span className="text-gray-500">{item.order?.table?.label}</span>
            {' · '}
            <span className="font-medium">{item.quantity}x {item.name}</span>
          </div>
        </div>
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColor)} />
      </div>
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onReady()
        }}
      >
        <Check className="h-3 w-3" />
      </Button>
    </div>
  )
}
