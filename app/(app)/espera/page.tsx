import { getWaitlist } from '@/app/actions/waitlist'
import { EsperaClient } from './espera-client'

export default async function EsperaPage() {
  const waitlist = await getWaitlist()
  return <EsperaClient initialWaitlist={waitlist} />
}
