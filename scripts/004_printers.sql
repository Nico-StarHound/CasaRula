-- Printers configured by the restaurant.
-- Replaces the daemon's hardcoded .env entries (PRINTER_COCINA_IP, etc).
--
-- Each printer has:
--   - name: free-form label shown in UI ("Impresora cocina vieja", etc.)
--   - type: functional role — what kinds of tickets it receives
--           (only one ENABLED printer of each type at a time)
--   - ip / port: how the daemon reaches it (TCP, ESC/POS over 9100 usually)
--   - enabled: quick on/off without deleting; disabled printers are ignored
--
-- print_jobs already exists. We add a printer_id column so the app can
-- resolve which printer should serve each job at the moment of enqueueing
-- (snapshot at print time). The daemon just looks up the IP and sends.

CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cocina', 'barra', 'caja')),
  ip TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 9100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce: at most one ENABLED printer per type per restaurant.
-- Disabled ones can pile up freely.
CREATE UNIQUE INDEX IF NOT EXISTS printers_unique_enabled_type
  ON printers(restaurant_id, type) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS printers_restaurant_idx
  ON printers(restaurant_id);

-- print_jobs already has printer_type. Add an optional printer_id so each
-- job carries the exact printer it should go to (resolved at enqueue
-- time). The daemon will prefer printer_id; if absent, falls back to
-- looking up the active printer by type.
ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS printer_id UUID REFERENCES printers(id) ON DELETE SET NULL;

-- Keep RLS off, consistent with the rest of the schema (daemon and app
-- both use service_role / authenticated session).
ALTER TABLE printers DISABLE ROW LEVEL SECURITY;
