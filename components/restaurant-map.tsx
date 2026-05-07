'use client'

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Table, TableStatus, TableZone, Reservation } from '@/lib/types'

interface RestaurantMapProps {
  tables: (Table & { 
    status?: TableStatus
    current_reservation?: Reservation
    all_shift_reservations?: Reservation[]
    is_doblada?: boolean 
  })[]
  selectedTableId: string | null
  onSelectTable: (table: Table) => void
  isEditMode?: boolean
  onTableMove?: (tableId: string, zoneX: number, zoneY: number) => void
}

const ZONE_CONFIG: Record<TableZone, { 
  color: string
  bgColor: string
  borderColor: string
  position: { top: string; left: string; width: string; height: string }
}> = {
  'Jovino': {
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.25)',
    position: { top: '1%', left: '1%', width: '28%', height: '22%' }
  },
  'Árboles': {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
    position: { top: '1%', left: '31%', width: '68%', height: '22%' }
  },
  'Porche Nuevo': {
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.25)',
    position: { top: '25%', left: '1%', width: '28%', height: '48%' }
  },
  'Cristal': {
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'rgba(6,182,212,0.08)',
    borderColor: 'rgba(6,182,212,0.25)',
    position: { top: '25%', left: '31%', width: '68%', height: '26%' }
  },
  'Dentro': {
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'rgba(168,85,247,0.08)',
    borderColor: 'rgba(168,85,247,0.25)',
    position: { top: '53%', left: '31%', width: '68%', height: '20%' }
  },
  'Sombrilla': {
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'rgba(244,63,94,0.08)',
    borderColor: 'rgba(244,63,94,0.25)',
    position: { top: '75%', left: '1%', width: '28%', height: '18%' }
  }
}

// Hex colors for gradient backgrounds
const STATUS_HEX: Record<TableStatus, string> = {
  available: '#10b981', // emerald-500
  reserved: '#fbbf24',  // amber-400
  seated: '#ef4444',    // red-500
  blocked: '#a8a29e',   // stone-400
}

const DOBLADA_ORANGE = '#f97316' // orange-500

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-emerald-500',
  reserved: 'bg-amber-400',
  seated: 'bg-red-500',
  blocked: 'bg-stone-400',
}

function DraggableTable({ 
  table, 
  isSelected, 
  isEditMode,
  onSelect,
  onDragEnd
}: { 
  table: Table & { 
    status?: TableStatus
    current_reservation?: Reservation
    is_doblada?: boolean 
  }
  isSelected: boolean
  isEditMode: boolean
  onSelect: () => void
  onDragEnd?: (zoneX: number, zoneY: number) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 })

  const status = table.status || 'available'
  const isDoblada = table.is_doblada || false

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isEditMode) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    
    startPos.current = {
      x: table.zone_x ?? 0,
      y: table.zone_y ?? 0,
      clientX: e.clientX,
      clientY: e.clientY
    }
    setIsDragging(true)
  }, [isEditMode, table.zone_x, table.zone_y])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    
    e.preventDefault()
    
    const parent = (e.currentTarget as HTMLElement).parentElement
    if (!parent) return
    
    const parentRect = parent.getBoundingClientRect()
    const deltaX = e.clientX - startPos.current.clientX
    const deltaY = e.clientY - startPos.current.clientY
    
    const percentX = (deltaX / parentRect.width) * 100
    const percentY = (deltaY / parentRect.height) * 100
    
    setDragOffset({ x: percentX, y: percentY })
  }, [isDragging])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.releasePointerCapture(e.pointerId)
    
    setIsDragging(false)
    
    const newX = Math.max(0, Math.min(85, (startPos.current.x + dragOffset.x)))
    const newY = Math.max(0, Math.min(75, (startPos.current.y + dragOffset.y)))
    
    setDragOffset({ x: 0, y: 0 })
    
    if (onDragEnd && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
      onDragEnd(newX, newY)
    }
  }, [isDragging, dragOffset, onDragEnd])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      return
    }
    onSelect()
  }, [isDragging, onSelect])

  const posX = (table.zone_x ?? 0) + (isDragging ? dragOffset.x : 0)
  const posY = (table.zone_y ?? 0) + (isDragging ? dragOffset.y : 0)
  const hasPosition = table.zone_x !== null && table.zone_y !== null

  // Gradient style for doblada tables
  const gradientStyle = isDoblada ? {
    background: `linear-gradient(135deg, ${STATUS_HEX[status]} 50%, ${DOBLADA_ORANGE} 50%)`,
  } : undefined

  return (
    <button
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        ...(hasPosition || isDragging ? {
          position: 'absolute' as const,
          left: `${posX}%`,
          top: `${posY}%`,
          touchAction: 'none',
        } : undefined),
        ...gradientStyle,
      }}
      className={cn(
        'flex flex-col items-center justify-center text-white transition-all shadow-sm',
        'min-w-[44px] min-h-[44px] sm:min-w-[52px] sm:min-h-[52px]',
        !isDoblada && STATUS_COLORS[status],
        table.shape === 'round' ? 'rounded-full' : 'rounded-md',
        table.shape === 'rectangular' && 'min-w-[72px] sm:min-w-[88px]',
        isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-black/20 scale-110 z-10',
        isDragging && 'opacity-80 scale-105 cursor-grabbing z-20',
        isEditMode && !isDragging && 'cursor-grab',
        !hasPosition && !isDragging && 'relative'
      )}
    >
      <span className="font-bold text-[11px] sm:text-xs leading-none">{table.label}</span>
      {status === 'reserved' && table.current_reservation && (
        <span className="text-[8px] sm:text-[9px] opacity-90">
          {table.current_reservation.time.slice(0, 5)}
        </span>
      )}
    </button>
  )
}

