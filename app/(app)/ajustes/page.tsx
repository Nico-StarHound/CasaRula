import { getStaff } from '@/app/actions/staff'
import { getFloorPlans, getFloorPlanWithTables } from '@/app/actions/floor-plan'
import { getRestaurantConfig } from '@/app/actions/config'
import { createServiceClient } from '@/lib/supabase/service'
import { AjustesClient } from './ajustes-client'
import type { Table } from '@/lib/types'

export default async function AjustesPage() {
  const supabase = createServiceClient()
  
  // Get restaurant
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .limit(1)
    .single()

  const staff = await getStaff()
  const floorPlans = await getFloorPlans()
  const config = await getRestaurantConfig()
  
  // Load tables for each floor plan
  const tablesRecord: Record<string, Table[]> = {}
  for (const fp of floorPlans) {
    const result = await getFloorPlanWithTables(fp.id)
    if (result) {
      tablesRecord[fp.id] = result.tables
    }
  }
  
  return (
    <AjustesClient 
      initialStaff={staff} 
      currentStaffId=""
      restaurantName={restaurant?.name || 'Mi Restaurante'}
      initialFloorPlans={floorPlans}
      initialTables={tablesRecord}
      initialConfig={config}
    />
  )
}
