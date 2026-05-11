'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { 
  Plus, Trash2, LogOut, User, Shield, Pencil, MapPin, Users, Move, Receipt, 
  Upload, Check, UtensilsCrossed, Settings, X
} from 'lucide-react'
import Link from 'next/link'
import { Textarea } from '@/components/ui/textarea'
import { TicketPreview } from '@/components/ticket-preview'
import type { Staff, StaffRole, FloorPlan, Table, TableZone, RestaurantConfig } from '@/lib/types'
import { createStaff, updateStaffPin, deleteStaff } from '@/app/actions/staff'
import { logout } from '@/app/actions/auth'
import { createFloorPlan, deleteFloorPlan, createTable, updateTable, deleteTable } from '@/app/actions/floor-plan'
import { updateRestaurantConfig, uploadLogo, updateRestaurantName } from '@/app/actions/config'
import {
  getMenuCategories,
  getMenuItems,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailable,
  getModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  assignModifierToItems,
  getModifierAssignments,
  type MenuCategory,
  type MenuItem,
  type ModifierGroup,
} from '@/app/actions/menu'

type Section = 'plano' | 'personal' | 'ticket' | 'carta' | 'general'
type CartaTab = 'categorias' | 'platos' | 'modificadores' | 'preview'

interface AjustesClientProps {
  initialStaff: Staff[]
  currentStaffId: string
  restaurantName: string
  initialFloorPlans: FloorPlan[]
  initialTables: Record<string, Table[]>
  initialConfig: RestaurantConfig | null
}

const ROLE_LABELS: Record<StaffRole, string> = {
  dueno: 'Dueno',
  mesero: 'Mesero',
}

const ZONES: TableZone[] = ['Jovino', 'Arboles', 'Porche Nuevo', 'Cristal', 'Dentro', 'Sombrilla']

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'plano', label: 'Plano y Mesas', icon: <MapPin className="h-4 w-4" /> },
  { id: 'personal', label: 'Personal', icon: <Users className="h-4 w-4" /> },
  { id: 'ticket', label: 'Ticket', icon: <Receipt className="h-4 w-4" /> },
  { id: 'carta', label: 'Carta', icon: <UtensilsCrossed className="h-4 w-4" /> },
  { id: 'general', label: 'General', icon: <Settings className="h-4 w-4" /> },
]

