-- =====================================================================
-- POS Print Queue System
-- =====================================================================
-- This migration creates the print_jobs queue that the print daemon
-- consumes via Supabase Realtime.
--
-- Flow:
--   1. App writes a row to print_jobs (status='pending')
--   2. Daemon receives realtime INSERT event
--   3. Daemon claims job (status='printing'), prints via ESC/POS,
--      then marks 'done' or 'error' (with retry on error).
-- =====================================================================

-- Add closed_at to orders (used by code but missing from schema)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Print jobs queue
CREATE TABLE IF NOT EXISTS print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- What kind of ticket and where it goes
  -- kind:        what to render
  -- printer_type: which physical printer should print it
  kind TEXT NOT NULL CHECK (kind IN ('comanda_cocina', 'comanda_barra', 'anulacion', 'factura', 'test')),
  printer_type TEXT NOT NULL CHECK (printer_type IN ('cocina', 'barra', 'caja')),

  -- Optional explicit printer (if null, daemon picks first online printer of printer_type)
  printer_id UUID REFERENCES printers(id) ON DELETE SET NULL,

  -- Render payload (structured data, not pre-rendered ESC/POS)
  -- Daemon decides how to format it.
  payload JSONB NOT NULL,

  -- State machine
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'done', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,

  -- Optional links for traceability
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for daemon polling and dashboards
CREATE INDEX IF NOT EXISTS idx_print_jobs_pending
  ON print_jobs (restaurant_id, created_at)
  WHERE status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS idx_print_jobs_status
  ON print_jobs (status, created_at DESC);

-- Enable Realtime for this table (so daemon can subscribe)
-- Run this manually in Supabase Dashboard if not picked up:
--   Database → Replication → enable for print_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE print_jobs;

-- =====================================================================
-- Helper RPC: atomic claim
-- =====================================================================
-- The daemon calls this to atomically grab the next pending job.
-- Prevents two daemon instances from printing the same ticket twice.
-- =====================================================================
CREATE OR REPLACE FUNCTION claim_next_print_job(p_restaurant_id UUID)
RETURNS print_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  v_job print_jobs;
BEGIN
  UPDATE print_jobs
  SET status = 'printing',
      attempts = attempts + 1,
      claimed_at = NOW()
  WHERE id = (
    SELECT id FROM print_jobs
    WHERE restaurant_id = p_restaurant_id
      AND status IN ('pending', 'error')
      AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;
