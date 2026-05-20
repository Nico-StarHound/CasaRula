-- =====================================================================
-- Reclamación de mesa (Entrega 1)
-- =====================================================================
--
-- El camarero puede "reclamar" una mesa que lleva mucho esperando o
-- que tiene algún problema. La reclamación:
--   - Sube la mesa al top del KDS de cocina con ring rojo y pill
--     "ATENCIÓN".
--   - Imprime un ticket de aviso en la impresora de cocina.
--   - Hace sonar una alarma especial (tres pitidos descendentes) en
--     la tablet de cocina.
--
-- Se limpia de dos formas:
--   - Automáticamente cuando se marca ready cualquier item de esa
--     mesa (handled en server action markItemReady — no aquí en SQL).
--   - Manualmente desde el KDS con un botón "Visto" en la card.
--
-- Modelo: un solo timestamp en orders. NULL = no reclamada. Timestamp
-- = última vez que se reclamó. El frontend usa eso también para el
-- cooldown de 30s en el lado server.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reclamada_at TIMESTAMPTZ NULL;

-- Índice parcial: la mayoría de orders no están reclamadas, así que
-- el índice solo cubre las que sí. Útil para "dame todas las mesas
-- reclamadas ahora mismo" si en el futuro queremos una vista global.
CREATE INDEX IF NOT EXISTS orders_reclamada_idx
  ON orders (reclamada_at)
  WHERE reclamada_at IS NOT NULL;
