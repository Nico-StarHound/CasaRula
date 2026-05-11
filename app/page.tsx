import { redirect } from 'next/navigation'

export default function HomePage() {
  // The RBAC middleware will route this to /cocina for kitchen role,
  // or to /login if there's no session. Defaulting to /mapa here keeps
  // things simple for everyone else.
  redirect('/mapa')
}
