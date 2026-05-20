-- =====================================================================
-- Casa Rula: segunda tanda de carta para apertura
-- =====================================================================
--
-- 5 categorías nuevas + 82 items. Todos con printer_target='cocina'.
-- IVA 10% implícito.
--
-- Precios NULL = camarero introduce el precio a mano al añadir a la
-- comanda (mismo patrón que GIN ESPECIAL, CHUPITO 2 en script 010).
-- Aplica a items "consultar diaria" como VENTRESCA, RACIÓN DE QUESO,
-- CALDERETA.
--
-- Erratas corregidas respecto al Excel original (mismo criterio que 010):
--   TAR5A DE QUESO GAMONEU  → TARTA DE QUESO GAMONEU
--   MERLUZA A OA GALLEGA    → MERLUZA A LA GALLEGA
--   1/2VENTRESCA            → 1/2 VENTRESCA
--   BOQUERONES VINAGRE      → BOQUERONES EN VINAGRE
--    CROQUETA (unidad)      → CROQUETA (unidad)   (espacio inicial fuera)
--   Espacios sobrantes finales (AMBROSÍA, BOMBÓN, SALPICON) eliminados.
--
-- Borrados de la lista original:
--   MAS / OTROS COCINA   (redundante con categoría OTROS = comodín)
--   MAS / COMENTARIO     (redundante con campo notas por item)
--
-- Mantenidos como duplicados aceptados:
--   MAS / POTE ASTURIANO y MAS / POTE ASTURIANO CON CASTAÑAS (decisión usuario)
--
-- sort_order de las categorías: van DETRÁS de las existentes (que
-- llegan hasta 8 según script 010), así que arrancan en 9.
-- =====================================================================

DO $$
DECLARE
  v_restaurant_id UUID := 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';
  v_cat_id UUID;
BEGIN

-- =====================================================================
-- 1. CATEGORÍAS NUEVAS
-- =====================================================================

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'CARNES', 'cocina', 9
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'CARNES');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'POSTRES', 'cocina', 10
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'POSTRES');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'ENSALADAS', 'cocina', 11
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'ENSALADAS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'MAS', 'cocina', 12
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'MAS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'LA MAR', 'cocina', 13
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'LA MAR');


-- =====================================================================
-- 2. ITEMS — CARNES (11)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'CARNES';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('RAU VACUNO',                       25.00, 1),
  ('PITU CALEYA',                      25.00, 2),
  ('SECRETO IBERICO',                  25.00, 3),
  ('LONGANIZA ASTU.',                  17.00, 4),
  ('CALLOS',                           22.00, 5),
  ('CALLOS HUEVU FRITU',               22.00, 6),
  ('SOLOMILLO IBÉRICO DE CERDO',       18.00, 7),
  ('FOIE CON PATATAS Y HUEVOS',        25.00, 8),
  ('MANITAS DE CERDO',                 27.00, 9),
  ('MATACHANA',                        19.00, 10),
  ('CARRILLERAS',                      25.00, 11)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 3. ITEMS — POSTRES (19)
-- =====================================================================
-- RACIÓN DE QUESO y MEDIA RACION DE QUESO precio NULL (consultar diaria).
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'POSTRES';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('RACIÓN DE QUESO',                          NULL, 1),
  ('MEDIA RACION DE QUESO',                    NULL, 2),
  ('AMBROSÍA',                                 7.00, 3),
  ('LECHE MERENGADA',                          6.00, 4),
  ('BOMBÓN',                                   4.50, 5),
  ('LECHE FRITA',                              7.00, 6),
  ('JEMAA EL-FNA',                             7.00, 7),
  ('SORBETE LIMON',                            5.50, 8),
  ('HELADO DE VAINILLA',                       5.50, 9),
  ('COULANT',                                  7.00, 10),
  ('HELADO DE ARROZ CON LECHE',                5.00, 11),
  ('HELADO DE QUESO CABRA',                    7.00, 12),
  ('TOCINILLO DE CIELO C/CREMA AGRIA',         6.00, 13),
  ('TARTA DE MANZANA C/ HELADO DE VAINILLA',   7.00, 14),
  ('TARTA DE QUESO GAMONEU',                   6.50, 15),
  ('TORRIJA',                                  7.00, 16),
  ('ARROZ CON LECHE',                          6.50, 17),
  ('FLAN DE TURRON',                           6.50, 18),
  ('FLAN',                                     6.00, 19)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 4. ITEMS — ENSALADAS (5)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'ENSALADAS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('ENS. VENTRESCA',     19.00, 1),
  ('TOMATE AZUL',        16.00, 2),
  ('TOMATE CON BURRATA', 18.00, 3),
  ('SALPICON',           22.00, 4),
  ('ENSALADA TEMPLADA',  17.00, 5)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 5. ITEMS — MAS (23)
