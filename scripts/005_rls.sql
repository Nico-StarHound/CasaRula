-- =====================================================================
-- Row Level Security policies for Casa Rula
-- =====================================================================
--
-- Context: this app does not use Supabase Auth. Sessions are managed
-- via our own JWT cookie. From Postgres's perspective every request
-- comes in either as:
--   - service_role  → server actions using createServiceClient()
--   - anon          → browser (Realtime, lib/supabase/client) or
--                     server actions still on the SSR client
--
-- service_role bypasses RLS by definition, so all policies below only
-- need to worry about what `anon` can do.
--
-- Threat model:
--   The NEXT_PUBLIC_SUPABASE_ANON_KEY is shipped to every browser. With
--   the URL and schema (public on GitHub), anyone could open the
--   browser console and start mutating data: drop tables-worth of
--   reservations, fake orders, read staff PIN hashes, etc.
--
-- What we want:
--   - Reads: anon can SELECT everything needed to render the UI without
--            login. The login page itself needs to read `restaurants`
--            and `staff` (to verify PIN), the public booking link
--            needs to read tables and reservations, etc. Reads are
--            already cheap so leaving them open is the pragmatic
--            choice (we mitigate sensitive columns separately below).
--   - Writes: anon CANNOT insert/update/delete anything. All
--             mutations must go through server actions that are
--             behind our JWT cookie auth.
--
-- Migration plan:
--   1. Apply this script in Supabase SQL editor.
--   2. Deploy app with createServiceClient() wired into write paths
--      of every server action (see the migration commit after this).
--   3. Verify: open browser devtools, try
--        await supabase.from('orders').insert({ ... })
--      → should return RLS error. Reads should still work.
--   4. If something breaks in production, you can revert per-table
--      with `ALTER TABLE x DISABLE ROW LEVEL SECURITY` (it's an
--      online operation, no downtime).
--
-- =====================================================================

-- Helper: drop and recreate the standard policy set on a table.
-- We do it manually per table because each has slightly different
-- read-side needs, but the pattern is:
--   - "anon read"  : SELECT allowed
--   - no insert/update/delete policies for anon → denied by default
--   - service_role bypasses RLS automatically

-- ---------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants anon read" ON restaurants;
CREATE POLICY "restaurants anon read"
  ON restaurants FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------
-- staff — sensitive (PIN hashes live here)
-- ---------------------------------------------------------------------
-- The login flow needs to read staff to verify a submitted PIN. Even
-- though pin_hash is bcrypt and not the PIN itself, 4-digit PINs are
-- bruteforceable offline once you have the hash. Mitigation:
--   - login flow goes through /api/auth/session (server-side) which
--     uses service_role, so even if we revoked read from anon entirely
--     that flow would keep working.
--   - we revoke anon read here for that reason. The trade-off is that
--     /admin and /ajustes staff list pages also have to be reworked
--     to use service_role (they're server-rendered admin pages, easy
--     fix; tracked in the follow-up commit).
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff anon read" ON staff;
-- intentionally no SELECT policy for anon → anon can't read staff

-- ---------------------------------------------------------------------
-- tables, floor_plans — map data, needed by UI
-- ---------------------------------------------------------------------
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tables anon read" ON tables;
CREATE POLICY "tables anon read"
  ON tables FOR SELECT TO anon USING (true);

ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "floor_plans anon read" ON floor_plans;
CREATE POLICY "floor_plans anon read"
  ON floor_plans FOR SELECT TO anon USING (true);

-- ---------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservations anon read" ON reservations;
CREATE POLICY "reservations anon read"
  ON reservations FOR SELECT TO anon USING (true);

-- ---------------------------------------------------------------------
-- guests — has phone numbers, treat as sensitive
-- ---------------------------------------------------------------------
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
-- no anon read: guest list goes through server actions

-- ---------------------------------------------------------------------
-- orders, order_items
-- ---------------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders anon read" ON orders;
CREATE POLICY "orders anon read"
  ON orders FOR SELECT TO anon USING (true);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items anon read" ON order_items;
CREATE POLICY "order_items anon read"
  ON order_items FOR SELECT TO anon USING (true);
-- Realtime in the kitchen KDS subscribes to changes here, that's why
-- SELECT must remain open to anon.

-- ---------------------------------------------------------------------
-- tickets — fiscal records, no anon access at all
-- ---------------------------------------------------------------------
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
-- no policies → anon can't even read past tickets via devtools

-- ---------------------------------------------------------------------
-- print_jobs — daemon uses service_role anyway, lock anon out
-- ---------------------------------------------------------------------
-- Already had RLS enabled by scripts/002_print_jobs.sql but no policies.
-- Just making sure no policies exist for anon.
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- printers
-- ---------------------------------------------------------------------
-- 004_printers.sql had RLS disabled. Re-enable, with no anon policies.
ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- waitlist, menu_*, modifier_*, restaurant_config — readable by anon
-- ---------------------------------------------------------------------
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waitlist anon read" ON waitlist;
CREATE POLICY "waitlist anon read"
  ON waitlist FOR SELECT TO anon USING (true);

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_categories anon read" ON menu_categories;
CREATE POLICY "menu_categories anon read"
  ON menu_categories FOR SELECT TO anon USING (true);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_items anon read" ON menu_items;
CREATE POLICY "menu_items anon read"
  ON menu_items FOR SELECT TO anon USING (true);

-- modifier_groups + modifier_assignments may not exist in all
-- deployments; guard with DO blocks.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'modifier_groups') THEN
    EXECUTE 'ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "modifier_groups anon read" ON modifier_groups';
    EXECUTE 'CREATE POLICY "modifier_groups anon read" ON modifier_groups FOR SELECT TO anon USING (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'modifier_assignments') THEN
    EXECUTE 'ALTER TABLE modifier_assignments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "modifier_assignments anon read" ON modifier_assignments';
    EXECUTE 'CREATE POLICY "modifier_assignments anon read" ON modifier_assignments FOR SELECT TO anon USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'restaurant_config') THEN
    EXECUTE 'ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "restaurant_config anon read" ON restaurant_config';
    EXECUTE 'CREATE POLICY "restaurant_config anon read" ON restaurant_config FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Done. After running this:
--   - anon can SELECT from public tables (UI/Realtime keeps working)
--   - anon CANNOT INSERT/UPDATE/DELETE anything (no policies for it)
--   - anon CANNOT see staff PINs, guest phones, tickets, printers
--   - service_role bypasses everything (server actions / daemon unaffected)
-- ---------------------------------------------------------------------
