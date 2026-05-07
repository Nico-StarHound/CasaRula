-- Allow 'cuenta_provisional' as a print_job kind (provisional bill given to
-- diners before charging — like the "la cuenta por favor" ticket).
--
-- Postgres requires dropping and recreating the CHECK constraint to add a
-- new allowed value.

ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_kind_check;

ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_kind_check
  CHECK (kind IN ('comanda_cocina', 'comanda_barra', 'anulacion', 'factura', 'cuenta_provisional', 'test'));
