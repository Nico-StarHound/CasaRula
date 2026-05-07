'use server'

import { createClient } from '@/lib/supabase/server'

// Get restaurant ID helper
async function getRestaurantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single()
  return data?.id || null
}

export interface MenuCategory {
  id: string
  name: string
  printer_target: 'cocina' | 'barra' | 'caja' | null
  sort_order: number
}

export interface MenuItem {
  id: string
  category_id: string | null
  name: string
  price: number | null
  description: string | null
  is_available: boolean
  available: boolean
  sort_order: number
  sin_gluten: boolean
  organico: boolean
  vegetariano: boolean
  vegano: boolean
  suave: boolean
}

export interface ModifierGroup {
  id: string
  name: string
  required: boolean
  multi_select: boolean
  options: ModifierOption[]
}

export interface ModifierOption {
  id: string
  group_id: string
  name: string
  price_delta: number
  sort_order: number
}

export async function getMenuCategories(): Promise<MenuCategory[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })

  return (data || []) as MenuCategory[]
}

export async function getMenuItems(categoryId?: string): Promise<MenuItem[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  let query = supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data } = await query
  return (data || []).map(item => ({
    ...item,
    available: item.available ?? item.is_available ?? true,
    sin_gluten: item.sin_gluten ?? false,
    organico: item.organico ?? false,
    vegetariano: item.vegetariano ?? false,
    vegano: item.vegano ?? false,
    suave: item.suave ?? false,
  })) as MenuItem[]
}

export async function getFullMenu(): Promise<{ categories: MenuCategory[]; items: MenuItem[] }> {
  const [categories, items] = await Promise.all([
    getMenuCategories(),
    getMenuItems(),
  ])
  return { categories, items }
}

