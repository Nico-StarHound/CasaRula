'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronUp, ChevronDown, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { UserMenu } from '@/components/user-menu'
import { SessionWatcher } from '@/components/session-watcher'
import { 
  getKdsItems, 
  markItemReady, 
  markAllItemsReady, 
  updateKdsPosition,
  type KdsItem 
} from '@/app/actions/comandas'
import { getRestaurantConfig } from '@/app/actions/config'

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

  const fetchItems = useCallback(async () => {
    const [kdsItems, config] = await Promise.all([
      getKdsItems(),
      getRestaurantConfig()
    ])
    setItems(kdsItems)
    setWarningMinutes(config?.kds_warning_minutes ?? 10)
    setDangerMinutes(config?.kds_danger_minutes ?? 20)
    setLoading(false)
  }, [])

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
    await markItemReady(itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  const handleMarkAllReady = async (orderId: string) => {
    await markAllItemsReady(orderId)
    setItems(prev => prev.filter(i => i.order?.id !== orderId))
  }

  const handleMoveItem = async (itemId: string, direction: 'up' | 'down') => {
    const sortedItems = [...items].sort((a, b) => a.kds_position - b.kds_position)
    const idx = sortedItems.findIndex(i => i.id === itemId)
    if (idx === -1) return
    
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sortedItems.length) return

    const currentItem = sortedItems[idx]
    const targetItem = sortedItems[targetIdx]

    // Swap positions
    const currentPos = currentItem.kds_position
    const targetPos = targetItem.kds_position

    // Update local state immediately
    setItems(prev => prev.map(i => {
      if (i.id === currentItem.id) return { ...i, kds_position: targetPos }
      if (i.id === targetItem.id) return { ...i, kds_position: currentPos }
      return i
    }))

    // Persist to database
    await Promise.all([
      updateKdsPosition(currentItem.id, targetPos),
      updateKdsPosition(targetItem.id, currentPos)
    ])
  }

  // All items sorted by position for sidebar
  const sortedItems = [...items].sort((a, b) => a.kds_position - b.kds_position)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SessionWatcher />
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <h1 className="text-lg font-semibold">Cocina</h1>
        <span className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? 'plato' : 'platos'} en cocina
        </span>
        <div className="ml-auto">
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
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
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
                      return (
                        <div 
                          key={item.id}
                          className="flex items-start justify-between bg-gray-800 rounded-lg p-3"
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
                              onClick={() => handleMarkReady(item.id)}
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

        {/* Right: Priority queue sidebar */}
        <aside className="hidden lg:flex w-72 bg-gray-900 border-l border-gray-800 flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cola de preparacion
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedItems.length === 0 ? (
              <div className="p-4 text-center text-gray-600 text-sm">
                Sin platos en cola
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {sortedItems.map((item, idx) => {
                  const elapsed = getElapsedSeconds(item.sent_at)
                  return (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-xs text-gray-600 w-5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {item.order?.urgente && (
                            <Zap className="h-3 w-3 inline text-red-500 mr-1" />
                          )}
                          <span className="text-gray-500">{item.order?.table?.label}</span>
                          {' · '}
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </div>
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", getDotColor(elapsed))} />
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-500 hover:text-white"
                          onClick={() => handleMoveItem(item.id, 'up')}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-500 hover:text-white"
                          onClick={() => handleMoveItem(item.id, 'down')}
                          disabled={idx === sortedItems.length - 1}
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
        </aside>
      </div>
    </div>
  )
}
