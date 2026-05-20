-- =====================================================================
-- RESET OPERATIVO PRE-APERTURA — Casa Rula
-- =====================================================================
--
-- Limpia toda la operación de pruebas para empezar mañana en cero.
-- Conserva la CONFIGURACIÓN del restaurante (mesas, staff, impresoras,
-- carta nueva, plano del local), borra solo DATOS OPERATIVOS de
-- pruebas (tickets, comandas, print_jobs) y elimina las categorías
-- viejas que ya no se usan (Mar, No Mar, Ensaladas, Postres).
--
-- Tras ejecutar:
--   - Próximo ticket S del mes empieza en correlativo 1 (porque
--     next_correlativo() hace MAX(correlativo)+1 y la tabla queda
--     vacía).
--   - Próximo ticket F idem. Próximo R idem.
--   - Ninguna mesa queda en estado 'seated' o con comanda abierta.
--   - El daemon no encuentra jobs pendientes.
--   - La carta solo tiene las 8 categorías nuevas + sus 178 items.
--
-- TRANSACCIÓN: todo dentro de BEGIN/COMMIT. Si cualquier paso falla,
-- nada se aplica. Postgres es estricto con las FKs así que el orden
-- importa — borramos primero las tablas "hijas" (que tienen FKs
-- apuntando a otras), luego las "padres".
--
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Borrar TODOS los print_jobs
-- =====================================================================
-- print_jobs tiene FKs hacia orders y tickets con ON DELETE SET NULL,
-- así que en teoría podríamos borrarlos en cualquier orden, pero
-- empezamos por aquí para que el daemon no procese basura mientras
-- hacemos el resto.
DELETE FROM print_jobs
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';


-- =====================================================================
-- 2. Borrar TODOS los tickets
-- =====================================================================
-- ticket_items (si existe la tabla) o columnas relacionadas deberían
-- caer con CASCADE. Cualquier rectificativa que apunte a otro ticket
-- también se borra. Resetea el correlativo automáticamente (lo lleva
-- MAX(correlativo) sobre esta tabla, así que al vaciarla el próximo
-- será 1).
DELETE FROM tickets
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';


-- =====================================================================
-- 3. Borrar order_items y orders
-- =====================================================================
-- order_items.order_id apunta a orders con CASCADE (o sin él según
-- versión del schema), pero por seguridad borramos hijos primero.
DELETE FROM order_items
WHERE order_id IN (
  SELECT id FROM orders
  WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
);

DELETE FROM orders
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';


-- =====================================================================
-- 4. Liberar todas las mesas a estado 'available'
-- =====================================================================
-- Tras borrar orders, las mesas pueden quedar marcadas como 'seated'.
-- Las dejamos limpias. Bloqueadas (blocked) y reservadas (reserved)
-- conservan su estado por si el usuario las puso a mano — si quieres
-- resetear esos también, cambia el WHERE.
UPDATE tables
SET status = 'available'
WHERE floor_plan_id IN (
  SELECT id FROM floor_plans
  WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
)
AND status = 'seated';


-- =====================================================================
-- 5. Borrar las 4 categorías viejas + sus items
-- =====================================================================
-- Mar, No Mar, Ensaladas, Postres (con sus 38 items totales). Borramos
-- primero los menu_items (hijos) y luego las menu_categories (padres).
-- A estas alturas no debería haber order_items apuntando a estos
-- menu_items porque ya borramos orders. Si quedara alguno por algún
-- bug, el ON DELETE SET NULL lo deja a NULL y el ticket histórico
-- conserva name/price snapshot.

DELETE FROM menu_items
WHERE category_id IN (
  SELECT id FROM menu_categories
  WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
    AND name IN ('Mar', 'No Mar', 'Ensaladas', 'Postres')
);

DELETE FROM menu_categories
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
  AND name IN ('Mar', 'No Mar', 'Ensaladas', 'Postres');


-- =====================================================================
-- 6. Reservas y waitlist
-- =====================================================================
-- Por si hay reservas de prueba creadas durante el desarrollo. Si
-- prefieres conservar reservas futuras reales, comenta estas dos
-- líneas. NO debería haber reservas reales todavía (Casa Rula aún no
-- ha abierto), así que las borramos.
DELETE FROM reservations
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';

DELETE FROM waitlist
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';


COMMIT;


-- =====================================================================
-- VERIFICACIÓN POST-RESET
-- =====================================================================
-- Tras COMMIT, los siguientes conteos deben ser 0 (o casi):
SELECT 'tickets' AS tabla, COUNT(*) AS rows FROM tickets WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'orders', COUNT(*) FROM orders WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9')
UNION ALL
SELECT 'print_jobs', COUNT(*) FROM print_jobs WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'reservations', COUNT(*) FROM reservations WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'menu_categories', COUNT(*) FROM menu_categories WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'menu_items', COUNT(*) FROM menu_items WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
UNION ALL
SELECT 'mesas_ocupadas', COUNT(*) FROM tables WHERE floor_plan_id IN (SELECT id FROM floor_plans WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9') AND status = 'seated'
ORDER BY tabla;