// Seed Casa Rula menu data
export async function seedMenuData(): Promise<{ success: boolean; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { success: false, error: 'No restaurant found' }

  const supabase = await createClient()

  // Check if menu already seeded
  const { data: existingCategories } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .limit(1)

  if (existingCategories && existingCategories.length > 0) {
    return { success: true } // Already seeded
  }

  // Categories
  const categories = [
    { name: 'Entrantes', printer_target: 'cocina', sort_order: 1 },
    { name: 'Ensaladas', printer_target: 'cocina', sort_order: 2 },
    { name: 'Carnes', printer_target: 'cocina', sort_order: 3 },
    { name: 'Pescados', printer_target: 'cocina', sort_order: 4 },
    { name: 'Arroces', printer_target: 'cocina', sort_order: 5 },
    { name: 'Postres', printer_target: 'cocina', sort_order: 6 },
    { name: 'Vinos Tintos', printer_target: 'barra', sort_order: 7 },
    { name: 'Vinos Blancos', printer_target: 'barra', sort_order: 8 },
    { name: 'Bebidas', printer_target: 'barra', sort_order: 9 },
    { name: 'Cafes', printer_target: 'barra', sort_order: 10 },
  ]

  const { data: insertedCategories, error: catError } = await supabase
    .from('menu_categories')
    .insert(categories.map(c => ({ ...c, restaurant_id: restaurantId })))
    .select()

  if (catError || !insertedCategories) {
    return { success: false, error: catError?.message || 'Failed to insert categories' }
  }

  // Build category ID map
  const catMap: Record<string, string> = {}
  for (const cat of insertedCategories) {
    catMap[cat.name] = cat.id
  }

  // Menu items
  const items = [
    // Entrantes
    { category: 'Entrantes', name: 'Croquetas caseras (6 uds)', price: 9.50, sort_order: 1 },
    { category: 'Entrantes', name: 'Jamón ibérico', price: 18.00, sort_order: 2 },
    { category: 'Entrantes', name: 'Tabla de quesos asturianos', price: 14.00, sort_order: 3 },
    { category: 'Entrantes', name: 'Tortilla española', price: 8.00, sort_order: 4 },
    { category: 'Entrantes', name: 'Pulpo a la gallega', price: 16.00, sort_order: 5 },
    { category: 'Entrantes', name: 'Pimientos de padrón', price: 7.50, sort_order: 6 },

    // Ensaladas
    { category: 'Ensaladas', name: 'Ensalada mixta', price: 8.00, sort_order: 1 },
    { category: 'Ensaladas', name: 'Ensalada César', price: 11.00, sort_order: 2 },
    { category: 'Ensaladas', name: 'Ensalada de tomate y ventresca', price: 13.00, sort_order: 3 },

    // Carnes
    { category: 'Carnes', name: 'Cachopo de ternera', price: 22.00, sort_order: 1 },
    { category: 'Carnes', name: 'Solomillo al cabrales', price: 19.00, sort_order: 2 },
    { category: 'Carnes', name: 'Entrecot a la brasa', price: 18.00, sort_order: 3 },
    { category: 'Carnes', name: 'Secreto ibérico', price: 16.00, sort_order: 4 },
    { category: 'Carnes', name: 'Costillas BBQ', price: 15.00, sort_order: 5 },

    // Pescados
    { category: 'Pescados', name: 'Merluza a la sidra', price: 17.00, sort_order: 1 },
    { category: 'Pescados', name: 'Lubina a la espalda', price: 19.00, sort_order: 2 },
    { category: 'Pescados', name: 'Bacalao al pil-pil', price: 18.00, sort_order: 3 },

    // Arroces
    { category: 'Arroces', name: 'Arroz con bogavante', price: 24.00, sort_order: 1 },
    { category: 'Arroces', name: 'Arroz negro', price: 16.00, sort_order: 2 },
    { category: 'Arroces', name: 'Paella mixta', price: 15.00, sort_order: 3 },

    // Postres
    { category: 'Postres', name: 'Arroz con leche', price: 5.00, sort_order: 1 },
    { category: 'Postres', name: 'Tarta de queso', price: 6.00, sort_order: 2 },
    { category: 'Postres', name: 'Frixuelos', price: 5.50, sort_order: 3 },
    { category: 'Postres', name: 'Helado artesano', price: 4.50, sort_order: 4 },

    // Vinos Tintos
    { category: 'Vinos Tintos', name: 'Protos Crianza', price: 18.00, sort_order: 1 },
    { category: 'Vinos Tintos', name: 'Ramón Bilbao Reserva', price: 22.00, sort_order: 2 },
    { category: 'Vinos Tintos', name: 'Vino tinto de la casa', price: 12.00, sort_order: 3 },

    // Vinos Blancos
    { category: 'Vinos Blancos', name: 'Albariño', price: 16.00, sort_order: 1 },
    { category: 'Vinos Blancos', name: 'Verdejo Rueda', price: 14.00, sort_order: 2 },
    { category: 'Vinos Blancos', name: 'Vino blanco de la casa', price: 10.00, sort_order: 3 },

    // Bebidas
    { category: 'Bebidas', name: 'Agua mineral 1L', price: 2.50, sort_order: 1 },
    { category: 'Bebidas', name: 'Refresco', price: 2.50, sort_order: 2 },
    { category: 'Bebidas', name: 'Cerveza caña', price: 2.00, sort_order: 3 },
    { category: 'Bebidas', name: 'Sidra natural', price: 4.00, sort_order: 4 },
    { category: 'Bebidas', name: 'Copa de vino', price: 3.50, sort_order: 5 },

    // Cafes
    { category: 'Cafes', name: 'Café solo', price: 1.50, sort_order: 1 },
    { category: 'Cafes', name: 'Café con leche', price: 1.80, sort_order: 2 },
    { category: 'Cafes', name: 'Cortado', price: 1.60, sort_order: 3 },
    { category: 'Cafes', name: 'Infusión', price: 1.80, sort_order: 4 },
  ]

  const menuItems = items.map(item => ({
    restaurant_id: restaurantId,
    category_id: catMap[item.category],
    name: item.name,
    price: item.price,
    sort_order: item.sort_order,
    is_available: true,
  }))

  const { error: itemsError } = await supabase
    .from('menu_items')
    .insert(menuItems)

  if (itemsError) {
    return { success: false, error: itemsError.message }
  }

  return { success: true }
}

// ========== CATEGORY CRUD ==========