export function AjustesClient({ 
  initialStaff, 
  currentStaffId, 
  restaurantName,
  initialFloorPlans,
  initialTables,
  initialConfig
}: AjustesClientProps) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<Section>('plano')
  
  // Staff state
  const [staff, setStaff] = useState(initialStaff)
  const [showAddStaffDialog, setShowAddStaffDialog] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showDeleteStaffDialog, setShowDeleteStaffDialog] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  
  // Floor plan state
  const [floorPlans, setFloorPlans] = useState(initialFloorPlans)
  const [tables, setTables] = useState(initialTables)
  const [selectedFloorPlanId, setSelectedFloorPlanId] = useState(initialFloorPlans[0]?.id || '')
  const [showAddFloorPlanDialog, setShowAddFloorPlanDialog] = useState(false)
  const [showDeleteFloorPlanDialog, setShowDeleteFloorPlanDialog] = useState(false)
  
  // Table state
  const [showAddTableDialog, setShowAddTableDialog] = useState(false)
  const [showEditTableDialog, setShowEditTableDialog] = useState(false)
  const [showDeleteTableDialog, setShowDeleteTableDialog] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<TableZone | 'all'>('all')
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ticket config state
  const [config, setConfig] = useState(initialConfig)
  const [ticketRestaurantName, setTicketRestaurantName] = useState(restaurantName)
  const [titular, setTitular] = useState(initialConfig?.titular || '')
  const [nif, setNif] = useState(initialConfig?.nif || '')
  const [direccion, setDireccion] = useState(initialConfig?.direccion || '')
  const [codigoPostal, setCodigoPostal] = useState(initialConfig?.codigo_postal || '')
  const [ciudad, setCiudad] = useState(initialConfig?.ciudad || '')
  const [provincia, setProvincia] = useState(initialConfig?.provincia || '')
  const [telefono, setTelefono] = useState(initialConfig?.telefono || '')
  const [pieTicket, setPieTicket] = useState(initialConfig?.pie_ticket || '')
  const [logoPreview, setLogoPreview] = useState<string | null>(initialConfig?.logo_url || null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Carta state
  const [cartaTab, setCartaTab] = useState<CartaTab>('categorias')
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [cartaLoading, setCartaLoading] = useState(false)

  // Carta dialogs
  const [showCategorySheet, setShowCategorySheet] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null)
  const [showItemSheet, setShowItemSheet] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [showModifierSheet, setShowModifierSheet] = useState(false)
  const [editingModifier, setEditingModifier] = useState<ModifierGroup | null>(null)
  const [showAssignSheet, setShowAssignSheet] = useState(false)
  const [assigningGroupId, setAssigningGroupId] = useState<string | null>(null)
  const [assignedItems, setAssignedItems] = useState<string[]>([])

  const currentTables = tables[selectedFloorPlanId] || []
  const filteredTables = selectedZoneFilter === 'all' 
    ? currentTables 
    : currentTables.filter(t => t.zone === selectedZoneFilter)

  // Load carta data when section changes
  useEffect(() => {
    if (activeSection === 'carta') {
      loadCartaData()
    }
  }, [activeSection])

  const loadCartaData = async () => {
    setCartaLoading(true)
    const [cats, items, mods] = await Promise.all([
      getMenuCategories(),
      getMenuItems(),
      getModifierGroups(),
    ])
    setCategories(cats)
    setMenuItems(items)
    setModifierGroups(mods)
    if (cats.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(cats[0].id)
    }
    setCartaLoading(false)
  }

  // Staff handlers
  const handleAddStaff = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    const result = await createStaff(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.staff) {
      setStaff(prev => [...prev, result.staff!])
    }
    setLoading(false)
    setShowAddStaffDialog(false)
  }

  const handlePinChange = async (formData: FormData) => {
    if (!selectedStaff) return
    setLoading(true)
    setError(null)
    const newPin = formData.get('newPin') as string
    const result = await updateStaffPin(selectedStaff.id, newPin)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setLoading(false)
    setShowPinDialog(false)
    setSelectedStaff(null)
  }

  const handleDeleteStaff = async () => {
    if (!selectedStaff) return
    setLoading(true)
    const result = await deleteStaff(selectedStaff.id)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setStaff(prev => prev.filter(s => s.id !== selectedStaff.id))
    setLoading(false)
    setShowDeleteStaffDialog(false)
    setSelectedStaff(null)
  }

  // Floor plan handlers
  const handleAddFloorPlan = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    const name = formData.get('name') as string
    const result = await createFloorPlan(name)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.floorPlan) {
      setFloorPlans(prev => [...prev, result.floorPlan!])
      setTables(prev => ({ ...prev, [result.floorPlan!.id]: [] }))
      setSelectedFloorPlanId(result.floorPlan.id)
    }
    setLoading(false)
    setShowAddFloorPlanDialog(false)
  }

  const handleDeleteFloorPlan = async () => {
    if (!selectedFloorPlanId || floorPlans.length <= 1) return
    setLoading(true)
    const result = await deleteFloorPlan(selectedFloorPlanId)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    const newFloorPlans = floorPlans.filter(fp => fp.id !== selectedFloorPlanId)
    setFloorPlans(newFloorPlans)
    setSelectedFloorPlanId(newFloorPlans[0]?.id || '')
    setLoading(false)
    setShowDeleteFloorPlanDialog(false)
  }

  // Table handlers
  const handleAddTable = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    const label = formData.get('label') as string
    const capacity = parseInt(formData.get('capacity') as string)
    const zone = formData.get('zone') as TableZone
    const shape = formData.get('shape') as 'square' | 'round' | 'rectangular'
    const result = await createTable(selectedFloorPlanId, {
      label, capacity, zone, shape, x: 50, y: 50, width: 80, height: 80,
    })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.table) {
      setTables(prev => ({
        ...prev,
        [selectedFloorPlanId]: [...(prev[selectedFloorPlanId] || []), result.table!]
      }))
    }
    setLoading(false)
    setShowAddTableDialog(false)
  }

  const handleEditTable = async (formData: FormData) => {
    if (!selectedTable) return
    setLoading(true)
    setError(null)
    const label = formData.get('label') as string
    const capacity = parseInt(formData.get('capacity') as string)
    const zone = formData.get('zone') as TableZone
    const result = await updateTable(selectedTable.id, { label, capacity, zone })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setTables(prev => ({
      ...prev,
      [selectedFloorPlanId]: prev[selectedFloorPlanId].map(t =>
        t.id === selectedTable.id ? { ...t, label, capacity, zone } : t
      )
    }))
    setLoading(false)
    setShowEditTableDialog(false)
    setSelectedTable(null)
  }

  const handleDeleteTable = async () => {
    if (!selectedTable) return
    setLoading(true)
    const result = await deleteTable(selectedTable.id)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setTables(prev => ({
      ...prev,
      [selectedFloorPlanId]: prev[selectedFloorPlanId].filter(t => t.id !== selectedTable.id)
    }))
    setLoading(false)
    setShowDeleteTableDialog(false)
    setSelectedTable(null)
  }

  const handleLogout = async () => {
    await logout()
  }

  // Ticket config handlers
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) { setUploadingLogo(false); return }
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < imageData.data.length; i += 4) {
        const gray = imageData.data[i] * 0.3 + imageData.data[i + 1] * 0.59 + imageData.data[i + 2] * 0.11
        imageData.data[i] = gray
        imageData.data[i + 1] = gray
        imageData.data[i + 2] = gray
      }
      ctx.putImageData(imageData, 0, 0)
      const base64 = canvas.toDataURL('image/png')
      setLogoPreview(base64)
      const result = await uploadLogo(base64)
      if (result.url) {
        setConfig(prev => prev ? { ...prev, logo_url: result.url! } : null)
      }
      setUploadingLogo(false)
    }
    img.src = URL.createObjectURL(file)
  }

  const handleSaveTicketConfig = async () => {
    setSavingConfig(true)
    setConfigSaved(false)
    await updateRestaurantName(ticketRestaurantName)
    await updateRestaurantConfig({
      titular, nif, direccion,
      codigo_postal: codigoPostal, ciudad, provincia, telefono,
      pie_ticket: pieTicket || null,
    })
    setSavingConfig(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  // Carta handlers
  const handleSaveCategory = async (formData: FormData) => {
    setLoading(true)
    const name = formData.get('name') as string
    const printer_target = formData.get('printer_target') as 'cocina' | 'barra' | 'caja'
    const sort_order = parseInt(formData.get('sort_order') as string) || 0

    if (editingCategory) {
      await updateMenuCategory(editingCategory.id, { name, printer_target, sort_order })
    } else {
      await createMenuCategory({ name, printer_target, sort_order })
    }
    await loadCartaData()
    setLoading(false)
    setShowCategorySheet(false)
    setEditingCategory(null)
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Eliminar esta categoria?')) return
    await deleteMenuCategory(id)
    await loadCartaData()
  }

  const handleSaveItem = async (formData: FormData) => {
    setLoading(true)
    const name = formData.get('name') as string
    const category_id = formData.get('category_id') as string
    const priceStr = formData.get('price') as string
    const price = priceStr ? parseFloat(priceStr) : null
    const description = formData.get('description') as string || null
    const sin_gluten = formData.get('sin_gluten') === 'on'
    const organico = formData.get('organico') === 'on'
    const vegetariano = formData.get('vegetariano') === 'on'
    const vegano = formData.get('vegano') === 'on'
    const suave = formData.get('suave') === 'on'

    if (editingItem) {
      await updateMenuItem(editingItem.id, { 
        name, category_id, price, description, 
        sin_gluten, organico, vegetariano, vegano, suave 
      })
    } else {
      await createMenuItem({ 
        category_id, name, price, description,
        sin_gluten, organico, vegetariano, vegano, suave 
      })
    }
    await loadCartaData()
    setLoading(false)
    setShowItemSheet(false)
    setEditingItem(null)
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Eliminar este plato?')) return
    await deleteMenuItem(id)
    await loadCartaData()
  }

  const handleToggleAvailable = async (id: string, available: boolean) => {
    await toggleMenuItemAvailable(id, available)
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, available } : i))
  }

  const handleSaveModifier = async (formData: FormData) => {
    setLoading(true)
    const name = formData.get('name') as string
    const required = formData.get('required') === 'on'
    const multi_select = formData.get('multi_select') === 'on'
    
    // Parse options from form
    const optionNames = formData.getAll('option_name') as string[]
    const optionPrices = formData.getAll('option_price') as string[]
    const options = optionNames
      .map((n, i) => ({ name: n, price_delta: parseFloat(optionPrices[i]) || 0 }))
      .filter(o => o.name.trim())

    if (editingModifier) {
      await updateModifierGroup(editingModifier.id, { name, required, multi_select, options })
    } else {
      await createModifierGroup({ name, required, multi_select, options })
    }
    await loadCartaData()
    setLoading(false)
    setShowModifierSheet(false)
    setEditingModifier(null)
  }

  const handleDeleteModifier = async (id: string) => {
    if (!confirm('Eliminar este grupo de modificadores?')) return
    await deleteModifierGroup(id)
    await loadCartaData()
  }

  const handleOpenAssign = async (groupId: string) => {
    setAssigningGroupId(groupId)
    const items = await getModifierAssignments(groupId)
    setAssignedItems(items)
    setShowAssignSheet(true)
  }

  const handleSaveAssignments = async () => {
    if (!assigningGroupId) return
    setLoading(true)
    await assignModifierToItems(assigningGroupId, assignedItems)
    setLoading(false)
    setShowAssignSheet(false)
    setAssigningGroupId(null)
  }

  const previewConfig: RestaurantConfig | null = config ? {
    ...config, titular, nif, direccion,
    codigo_postal: codigoPostal, ciudad, provincia, telefono,
    pie_ticket: pieTicket || null, logo_url: logoPreview,
  } : {
    id: '', restaurant_id: '', titular, nif, direccion,
    codigo_postal: codigoPostal, ciudad, provincia, telefono,
    pie_ticket: pieTicket || null, logo_url: logoPreview,
    created_at: '', updated_at: '',
  }

  const filteredMenuItems = selectedCategoryId 
    ? menuItems.filter(i => i.category_id === selectedCategoryId)
    : menuItems

  // Sidebar navigation component
  const SidebarNav = ({ className }: { className?: string }) => (
    <nav className={cn("space-y-1", className)}>
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveSection(item.id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            activeSection === item.id
              ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      <hr className="my-3" />
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesion
      </button>
    </nav>
  )

  // Mobile tab bar
  const MobileTabBar = () => (
    <div className="flex overflow-x-auto border-b md:hidden">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveSection(item.id)}
          className={cn(
            "flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
            activeSection === item.id
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-muted-foreground"
          )}
        >
          {item.icon}
          <span className="hidden sm:inline">{item.label}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="p-4 border-b shrink-0">
        <h1 className="text-lg font-semibold">Ajustes</h1>
        <p className="text-sm text-muted-foreground">{restaurantName}</p>
      </header>

      {/* Mobile Tab Bar */}
      <MobileTabBar />

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-60 border-r p-4 shrink-0">
          <SidebarNav />
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4">
          {/* PLANO Y MESAS */}
          {activeSection === 'plano' && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Select value={selectedFloorPlanId} onValueChange={setSelectedFloorPlanId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {floorPlans.map(fp => (
                      <SelectItem key={fp.id} value={fp.id}>{fp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" onClick={() => setShowAddFloorPlanDialog(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
                {floorPlans.length > 1 && (
                  <Button size="icon" variant="outline" className="text-destructive" onClick={() => setShowDeleteFloorPlanDialog(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <Button asChild variant="outline" className="w-full">
                <Link href="/mapa?edit=true">
                  <Move className="h-4 w-4 mr-2" />
                  Editar posiciones en el mapa
                </Link>
              </Button>

              <div className="flex items-center gap-2">
                <Select value={selectedZoneFilter} onValueChange={(v) => setSelectedZoneFilter(v as TableZone | 'all')}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Filtrar por zona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las zonas</SelectItem>
                    {ZONES.map(zone => (
                      <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => setShowAddTableDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Mesa
                </Button>
              </div>

              <div className="space-y-2">
                {filteredTables.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay mesas en esta zona</p>
                ) : (
                  filteredTables.map((table) => (
                    <div key={table.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 font-bold">
                          {table.label}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{table.zone}</span>
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />{table.capacity}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground capitalize">{table.shape}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedTable(table); setShowEditTableDialog(true) }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedTable(table); setShowDeleteTableDialog(true) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* PERSONAL */}
          {activeSection === 'personal' && (
            <div className="max-w-2xl space-y-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAddStaffDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
              
              <div className="space-y-2">
                {staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                        {member.role === 'dueno' ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.name}</span>
                          {member.id === currentStaffId && <Badge variant="secondary" className="text-xs">Tu</Badge>}
                        </div>
                        <span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedStaff(member); setShowPinDialog(true) }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {member.id !== currentStaffId && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedStaff(member); setShowDeleteStaffDialog(true) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TICKET */}
          {activeSection === 'ticket' && (
            <div className="max-w-2xl space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Logo del restaurante</label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <div className="w-24 h-16 border rounded flex items-center justify-center bg-white">
                      <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-full object-contain grayscale" />
                    </div>
                  ) : (
                    <div className="w-24 h-16 border rounded flex items-center justify-center bg-muted text-muted-foreground text-xs">Sin logo</div>
                  )}
                  <div>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoUpload} className="hidden" id="logo-upload" disabled={uploadingLogo} />
                    <Button variant="outline" size="sm" asChild disabled={uploadingLogo}>
                      <label htmlFor="logo-upload" className="cursor-pointer">
                        {uploadingLogo ? <Spinner className="mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
                      </label>
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">Se convertira a escala de grises</p>
                  </div>
                </div>
              </div>

              <FieldGroup>
                <Field>
                  <FieldLabel>Nombre del restaurante</FieldLabel>
                  <Input value={ticketRestaurantName} onChange={(e) => setTicketRestaurantName(e.target.value)} placeholder="Casa Rula" />
                </Field>
                <Field>
                  <FieldLabel>Titular / Razon social</FieldLabel>
                  <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Adoracion Martinez Garcia" />
                </Field>
                <Field>
                  <FieldLabel>NIF / CIF</FieldLabel>
                  <Input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="10587092-P" />
                </Field>
                <Field>
                  <FieldLabel>Direccion</FieldLabel>
                  <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ctra. de Selorio, s/n" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel>Codigo postal</FieldLabel>
                    <Input value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} placeholder="33316" />
                  </Field>
                  <Field>
                    <FieldLabel>Ciudad</FieldLabel>
                    <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Villaviciosa" />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Provincia</FieldLabel>
                  <Input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Asturias" />
                </Field>
                <Field>
                  <FieldLabel>Telefono</FieldLabel>
                  <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="985 99 62 33" />
                </Field>
                <Field>
                  <FieldLabel>Pie del ticket (opcional)</FieldLabel>
                  <Textarea value={pieTicket} onChange={(e) => setPieTicket(e.target.value)} placeholder="Gracias por su visita!" rows={2} />
                </Field>
              </FieldGroup>

              <Button onClick={handleSaveTicketConfig} className="w-full" disabled={savingConfig}>
                {savingConfig ? <Spinner className="mr-2" /> : configSaved ? <Check className="h-4 w-4 mr-2" /> : null}
                {savingConfig ? 'Guardando...' : configSaved ? 'Guardado' : 'Guardar configuracion'}
              </Button>

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Vista previa del ticket</h4>
                <TicketPreview config={previewConfig} restaurantName={ticketRestaurantName} />
              </div>
            </div>
          )}

          {/* CARTA */}
          {activeSection === 'carta' && (
            <div className="space-y-4">
              {/* Carta Sub-tabs */}
              <div className="flex border-b">
                {(['categorias', 'platos', 'modificadores', 'preview'] as CartaTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCartaTab(tab)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                      cartaTab === tab ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab === 'preview' ? 'Vista previa' : tab}
                  </button>
                ))}
              </div>

              {cartaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : (
                <>
                  {/* Categorias Tab */}
                  {cartaTab === 'categorias' && (
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => { setEditingCategory(null); setShowCategorySheet(true) }}>
                          <Plus className="h-4 w-4 mr-1" />
                          Categoria
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {categories.map(cat => (
                          <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{cat.name}</span>
                              <Badge variant="secondary">{cat.printer_target}</Badge>
                              <span className="text-xs text-muted-foreground">Orden: {cat.sort_order}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setEditingCategory(cat); setShowCategorySheet(true) }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCategory(cat.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {categories.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">No hay categorias</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Platos Tab */}
                  {cartaTab === 'platos' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {categories.map(cat => (
                          <Button
                            key={cat.id}
                            variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategoryId(cat.id)}
                          >
                            {cat.name}
                          </Button>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => { setEditingItem(null); setShowItemSheet(true) }}>
                          <Plus className="h-4 w-4 mr-1" />
                          Plato
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {filteredMenuItems.map(item => (
                          <Card key={item.id} className={cn(!item.available && "opacity-50")}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-medium">{item.name}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {item.price != null ? `${item.price.toFixed(2)}€` : 'Consultar'}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {item.sin_gluten && <Badge variant="outline" className="text-xs">Sin gluten</Badge>}
                                    {item.organico && <Badge variant="outline" className="text-xs">Organico</Badge>}
                                    {item.vegetariano && <Badge variant="outline" className="text-xs">Vegetariano</Badge>}
                                    {item.vegano && <Badge variant="outline" className="text-xs">Vegano</Badge>}
                                    {item.suave && <Badge variant="outline" className="text-xs">Suave</Badge>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch checked={item.available} onCheckedChange={(checked) => handleToggleAvailable(item.id, checked)} />
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setShowItemSheet(true) }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteItem(item.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                      {filteredMenuItems.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No hay platos en esta categoria</p>
                      )}
                    </div>
                  )}

                  {/* Modificadores Tab */}
                  {cartaTab === 'modificadores' && (
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => { setEditingModifier(null); setShowModifierSheet(true) }}>
                          <Plus className="h-4 w-4 mr-1" />
                          Grupo
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {modifierGroups.map(group => (
                          <Card key={group.id}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CardTitle className="text-base">{group.name}</CardTitle>
                                  {group.required && <Badge>Requerido</Badge>}
                                  {group.multi_select && <Badge variant="secondary">Multiple</Badge>}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="outline" size="sm" onClick={() => handleOpenAssign(group.id)}>
                                    Asignar a platos
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingModifier(group); setShowModifierSheet(true) }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteModifier(group.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-1">
                                {group.options.map(opt => (
                                  <div key={opt.id} className="flex items-center justify-between text-sm">
                                    <span>{opt.name}</span>
                                    <span className="text-muted-foreground">
                                      {opt.price_delta > 0 ? `+${opt.price_delta.toFixed(2)}€` : opt.price_delta < 0 ? `${opt.price_delta.toFixed(2)}€` : '0€'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {modifierGroups.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">No hay grupos de modificadores</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview Tab */}
                  {cartaTab === 'preview' && (
                    <div className="space-y-6">
                      {categories.map(cat => {
                        const catItems = menuItems.filter(i => i.category_id === cat.id && i.available)
                        if (catItems.length === 0) return null
                        return (
                          <div key={cat.id}>
                            <h3 className="text-lg font-semibold mb-3 text-amber-600">{cat.name}</h3>
                            <div className="space-y-2">
                              {catItems.map(item => (
                                <div key={item.id} className="flex items-start justify-between py-2 border-b border-dashed last:border-0">
                                  <div>
                                    <span className="font-medium">{item.name}</span>
                                    <div className="flex gap-1 mt-1">
                                      {item.sin_gluten && <Badge variant="outline" className="text-xs">SG</Badge>}
                                      {item.vegetariano && <Badge variant="outline" className="text-xs">V</Badge>}
                                      {item.vegano && <Badge variant="outline" className="text-xs">VG</Badge>}
                                    </div>
                                  </div>
                                  <span className="font-medium">
                                    {item.price != null ? `${item.price.toFixed(2)}€` : 'Consultar'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* GENERAL */}
          {activeSection === 'general' && (
            <div className="max-w-2xl space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Informacion del restaurante</CardTitle>
                  <CardDescription>Configuracion general</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Nombre: <strong>{restaurantName}</strong>
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Temporizador KDS</CardTitle>
                  <CardDescription>Umbrales de color para la pantalla de cocina</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        Aviso amarillo
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="60"
                          value={config?.kds_warning_minutes ?? 10}
                          onChange={(e) => setConfig({ ...config, kds_warning_minutes: parseInt(e.target.value) || 10 })}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">minutos</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500" />
                        Aviso rojo
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="60"
                          value={config?.kds_danger_minutes ?? 20}
                          onChange={(e) => setConfig({ ...config, kds_danger_minutes: parseInt(e.target.value) || 20 })}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">minutos</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      setLoading(true)
                      await updateRestaurantConfig({
                        kds_warning_minutes: config?.kds_warning_minutes ?? 10,
                        kds_danger_minutes: config?.kds_danger_minutes ?? 20
                      })
                      setLoading(false)
                    }}
                    disabled={loading}
                  >
                    {loading ? <Spinner className="mr-2" /> : null}
                    Guardar
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* DIALOGS */}
      
      {/* Add Floor Plan Dialog */}
      <Dialog open={showAddFloorPlanDialog} onOpenChange={setShowAddFloorPlanDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Nuevo Plano</DialogTitle>
            <DialogDescription>Crea un nuevo espacio para tu restaurante</DialogDescription>
          </DialogHeader>
          <form action={handleAddFloorPlan}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="floorPlanName">Nombre</FieldLabel>
                <Input id="floorPlanName" name="name" placeholder="Terraza, Salon Principal..." required autoComplete="off" />
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddFloorPlanDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? <Spinner className="mr-2" /> : null}Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Floor Plan Dialog */}
      <AlertDialog open={showDeleteFloorPlanDialog} onOpenChange={setShowDeleteFloorPlanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plano</AlertDialogTitle>
            <AlertDialogDescription>Se eliminaran todas las mesas de este plano. Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFloorPlan} disabled={loading}>{loading ? 'Eliminando...' : 'Eliminar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Table Dialog */}
      <Dialog open={showAddTableDialog} onOpenChange={setShowAddTableDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Nueva Mesa</DialogTitle>
            <DialogDescription>Agrega una mesa al plano</DialogDescription>
          </DialogHeader>
          <form action={handleAddTable}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="tableLabel">Nombre</FieldLabel>
                <Input id="tableLabel" name="label" placeholder="T1, D1, P1..." required autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="tableCapacity">Capacidad</FieldLabel>
                <Input id="tableCapacity" name="capacity" type="number" inputMode="numeric" min="1" max="20" defaultValue="4" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="tableZone">Zona</FieldLabel>
                <Select name="zone" defaultValue="Dentro">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map(zone => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="tableShape">Forma</FieldLabel>
                <Select name="shape" defaultValue="square">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Cuadrada</SelectItem>
                    <SelectItem value="round">Redonda</SelectItem>
                    <SelectItem value="rectangular">Rectangular</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddTableDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? <Spinner className="mr-2" /> : null}Agregar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={showEditTableDialog} onOpenChange={setShowEditTableDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Mesa</DialogTitle>
            <DialogDescription>Modifica los datos de la mesa {selectedTable?.label}</DialogDescription>
          </DialogHeader>
          <form action={handleEditTable}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="editTableLabel">Nombre</FieldLabel>
                <Input id="editTableLabel" name="label" defaultValue={selectedTable?.label} required autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="editTableCapacity">Capacidad</FieldLabel>
                <Input id="editTableCapacity" name="capacity" type="number" inputMode="numeric" min="1" max="20" defaultValue={selectedTable?.capacity} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="editTableZone">Zona</FieldLabel>
                <Select name="zone" defaultValue={selectedTable?.zone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map(zone => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowEditTableDialog(false); setSelectedTable(null) }}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? <Spinner className="mr-2" /> : null}Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Table Dialog */}
      <AlertDialog open={showDeleteTableDialog} onOpenChange={setShowDeleteTableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mesa {selectedTable?.label}</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer. Las reservas de esta mesa quedaran sin asignar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedTable(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTable} disabled={loading}>{loading ? 'Eliminando...' : 'Eliminar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Staff Dialog */}
      <Dialog open={showAddStaffDialog} onOpenChange={setShowAddStaffDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Agregar Personal</DialogTitle>
            <DialogDescription>Crea acceso para un nuevo miembro del equipo</DialogDescription>
          </DialogHeader>
          <form action={handleAddStaff}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="staffName">Nombre</FieldLabel>
                <Input id="staffName" name="name" placeholder="Nombre del empleado" required autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="staffRole">Rol</FieldLabel>
                <Select name="role" defaultValue="mesero">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesero">Mesero</SelectItem>
                    <SelectItem value="dueno">Dueno</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="staffPin">PIN (4 digitos)</FieldLabel>
                <Input id="staffPin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="****" required autoComplete="off" />
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddStaffDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? <Spinner className="mr-2" /> : null}Agregar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cambiar PIN</DialogTitle>
            <DialogDescription>Nuevo PIN para {selectedStaff?.name}</DialogDescription>
          </DialogHeader>
          <form action={handlePinChange}>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="newPin">Nuevo PIN (4 digitos)</FieldLabel>
                <Input id="newPin" name="newPin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="****" required autoComplete="off" />
              </Field>
            </FieldGroup>
            {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowPinDialog(false); setSelectedStaff(null) }}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? <Spinner className="mr-2" /> : null}Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Staff Dialog */}
      <AlertDialog open={showDeleteStaffDialog} onOpenChange={setShowDeleteStaffDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar a {selectedStaff?.name}</AlertDialogTitle>
            <AlertDialogDescription>Esta persona perdera el acceso a la aplicacion. Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedStaff(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStaff} disabled={loading}>{loading ? 'Eliminando...' : 'Eliminar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category Sheet */}
      <Sheet open={showCategorySheet} onOpenChange={setShowCategorySheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingCategory ? 'Editar categoria' : 'Nueva categoria'}</SheetTitle>
          </SheetHeader>
          <form action={handleSaveCategory} className="space-y-4 mt-4">
            <Field>
              <FieldLabel>Nombre</FieldLabel>
              <Input name="name" defaultValue={editingCategory?.name} required />
            </Field>
            <Field>
              <FieldLabel>Destino impresora</FieldLabel>
              <Select name="printer_target" defaultValue={editingCategory?.printer_target || 'cocina'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cocina">Cocina</SelectItem>
                  <SelectItem value="barra">Barra</SelectItem>
                  <SelectItem value="caja">Caja</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Orden</FieldLabel>
              <Input name="sort_order" type="number" inputMode="numeric" defaultValue={editingCategory?.sort_order || categories.length + 1} />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}Guardar
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Item Sheet */}
      <Sheet open={showItemSheet} onOpenChange={setShowItemSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingItem ? 'Editar plato' : 'Nuevo plato'}</SheetTitle>
          </SheetHeader>
          <form action={handleSaveItem} className="space-y-4 mt-4">
            <Field>
              <FieldLabel>Nombre</FieldLabel>
              <Input name="name" defaultValue={editingItem?.name} required />
            </Field>
            <Field>
              <FieldLabel>Categoria</FieldLabel>
              <Select name="category_id" defaultValue={editingItem?.category_id || selectedCategoryId || ''}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Precio (dejar vacio = Consultar)</FieldLabel>
              <Input name="price" type="number" inputMode="decimal" step="0.01" defaultValue={editingItem?.price ?? ''} />
            </Field>
            <Field>
              <FieldLabel>Descripcion (opcional)</FieldLabel>
              <Textarea name="description" defaultValue={editingItem?.description || ''} rows={2} />
            </Field>
            <div className="space-y-2">
              <FieldLabel>Tags</FieldLabel>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  <Checkbox name="sin_gluten" defaultChecked={editingItem?.sin_gluten} />
                  <span className="text-sm">Sin gluten</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox name="organico" defaultChecked={editingItem?.organico} />
                  <span className="text-sm">Organico</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox name="vegetariano" defaultChecked={editingItem?.vegetariano} />
                  <span className="text-sm">Vegetariano</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox name="vegano" defaultChecked={editingItem?.vegano} />
                  <span className="text-sm">Vegano</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox name="suave" defaultChecked={editingItem?.suave} />
                  <span className="text-sm">Suave</span>
                </label>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}Guardar
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Modifier Sheet */}
      <Sheet open={showModifierSheet} onOpenChange={setShowModifierSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingModifier ? 'Editar grupo' : 'Nuevo grupo de modificadores'}</SheetTitle>
          </SheetHeader>
          <ModifierForm 
            editingModifier={editingModifier} 
            onSubmit={handleSaveModifier} 
            loading={loading} 
          />
        </SheetContent>
      </Sheet>

      {/* Assign to Items Sheet */}
      <Sheet open={showAssignSheet} onOpenChange={setShowAssignSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Asignar a platos</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[60vh] mt-4">
            <div className="space-y-2">
              {menuItems.map(item => (
                <label key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                  <Checkbox 
                    checked={assignedItems.includes(item.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setAssignedItems(prev => [...prev, item.id])
                      } else {
                        setAssignedItems(prev => prev.filter(id => id !== item.id))
                      }
                    }}
                  />
                  <span className="text-sm">{item.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
          <Button onClick={handleSaveAssignments} className="w-full mt-4" disabled={loading}>
            {loading ? <Spinner className="mr-2" /> : null}Guardar asignaciones
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// Modifier form component with dynamic options
function ModifierForm({ 
  editingModifier, 
  onSubmit, 
  loading 
}: { 
  editingModifier: ModifierGroup | null
  onSubmit: (formData: FormData) => void
  loading: boolean 
}) {
  const [options, setOptions] = useState<{ name: string; price_delta: number }[]>(
    editingModifier?.options.map(o => ({ name: o.name, price_delta: o.price_delta })) || [{ name: '', price_delta: 0 }]
  )

  const addOption = () => setOptions(prev => [...prev, { name: '', price_delta: 0 }])
  const removeOption = (idx: number) => setOptions(prev => prev.filter((_, i) => i !== idx))
  const updateOption = (idx: number, field: 'name' | 'price_delta', value: string | number) => {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o))
  }

  return (
    <form action={onSubmit} className="space-y-4 mt-4">
      <Field>
        <FieldLabel>Nombre del grupo</FieldLabel>
        <Input name="name" defaultValue={editingModifier?.name} required />
      </Field>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <Checkbox name="required" defaultChecked={editingModifier?.required} />
          <span className="text-sm">Requerido</span>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="multi_select" defaultChecked={editingModifier?.multi_select} />
          <span className="text-sm">Seleccion multiple</span>
        </label>
      </div>
      <div className="space-y-2">
        <FieldLabel>Opciones</FieldLabel>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input 
              name="option_name"
              value={opt.name}
              onChange={(e) => updateOption(idx, 'name', e.target.value)}
              placeholder="Nombre opcion"
              className="flex-1"
            />
            <Input 
              name="option_price"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={opt.price_delta}
              onChange={(e) => updateOption(idx, 'price_delta', parseFloat(e.target.value) || 0)}
              placeholder="+0.00"
              className="w-24"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(idx)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addOption}>
          <Plus className="h-4 w-4 mr-1" />
          Anadir opcion
        </Button>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Spinner className="mr-2" /> : null}Guardar
      </Button>
    </form>
  )
}
