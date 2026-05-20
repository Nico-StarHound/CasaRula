-- =====================================================================
-- Reclamación de item concreto (Entrega 2)
-- =====================================================================
--
-- Entrega 1 reclamaba mesa entera (orders.reclamada_at). Esta entrega
-- añade reclamación granular: el camarero toca un plato concreto en
-- /comandas/tomar y avisa a cocina sin reclamar la mesa entera.
--
-- Comportamiento:
--   - Solo se puede reclamar items con status in_kitchen o ready
--     (validado en server action, no aquí).
--   - Suena la misma alarma que Entrega 1 en KDS (3 pitidos
--     descendentes).
--   - La mesa donde está el item reclamado sube al top del KDS
--     (heredando la prioridad de "reclamada", aunque sea solo un
--     item el que lo causó).
--   - Badge "ATENCION" rojo en el item dentro de la card de KDS.
--   - Se limpia al markItemReady ese item concreto.
--
-- Modelo: timestamp en order_items. NULL = no reclamado. Cooldown
-- 30s server-side mirando este timestamp.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS reclamado_at TIMESTAMPTZ NULL;

-- Indice parcial: solo cubre items reclamados. La mayoria no lo estan.
CREATE INDEX IF NOT EXISTS order_items_reclamado_idx
  ON order_items (reclamado_at)
  WHERE reclamado_at IS NOT NULL;
