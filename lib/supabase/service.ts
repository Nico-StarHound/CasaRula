import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for use ONLY in server actions and route
 * handlers. Bypasses RLS entirely, so it can read/write any row.
 *
 * Why this exists:
 *   Our app does not use Supabase Auth. We have our own JWT cookie
 *   session, so when the browser (or even the server's anon client)
 *   talks to Supabase, Postgres sees role=anon and auth.uid()=null.
 *   RLS policies based on auth.uid() therefore can't help us.
 *
 *   With RLS turned on (scripts/005_rls.sql), the anon role can only
 *   read from public tables — it can't insert, update or delete. All
 *   mutations must go through server actions, which use THIS client.
 *
 * Security boundary:
 *   - service_role key must NEVER reach the browser. It's only read
 *     from process.env on the server. Next.js does this automatically
 *     because we don't expose it via NEXT_PUBLIC_*.
 *   - Server actions must validate that the caller is logged in
 *     (cookie session) and authorised (role check) before doing
 *     anything destructive. We can't rely on Postgres to do it for
 *     us when we're bypassing RLS.
 *
 * Don't use this in client components — it won't even compile in the
 * browser bundle because process.env.SUPABASE_SERVICE_ROLE_KEY is
 * undefined there.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'createServiceClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }
  return createSupabaseClient(url, key, {
    auth: {
      // We don't use Supabase Auth, so don't persist anything between
      // calls. Each server action gets a fresh, stateless client.
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
