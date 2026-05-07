import { getDefaultFloorPlan } from '@/app/actions/floor-plan'
import { createClient } from '@/lib/supabase/server'
import { MapaClient } from './mapa-client'

export default async function MapaPage() {
  const supabase = await createClient()
  
  // Get restaurant name
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .limit(1)
    .single()

  const floorPlan = await getDefaultFloorPlan()
  if (!floorPlan) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground text-center">
          No hay planos configurados. Espera un momento y recarga la página.
        </p>
      </div>
    )
  }

  return (
    <MapaClient 
      floorPlanId={floorPlan.id}
      restaurantName={restaurant?.name || 'Mi Restaurante'}
    />
  )
}
