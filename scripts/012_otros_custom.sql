-- =====================================================================
-- F1: Limpiar items de la categoría OTROS
-- =====================================================================
--
-- La categoría OTROS pasa de tener items fijos (OTROS, ACEITUNAS DE
-- SICILIA) a ser SOLO un espacio donde el camarero introduce items
-- custom on-the-fly (nombre + precio + notas + destino cocina/barra).
--
-- Esto se hace en UI (app/comandas/tomar/[tableId]/page.tsx): al
-- pulsar la categoría OTROS, en vez de mostrar items se muestran dos
-- botones grandes "Otros a cocina" y "Otros a barra" que abren modal.
--
-- ACEITUNAS DE SICILIA si la quieres mantener, se debería crear como
-- item normal en otra categoría (MEDIAS o similar). Aquí se elimina
-- porque su única razón de estar en OTROS era hacer sitio al concepto
-- de "comodín". Si se necesita, se reañade desde /ajustes/menu.
-- =====================================================================

DELETE FROM menu_items
WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
  AND category_id IN (
    SELECT id FROM menu_categories
    WHERE restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
      AND name = 'OTROS'
  )
  AND name IN ('OTROS', 'ACEITUNAS DE SICILIA');

-- Verificación: la categoría OTROS debe quedar con 0 items.
SELECT mc.name AS categoria, COUNT(mi.id) AS num_items
FROM menu_categories mc
LEFT JOIN menu_items mi ON mi.category_id = mc.id
WHERE mc.restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
  AND mc.name = 'OTROS'
GROUP BY mc.name;
