'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPassItems, markItemPicked, type PassItem } from '@/app/actions/comandas'
import { cn } from '@/lib/utils'

// =====================================================================
// PassColumn — columna lateral derecha "En barra"
// =====================================================================
//
// Muestra los items con status='ready' aún no recogidos del pase. El
// camarero toca un item para marcarlo como recogido (status='served')
// y desaparece. Items nuevos aparecen arriba (los más recientes
// empujan a los anteriores hacia abajo).
//
// Visible en todas las pantallas autenticadas excepto:
//   - /cocina: el KDS ya gestiona el flujo ready desde su propio lado
//   - /login:  no tiene sesión todavía
//
// Toggle abrir/cerrar persistente en localStorage para que cada
// dispositivo recuerde su preferencia entre sesiones.
//
// Realtime: subscribed to order_items. Cualquier cambio (un cocinero
// marca ready, un camarero recoge) refetch automático.
// =====================================================================

const STORAGE_KEY = 'casarula.passColumn.open'

// Rutas donde NO mostramos la columna. Coinciden con el inicio de la
// pathname (startsWith). El KDS está fuera porque tiene su propia
// gestión; el login porque no hay sesión.
const HIDDEN_ON_PATHS = ['/cocina', '/login']

export function PassColumn() {
  const pathname = usePathname()
  const [items, setItems] = useState<PassItem[]>([])
  const [open, setOpen] = useState<boolean>(() => {
    // SSR-safe: en server, default false. En cliente, leemos localStorage.
    // Sin esto, hydration mismatch si el server renderiza una cosa y el
    // cliente otra.
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  })

  // Sync el toggle a localStorage cada vez que cambia. Decidimos NO
  // empujar el contenido detrás — la columna se solapa con sombra. Es
  // el comportamiento habitual en TPV: empujar el layout cuando se
  // abre/cierra hace que el mapa de mesas se reorganice, lo que es
  // desconcertante. Solapar es más previsible.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, String(open))
  }, [open])

  const fetchItems = useCallback(async () => {
    const data = await getPassItems()
    setItems(data)
  }, [])

  // Realtime: cualquier cambio en order_items provoca refetch. El cambio
  // típico es marcar ready (entra) o marcar served (sale). En lugar de
  // procesar el evento delta, refetcheamos todo — la lista es pequeña.
  useEffect(() => {
    fetchItems()

    const supabase = createClient()
    const channel = supabase
      .channel('pass-column-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items',
      }, () => {
        fetchItems()
      })
      .subscribe()

    // Fallback periódico por si el WebSocket de Supabase muere
    // silenciosamente (raro pero pasa con WiFi inestable de garden).
    const interval = setInterval(fetchItems, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchItems])

  // Optimistic remove al recoger — el camarero ve respuesta inmediata
  // aunque la BD tarde unos ms.
  const handlePick = async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
    await markItemPicked(itemId)
  }

  // Esconder en rutas excluidas. Lo hacemos tras todos los hooks
  // para no romper las reglas de hooks (no se pueden saltar useState/
  // useEffect entre renders).
  const isHidden = HIDDEN_ON_PATHS.some(p => pathname?.startsWith(p))
  if (isHidden) return null

  // Estado contraído: una columna estrecha (32px) con el handle
  // vertical para reabrir. Está en el flujo flex del layout
  // padre — empuja el contenido a la izquierda esos 32px. Cuando
  // se expande pasa a 224px. Sin overlay: la columna ocupa espacio
  // real, no flota encima.
  if (!open) {
    return (
      <aside className="flex-shrink-0 w-8 border-l border-emerald-800 bg-emerald-900 flex flex-col">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-emerald-800 text-emerald-200 hover:text-white transition-colors"
          title="Mostrar columna 'En barra'"
          aria-label="Mostrar columna en barra"
        >
          <ChevronLeft className="h-4 w-4" />
          <span
            className="text-[10px] font-semibold tracking-wider whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            EN BARRA
          </span>
          {items.length > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
              {items.length}
            </span>
          )}
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex-shrink-0 w-56 bg-emerald-950 text-white border-l border-emerald-800 flex flex-col">
      {/* Header con título y botón cerrar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
            En barra
          </h2>
          <span className="bg-emerald-700 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-emerald-300 hover:text-white"
          title="Ocultar columna"
          aria-label="Ocultar columna en barra"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Lista de items. Cada fila: PLATO: MESA. Tocar = recoger. */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-emerald-400/70 text-xs">
            Nada en barra
          </div>
        ) : (
          <ul className="divide-y divide-emerald-900/50">
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handlePick(item.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-emerald-900 active:bg-emerald-800 transition-colors',
                    'flex items-baseline justify-between gap-2'
                  )}
                >
                  <span className="font-medium text-sm uppercase truncate">
                    {item.quantity > 1 && (
                      <span className="text-emerald-300 mr-1">{item.quantity}×</span>
                    )}
                    {item.name}
                  </span>
                  <span className="text-emerald-300 text-xs font-mono flex-shrink-0">
                    {item.table_label ?? '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