function ZoneSection({ 
  zone, 
  tables, 
  selectedTableId,
  onSelectTable,
  isEditMode,
  onTableMove
}: { 
  zone: TableZone
  tables: (Table & { 
    status?: TableStatus
    current_reservation?: Reservation
    is_doblada?: boolean 
  })[]
  selectedTableId: string | null
  onSelectTable: (table: Table) => void
  isEditMode: boolean
  onTableMove?: (tableId: string, zoneX: number, zoneY: number) => void
}) {
  const config = ZONE_CONFIG[zone]
  const visibleTables = tables.filter(t => !t.merged_with)
  
  const positionedTables = visibleTables.filter(t => t.zone_x !== null && t.zone_y !== null)
  const flowTables = visibleTables.filter(t => t.zone_x === null || t.zone_y === null)
  
  return (
    <div 
      className="absolute rounded-lg p-2 flex flex-col overflow-hidden"
      style={{ 
        ...config.position,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`
      }}
    >
      <span className={cn('text-[9px] sm:text-[10px] font-medium uppercase tracking-wide flex-shrink-0', config.color)}>
        {zone}
      </span>
      
      <div className="relative flex-1 mt-1.5">
        {flowTables.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 content-start">
            {flowTables.map(table => (
              <DraggableTable
                key={table.id}
                table={table}
                isSelected={selectedTableId === table.id}
                isEditMode={isEditMode}
                onSelect={() => onSelectTable(table)}
                onDragEnd={onTableMove ? (x, y) => onTableMove(table.id, x, y) : undefined}
              />
            ))}
          </div>
        )}
        
        {positionedTables.map(table => (
          <DraggableTable
            key={table.id}
            table={table}
            isSelected={selectedTableId === table.id}
            isEditMode={isEditMode}
            onSelect={() => onSelectTable(table)}
            onDragEnd={onTableMove ? (x, y) => onTableMove(table.id, x, y) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export function RestaurantMap({ 
  tables, 
  selectedTableId, 
  onSelectTable,
  isEditMode = false,
  onTableMove
}: RestaurantMapProps) {
  const tablesByZone = tables.reduce((acc, table) => {
    if (!acc[table.zone]) acc[table.zone] = []
    acc[table.zone].push(table)
    return acc
  }, {} as Record<TableZone, typeof tables>)

  const zones: TableZone[] = ['Jovino', 'Árboles', 'Porche Nuevo', 'Cristal', 'Dentro', 'Sombrilla']

  return (
    <div className={cn(
      "relative w-full h-full bg-stone-50 dark:bg-stone-900 rounded-xl border overflow-hidden",
      isEditMode && "ring-2 ring-blue-500 ring-offset-2"
    )}>
      {zones.map(zone => (
        <ZoneSection
          key={zone}
          zone={zone}
          tables={tablesByZone[zone] || []}
          selectedTableId={selectedTableId}
          onSelectTable={onSelectTable}
          isEditMode={isEditMode}
          onTableMove={onTableMove}
        />
      ))}

      <div 
        className="absolute flex items-center justify-center rounded"
        style={{ 
          top: '75%', 
          left: '31%', 
          width: '68%', 
          height: '8%',
          backgroundColor: 'rgba(120,113,108,0.15)',
          border: '1px solid rgba(120,113,108,0.3)'
        }}
      >
        <span className="text-[9px] sm:text-[10px] font-medium text-stone-500 uppercase tracking-wide">
          Barra
        </span>
      </div>

      <div 
        className="absolute flex items-center justify-center"
        style={{ 
          top: '84%', 
          left: '31%', 
          width: '68%', 
          height: '15%' 
        }}
      >
        <span className="text-[9px] sm:text-[10px] text-stone-400 uppercase tracking-wide">
          Cocina
        </span>
      </div>
    </div>
  )
}
