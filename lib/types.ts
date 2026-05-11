export type StaffRole = 'admin' | 'camarero' | 'cocina' | 'caja' | 'reservas'

export type Shift = 'comida' | 'cena'

export const SHIFT_CONFIG = {
  comida: { label: 'Comida', startTime: '12:00', endTime: '17:00' },
  cena: { label: 'Cena', startTime: '20:00', endTime: '00:00' },
} as const

export const ZONE_ORDER: TableZone[] = ['Dentro', 'Cristal', 'Árboles', 'Porche Nuevo', 'Jovino', 'Sombrilla']

export interface Restaurant {
  id: string
  name: string
  created_at: string
}

export interface Staff {
  id: string
  restaurant_id: string
  name: string
  pin_hash: string
  role: StaffRole
  created_at: string
}

export interface FloorPlan {
  id: string
  restaurant_id: string
  name: string
  is_default: boolean
  created_at: string
}

export type TableShape = 'square' | 'round' | 'rectangular'
export type TableStatus = 'available' | 'reserved' | 'seated' | 'blocked'
export type TableZone = 'Jovino' | 'Árboles' | 'Porche Nuevo' | 'Cristal' | 'Dentro' | 'Sombrilla'

export interface Table {
  id: string
  floor_plan_id: string
  label: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  width: number
  height: number
  rotation: number
  is_blocked: boolean
  zone: TableZone
  zone_x: number | null
  zone_y: number | null
  merge_group: string | null
  merged_with: string | null
  created_at: string
  // Computed at runtime
  status?: TableStatus
  current_reservation?: Reservation
  all_shift_reservations?: Reservation[]
  is_doblada?: boolean
}

export interface Guest {
  id: string
  restaurant_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  tags: string[]
  visit_count: number
  no_show_count: number
  is_vip: boolean
  created_at: string
}

export type ReservationStatus = 'reserved' | 'seated' | 'completed' | 'no_show' | 'cancelled'

export interface Reservation {
  id: string
  restaurant_id: string
  table_id: string | null
  guest_id: string | null
  guest_name: string
  guest_phone: string | null
  party_size: number
  date: string
  time: string
  duration_minutes: number
  status: ReservationStatus
  notes: string | null
  mesa_solicitada: boolean
  created_by: string | null
  created_at: string
  // Multi-table support (populated from reservation_tables junction)
  table_ids?: string[]
  // Joined data
  table?: Table
  guest?: Guest
}

export type WaitlistStatus = 'waiting' | 'notified' | 'seated' | 'cancelled'

export interface WaitlistEntry {
  id: string
  restaurant_id: string
  guest_id: string | null
  guest_name: string
  guest_phone: string | null
  party_size: number
  quoted_wait_minutes: number | null
  status: WaitlistStatus
  notes: string | null
  created_at: string
  // Joined data
  guest?: Guest
}

export interface Session {
  staff: Staff
  restaurant: Restaurant
}

export interface RestaurantConfig {
  id: string
  restaurant_id: string
  titular: string
  nif: string
  direccion: string
  codigo_postal: string
  ciudad: string
  provincia: string
  telefono: string
  pie_ticket: string | null
  logo_url: string | null
  // KDS color thresholds (minutes since item was sent to kitchen)
  kds_warning_minutes?: number | null
  kds_danger_minutes?: number | null
  created_at: string
  updated_at: string
}

export type PrinterType = 'cocina' | 'barra' | 'caja'

export interface Printer {
  id: string
  restaurant_id: string
  name: string
  type: PrinterType
  ip: string
  port: number
  enabled: boolean
  created_at: string
  updated_at: string
}