-- =====================================================================
-- OTROS COCINA y COMENTARIO eliminados (redundantes).
-- POTE ASTURIANO y POTE ASTURIANO CON CASTAÑAS ambos mantenidos.
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'MAS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('CROQUETAS CALAMARES',         16.00, 1),
  ('CROQUETAS',                   16.00, 2),
  ('CROQUETA (unidad)',            2.00, 3),
  ('SOPA DE PESCADO',              8.00, 4),
  ('RACIÓN PATATAS FRITAS',        5.00, 5),
  ('CROQUETAS DE CECINA DE WAGYU',16.00, 6),
  ('CROQUETAS DE JAMON',          15.00, 7),
  ('QUESO AL HORNO',              19.00, 8),
  ('SOPA DE AJO',                  7.00, 9),
  ('FLOR DE ALCACHOFA',           19.00, 10),
  ('TORREZNOS',                   15.00, 11),
  ('PAN SIN GLUTEN',               2.50, 12),
  ('PAN MASA MADRE',               2.20, 13),
  ('ALCACHOFAS',                   4.50, 14),
  ('HUEVO',                        2.00, 15),
  ('MI-CUIT DE PATO',             19.00, 16),
  ('PAN',                          1.20, 17),
  ('FABES VERDINES',              18.00, 18),
  ('POTE ASTURIANO CON CASTAÑAS', 17.00, 19),
  ('FABADA ASTURIANA',            15.00, 20),
  ('POTE ASTURIANO',              17.00, 21),
  ('PIMIENTOS DEL PADRON',        14.00, 22),
  ('BOROÑA',                      12.00, 23),
  ('GILDAS',                       2.10, 24),
  ('EMBERZAO/PANTRUCU',           12.00, 25)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 6. ITEMS — LA MAR (24)
-- =====================================================================
-- VENTRESCA, 1/2 VENTRESCA, CALDERETA precio NULL (mercado/diaria).
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'LA MAR';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('BOCARTINOS',                       17.00, 1),
  ('MUERGOS PLANCHA',                  22.00, 2),
  ('PULPU',                            28.00, 3),
  ('ROLLU DE BONITO',                  22.00, 4),
  ('PARROCHINA',                       15.00, 5),
  ('FOIE BACALAO',                     16.00, 6),
  ('VENTRESCA',                        NULL,  7),
  ('ARROZ',                            23.00, 8),
  ('ALBONDIGAS DE MERLUZA',            19.00, 9),
  ('LATA MEJILLONES',                  17.00, 10),
  ('ÑOCLA',                            29.00, 11),
  ('CALAMAR FRESCO',                   23.00, 12),
  ('SARDINAS MARINADAS',               16.00, 13),
  ('MEJILLONES FRANCESES',             16.00, 14),
  ('1/2 VENTRESCA',                    NULL,  15),
  ('MIRLOTOS',                         15.00, 16),
  ('CHIPIRONES PLANCHA',               27.00, 17),
  ('SALMONETES',                       22.00, 18),
  ('CALDERETA',                        NULL,  19),
  ('SARDINAS DE LASTRES',              15.00, 20),
  ('RAYA GUISADA',                     18.00, 21),
  ('REVUELTO DE NAVAJAS CONFITADAS',   23.00, 22),
  ('MERLUZA A LA GALLEGA',             23.00, 23),
  ('BERBERECHOS GIGANTES',             23.00, 24),
  ('BOQUERONES EN VINAGRE',            19.00, 25)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


END $$;

-- =====================================================================
-- Verificación
-- =====================================================================
SELECT mc.name AS categoria, COUNT(mi.id) AS num_items
FROM menu_categories mc
LEFT JOIN menu_items mi ON mi.category_id = mc.id
WHERE mc.restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
GROUP BY mc.name, mc.sort_order
ORDER BY mc.sort_order;
