import { redirect } from 'next/navigation'

// /comandas was 404 because there was no page here, only the
// /comandas/tomar/[tableId] route. Redirect to the table picker so the
// route is no longer dead — this is also what testRoutes / /admin link to.
export default function ComandasIndex() {
  redirect('/comandas/tomar')
}
