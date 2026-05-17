-- =====================================================================
-- KDS: cola de preparación activa por tap
-- =====================================================================
--
-- Contexto: hoy el KDS de cocina tiene una "cola de preparación" en la
-- derecha que muestra TODOS los items pendientes ordenados. Eso no es
-- una cola real — es una vista ordenada de todo lo que está en cocina.
--
-- El comportamiento que queremos:
--   - El cocinero TOCA un item de la izquierda para añadirlo a la cola.
--   - El item NO desaparece de la izquierda; se resalta (azul claro)
--     y aparece a la derecha.
--   - Drag-and-drop para reordenar dentro de la cola.
--   - Marcar listo desde cualquier lado (cola o izquierda) sincroniza.
--
-- Para distinguir "item en cocina pero todavía no activado" de "item
-- activado en la cola", añadimos dos columnas a order_items.
--
-- in_prep_queue_at TIMESTAMPTZ NULL
--   NULL = todavía no añadido a la cola por el cocinero.
--   not NULL = activado en la cola; el valor es el momento del tap
--   (útil para depurar / ver cuándo arrancó la preparación).
--
-- prep_queue_position DOUBLE PRECISION NULL
--   Posición dentro de la cola, sólo válida cuando in_prep_queue_at
--   no es NULL. Usamos DOUBLE PRECISION (en lugar de INT) para poder
--   insertar entre dos posiciones sin renumerar todo el resto: si
--   hay items en 1, 2, 3 y queremos meter uno entre el 1 y el 2,
--   le damos posición 1.5. Patrón "fractional indexing" estándar.
--   Cuando el float empieza a perder precisión (raro, miles de
--   reordenamientos sin reset), el server reindexa a enteros.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Se puede reaplicar sin daño.
-- =====================================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS in_prep_queue_at TIMESTAMPTZ NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS prep_queue_position DOUBLE PRECISION NULL;

-- Índice para listar la cola rápido. Filtramos por NOT NULL y
-- ordenamos por position; el WHERE en el índice lo mantiene pequeño.
CREATE INDEX IF NOT EXISTS order_items_prep_queue_idx
  ON order_items (prep_queue_position)
  WHERE in_prep_queue_at IS NOT NULL;
