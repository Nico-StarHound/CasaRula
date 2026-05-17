-- =====================================================================
-- Columna "En barra" / pase: items listos pendientes de recoger
-- =====================================================================
--
-- Contexto: cuando un cocinero marca un item como 'ready', el item
-- deja de aparecer en el KDS y queda esperando a que un camarero lo
-- recoja del pase para llevarlo a la mesa.
--
-- Hasta ahora no había una vista de "qué hay listo en barra". El
-- camarero tenía que mirar mesa por mesa o asomarse a cocina. La
-- columna lateral "En barra" muestra ese estado global.
--
-- Ciclo de vida ampliado de order_items.status (sin cambios):
--   pending     → escrito en comanda, sin enviar
--   in_kitchen  → enviado a cocina (visible en KDS)
--   ready       → marcado listo en KDS (visible en columna "En barra")
--   served      → recogido por el camarero (ya no visible aquí)
--   cancelled   → anulado
--
-- Antes ya teníamos 'served' como estado, pero no había forma de pasar
-- de 'ready' a 'served' desde la UI. Esta migración añade el timestamp
-- picked_from_pass_at que se setea cuando el camarero toca un item en
-- la columna lateral. Mantenemos también el status para compatibilidad
-- con flujos existentes (la columna "En barra" filtra por
-- status='ready' AND picked_from_pass_at IS NULL).
--
-- Idempotente. Re-ejecutable sin daño.
-- =====================================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS picked_from_pass_at TIMESTAMPTZ NULL;

-- Índice para la query "qué hay listo en barra ahora mismo".
-- Filtramos por status='ready' y picked_from_pass_at NULL.
CREATE INDEX IF NOT EXISTS order_items_pass_idx
  ON order_items (ready_at DESC)
  WHERE status = 'ready' AND picked_from_pass_at IS NULL;
