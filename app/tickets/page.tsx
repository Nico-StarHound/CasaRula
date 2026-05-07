import { getTickets, getTicketsStats } from '@/app/actions/tickets'
import { getRestaurantConfig } from '@/app/actions/config'
import { TicketsClient } from './tickets-client'

export default async function TicketsPage() {
  const today = new Date().toISOString().split('T')[0]
  const tickets = await getTickets(50, 0, { dateFrom: today, dateTo: today })
  const stats = await getTicketsStats(today, today)
  const config = await getRestaurantConfig()

  return (
    <TicketsClient 
      initialTickets={tickets} 
      initialStats={stats}
      config={config}
    />
  )
}
