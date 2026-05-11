import { redirect } from 'next/navigation'

// /caja was a dead-end placeholder ("Sin cuentas por cobrar"). Users get
// to caja by tapping a seated table on the map → "Cobrar". Hitting /caja
// directly should send them to the map so they can pick a table.
export default function CajaIndexPage() {
  redirect('/mapa')
}
