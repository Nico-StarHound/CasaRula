import { getGuests } from '@/app/actions/guests'
import { ClientesClient } from './clientes-client'

export default async function ClientesPage() {
  const guests = await getGuests()
  return <ClientesClient initialGuests={guests} />
}