export async function createMenuCategory(data: {
  name: string
  printer_target: 'cocina' | 'barra' | 'caja'
  sort_order: number
}): Promise<{ category?: MenuCategory; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'No restaurant found' }

  const supabase = await createClient()
  
  const { data: category, error } = await supabase
    .from('menu_categories')
    .insert({
      restaurant_id: restaurantId,
      name: data.name,
      printer_target: data.printer_target,
      sort_order: data.sort_order,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { category }
}

export async function updateMenuCategory(
  id: string,
  data: { name?: string; printer_target?: 'cocina' | 'barra' | 'caja'; sort_order?: number }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('menu_categories')
    .update(data)
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteMenuCategory(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ========== MENU ITEM CRUD ==========

export async function createMenuItem(data: {
  category_id: string
  name: string
  price: number | null
  description?: string | null
  available?: boolean
  sin_gluten?: boolean
  organico?: boolean
  vegetariano?: boolean
  vegano?: boolean
  suave?: boolean
  sort_order?: number
}): Promise<{ item?: MenuItem; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'No restaurant found' }

  const supabase = await createClient()
  
  const { data: item, error } = await supabase
    .from('menu_items')
    .insert({
      restaurant_id: restaurantId,
      category_id: data.category_id,
      name: data.name,
      price: data.price,
      description: data.description || null,
      is_available: data.available ?? true,
      available: data.available ?? true,
      sin_gluten: data.sin_gluten ?? false,
      organico: data.organico ?? false,
      vegetariano: data.vegetariano ?? false,
      vegano: data.vegano ?? false,
      suave: data.suave ?? false,
      sort_order: data.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { item }
}

export async function updateMenuItem(
  id: string,
  data: Partial<Omit<MenuItem, 'id'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  // Also update is_available when available changes
  const updateData: Record<string, unknown> = { ...data }
  if ('available' in data) {
    updateData.is_available = data.available
  }
  
  const { error } = await supabase
    .from('menu_items')
    .update(updateData)
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteMenuItem(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function toggleMenuItemAvailable(
  id: string,
  available: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('menu_items')
    .update({ available, is_available: available })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ========== MODIFIER GROUPS ==========

export async function getModifierGroups(): Promise<ModifierGroup[]> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return []

  const supabase = await createClient()
  
  const { data: groups } = await supabase
    .from('modifier_groups')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name')

  if (!groups) return []

  const { data: options } = await supabase
    .from('modifier_options')
    .select('*')
    .order('sort_order')

  return groups.map(group => ({
    ...group,
    options: (options || []).filter(opt => opt.group_id === group.id)
  }))
}

export async function createModifierGroup(data: {
  name: string
  required: boolean
  multi_select: boolean
  options: { name: string; price_delta: number }[]
}): Promise<{ group?: ModifierGroup; error?: string }> {
  const restaurantId = await getRestaurantId()
  if (!restaurantId) return { error: 'No restaurant found' }

  const supabase = await createClient()
  
  const { data: group, error: groupError } = await supabase
    .from('modifier_groups')
    .insert({
      restaurant_id: restaurantId,
      name: data.name,
      required: data.required,
      multi_select: data.multi_select,
    })
    .select()
    .single()

  if (groupError) return { error: groupError.message }

  // Create options
  if (data.options.length > 0) {
    const optionsToInsert = data.options.map((opt, idx) => ({
      group_id: group.id,
      name: opt.name,
      price_delta: opt.price_delta,
      sort_order: idx,
    }))

    await supabase.from('modifier_options').insert(optionsToInsert)
  }

  const { data: options } = await supabase
    .from('modifier_options')
    .select('*')
    .eq('group_id', group.id)
    .order('sort_order')

  return { group: { ...group, options: options || [] } }
}

export async function updateModifierGroup(
  id: string,
  data: {
    name?: string
    required?: boolean
    multi_select?: boolean
    options?: { id?: string; name: string; price_delta: number }[]
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error: groupError } = await supabase
    .from('modifier_groups')
    .update({
      name: data.name,
      required: data.required,
      multi_select: data.multi_select,
    })
    .eq('id', id)

  if (groupError) return { success: false, error: groupError.message }

  if (data.options) {
    await supabase.from('modifier_options').delete().eq('group_id', id)
    
    if (data.options.length > 0) {
      const optionsToInsert = data.options.map((opt, idx) => ({
        group_id: id,
        name: opt.name,
        price_delta: opt.price_delta,
        sort_order: idx,
      }))
      await supabase.from('modifier_options').insert(optionsToInsert)
    }
  }

  return { success: true }
}

export async function deleteModifierGroup(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  await supabase.from('modifier_options').delete().eq('group_id', id)
  
  const { error } = await supabase
    .from('modifier_groups')
    .delete()
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function assignModifierToItems(
  groupId: string,
  itemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  await supabase
    .from('menu_item_modifiers')
    .delete()
    .eq('group_id', groupId)

  if (itemIds.length > 0) {
    const assignments = itemIds.map(itemId => ({
      menu_item_id: itemId,
      group_id: groupId,
    }))
    
    const { error } = await supabase
      .from('menu_item_modifiers')
      .insert(assignments)

    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getModifierAssignments(groupId: string): Promise<string[]> {
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('menu_item_modifiers')
    .select('menu_item_id')
    .eq('group_id', groupId)

  return (data || []).map(d => d.menu_item_id)
}
