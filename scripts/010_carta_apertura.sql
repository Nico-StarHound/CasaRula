-- =====================================================================
-- Casa Rula: inserción de carta inicial para apertura
-- =====================================================================
--
-- 9 categorías + 178 items. Todo IVA 10% (hostelería, va implícito en
-- el precio — la tabla no tiene campo IVA).
--
-- Reglas de printer_target:
--   - MEDIAS, OTROS  → cocina (comida)
--   - Resto (vinos, alcohol, blancos, tintos, cafés, agua) → barra
--
-- Precios vacíos en el Excel se meten como NULL — el camarero los
-- introduce a mano al añadir el item a la comanda.
--
-- Idempotente: cada INSERT comprueba que NO existe ya por name. Si
-- corres el script dos veces, no duplica.
-- =====================================================================

DO $$
DECLARE
  v_restaurant_id UUID := 'bf17533a-fc4e-43c9-a81f-50b364cca9a9';
  v_cat_id UUID;
BEGIN

-- =====================================================================
-- 1. CATEGORÍAS
-- =====================================================================

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'MEDIAS', 'cocina', 1
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'MEDIAS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'OTROS', 'cocina', 2
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'OTROS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'BLANCOS', 'barra', 3
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'BLANCOS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'TINTOS', 'barra', 4
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'TINTOS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'OTROS VINOS', 'barra', 5
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'OTROS VINOS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'ALCOHOL', 'barra', 6
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'ALCOHOL');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'AGUA Y REFRESCOS', 'barra', 7
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'AGUA Y REFRESCOS');

INSERT INTO menu_categories (restaurant_id, name, printer_target, sort_order)
SELECT v_restaurant_id, 'CAFES E INF', 'barra', 8
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE restaurant_id = v_restaurant_id AND name = 'CAFES E INF');


-- =====================================================================
-- 2. ITEMS — MEDIAS (cocina)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'MEDIAS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('1/2 ROLLO BONITO',       12.00, 1),
  ('1/2 CROQUETAS',           9.00, 2),
  ('1/2 PARROCHINAS',         9.00, 3),
  ('1/2 BOCARTINOS',          9.00, 4),
  ('1/2 CALLOS',              8.00, 5),
  ('1/2 NAVAJAS PLANCHA',    12.00, 6),
  ('1/2 PITU CALEYA',        14.00, 7),
  ('1/2 CALAMARES',          10.00, 8),
  ('1/2 ALBONDIGAS',         11.00, 9),
  ('1/2 SARDINAS MARINADAS',  9.00, 10),
  ('1/2 TOMATE',              7.00, 11),
  ('1/2 SALPICON',           10.00, 12)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 3. ITEMS — OTROS (cocina, comodín)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'OTROS';

-- 'OTROS' es comodín con precio 0 (camarero mete el precio a mano).
INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('OTROS',                  0.00, 1),
  ('ACEITUNAS DE SICILIA',   3.50, 2)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 4. ITEMS — BLANCOS (barra)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'BLANCOS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('COSTUMBRES',                       29.00, 1),
  ('OS TABAQUEROS',                    38.00, 2),
  ('KOMOKABRAS',                       25.00, 3),
  ('GABA DO XIL',                      26.00, 4),
  ('ABEL MENDOZA',                     29.00, 5),
  ('SHANS ELUS',                       36.00, 6),
  ('ALIAXE',                           43.00, 7),
  ('TEIRA X',                          33.00, 8),
  ('SANGARIDA LA TAREA',               33.00, 9),
  ('ACESTEIRA',                        32.00, 10),
  ('AS SORTES',                        68.00, 11),
  ('LOURO DO BOLO',                    25.00, 12),
  ('NAS DUNAS',                        77.00, 13),
  ('CANTAYANO',                        24.00, 14),
  ('CERRO LA ISA',                     51.00, 15),
  ('QUINTA DA MURADELLA ALANDA',       25.00, 16),
  ('CHIVIRITERO',                      27.00, 17),
  ('ENATE 234 MAGNUM',                 36.00, 18),
  ('BOTANI',                           23.00, 19),
  ('CIES BLANCO',                      25.00, 20),
  ('CAMPEADOR',                        25.00, 21),
  ('GRAN ENEMIGO (TORRONTES)',         78.00, 22),
  ('JAG GODELLO VV',                   28.00, 23),
  ('VALDEMARTIN',                      25.00, 24),
  ('BARCO EL CORNETA 22',              31.00, 25),
  ('LEIRANA F. GENOVEVA 22',           43.00, 26),
  ('ZARATE EL PALOMAR 23',             44.00, 27),
  ('MURRIETA CAPELLANIA 19',           86.00, 28),
  ('VERONICA O LA LLORONA 23',         34.00, 29),
  ('ALBAMAR',                          26.00, 30),
  ('FORMIGO',                          22.00, 31)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 5. ITEMS — TINTOS (barra)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'TINTOS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('LA MISION',                            27.00, 1),
  ('AD LIBITUM',                           25.00, 2),
  ('COSECHERO',                            13.00, 3),
  ('CIES TINTO',                           25.00, 4),
  ('AZOS DA VILA',                         28.00, 5),
  ('CORTEZADA',                            28.00, 6),
  ('LOMBA DOS ARES',                       28.00, 7),
  ('SUPERNOVA',                            21.00, 8),
  ('PRADIO',                               21.00, 9),
  ('EL PROHIBIDO',                         25.00, 10),
  ('LA NIETA',                             98.00, 11),
  ('SAN VICENTE',                          45.00, 12),
  ('S. CANTABRIA COLECCION',               36.00, 13),
  ('EL BOSQUE',                            98.00, 14),
  ('A. MENDOZA',                           52.00, 15),
  ('EL PUNTIDO',                           45.00, 16),
  ('TESO LA MONJA',                      1400.00, 17),
  ('L. CAÑAS MG12',                        31.00, 18),
  ('ULTREIA',                              25.00, 19),
  ('PEIXE DA ESTRADA',                     19.00, 20),
  ('ALTUN',                                26.00, 21),
  ('HACIENDA GRIMON',                      16.00, 22),
  ('LAGARIZA',                             23.00, 23),
  ('LA MONTESA 17',                        18.00, 24),
  ('CRZ SANTA 18',                         32.00, 25),
  ('CASTRO DAS SAIÑAS 18',                 20.00, 26),
  ('ALBAHRA',                              24.00, 27),
  ('MISSION GRAPES 15',                    29.00, 28),
  ('DOS CANOTOS 18',                       33.00, 29),
  ('BRANCELLADO DOS CANOTOS 16',           29.00, 30),
  ('MERAYO',                               15.00, 31),
  ('DOMINIO DEL BENDITO (P.P)',            26.00, 32),
  ('PAGO EL ESPINO',                       25.00, 33),
  ('CASTRO E CADELA',                      19.00, 34),
  ('SHANS EL US',                          39.00, 35),
  ('UVAS NOMADAS',                         20.00, 36),
  ('TRITON',                               18.00, 37),
  ('EL PRIMER BESO',                       24.00, 38),
  ('ENATE MAGNUM',                         32.00, 39),
  ('GABA DO XIL MENCIA',                   21.00, 40),
  ('UNACEPA',                              34.00, 41),
  ('NUDE',                                 20.00, 42),
  ('KARMAN',                               16.00, 43),
  ('PARAJES DEL CABRIEL',                  17.00, 44),
  ('R14',                                  17.00, 45),
  ('VINO DE MONTAÑA',                      16.00, 46),
  ('PRIMUS CARMENERE',                     24.00, 47),
  ('LA PLANTA',                            21.00, 48),
  ('CLOS DELAROILET',                      20.00, 49),
  ('FINCA LA GARRIGA',                     29.00, 50),
  ('FINCA LA ESPOLLA',                     29.00, 51),
  ('GRAN ABADENGO',                        26.00, 52),
  ('PEDRO BALDA MAJUELO DE LA NAVA',       49.00, 53),
  ('QUINTA DA MURADELLA BASTARDO',         57.00, 54),
  ('DINAMICA',                             22.00, 55),
  ('LA ESCRIBANA',                         28.00, 56),
  ('GALLINAS Y FOCAS',                     29.00, 57),
  ('LANZADA',                              29.00, 58),
  ('PONCE P.F.',                           25.00, 59),
  ('ALTO HUESERA (G. BERZAL)',             41.00, 60),
  ('SAN JULIAN (G. BERZAL)',               36.00, 61),
  ('LOUSAS',                               31.00, 62),
  ('MIGAN',                                39.00, 63),
  ('BADEN',                                19.00, 64),
  ('TONI JOST',                            27.00, 65),
  ('MAYELA',                               24.00, 66),
  ('COSTUMBRES TINTO',                     27.00, 67),
  ('OLLOS 23',                             26.00, 68),
  ('PARAJES',                              23.00, 69),
  ('TREMOR',                               24.00, 70),
  ('PRIMER BESO',                          25.00, 71),
  ('LINDES DE REMELLURI',                  27.00, 72)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 6. ITEMS — OTROS VINOS (barra)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'OTROS VINOS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('POL ROGER',                       55.00, 1),
  ('TORO ALBALA',                     32.00, 2),
  ('JANE VENTURA',                    27.00, 3),
  ('PICARO DEL AGUILA',               28.00, 4),
  ('MR',                              31.00, 5),
  ('BIZI-GOXO (SIDRA DE HIELO)',      38.00, 6),
  ('VICTORIA N2',                     28.00, 7),
  ('JULIEN POIRE',                    29.00, 8),
  ('GURDOS',                          21.00, 9),
  ('3B ROSE',                         29.00, 10),
  ('3B BLANC DE BLANCS',              29.00, 11),
  ('JAGATAS (ROSADO)',                22.00, 12),
  ('AMAURY BEAUFORT LE JARDINOT',    108.00, 13)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 7. ITEMS — ALCOHOL (barra)
-- =====================================================================
-- Precios NULL para GIN. ESPECIAL y CHUPITO 2 — camarero los mete a mano.
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'ALCOHOL';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('CAÑON 1906',                       5.00, 1),
  ('IZAGUIRRE R.',                     3.30, 2),
  ('MARTINI',                          2.70, 3),
  ('COPA CHARDONNAY',                  3.00, 4),
  ('CAÑA 1906',                        3.50, 5),
  ('COMBINADO 1',                      8.00, 6),
  ('GIN. ESPECIAL',                    NULL, 7),
  ('CHUPITO',                          3.00, 8),
  ('CHUPITO 2',                        NULL, 9),
  ('1/2 VERMOUTH',                     2.50, 10),
  ('TINTO DE VERANO',                  4.00, 11),
  ('TINTO CASA',                      15.00, 12),
  ('COPA TINTO',                       3.00, 13),
  ('CORTO CERVEZA',                    2.30, 14),
  ('CALIMOCHO',                        4.50, 15),
  ('SIDRA DE HIELO',                   5.00, 16),
  ('TANQUERAY TEN CUBATA',            10.00, 17),
  ('TANQUERAY TEN COPA',               7.00, 18),
  ('BLOOM COPA',                       7.00, 19),
  ('BLOOM CUBATA',                     9.00, 20),
  ('BOTANIST COPA',                    4.00, 21),
  ('BOTANIST CUBATA',                  6.00, 22),
  ('MARTIN MILLERS COPA',              8.00, 23),
  ('MARTIN MILLERS CUBATA',           10.00, 24),
  ('TOWER BRIDGE CUBATA',              9.00, 25),
  ('TOWER BRIDGE COPA',                8.00, 26),
  ('ROKU COPA',                        4.00, 27),
  ('ROKU CUBATA',                      6.00, 28),
  ('BOURBON FOUR ROSES (COPA)',        5.50, 29),
  ('BOURBON FOUR ROSES (CUBATA)',      8.00, 30),
  ('WOODFORD RESERVE (COPA)',          5.50, 31),
  ('WOODFORD RESERVE (CUBATA)',        8.00, 32),
  ('LAGAVULIN 8 AÑOS (COPA)',          8.00, 33),
  ('LAGAVULIN 8 AÑOS (CUBATA)',       11.00, 34),
  ('DALWHINNIE 15 AÑOS (COPA)',        7.50, 35),
  ('DALWHINNIE 15 AÑOS (CUBATA)',      9.50, 36),
  ('CLAN CAMPBELL (COPA)',             3.50, 37),
  ('CLAN CAMPBELL (CUBATA)',           6.00, 38),
  ('GLENROTHES (COPA)',                8.00, 39),
  ('GLENROTHES (CUBATA)',             12.00, 40),
  ('OPTHIMUS 21 AÑOS (COPA)',          8.00, 41),
  ('OPTHIMUS (CUBATA)',               11.00, 42),
  ('ZACAPA (COPA)',                    8.00, 43),
  ('ZACAPA (CUBATA)',                 11.00, 44),
  ('SANTISIMA TRINIDAD 15 AÑOS (COPA)', 6.00, 45),
  ('SANTISIMA TRINIDAD (CUBATA)',      9.00, 46),
  ('SANTA TERESA 1796 (COPA)',         7.00, 47),
  ('SANTA TERESA 1796 (CUBATA)',      10.00, 48),
  ('DOS MADERAS 5+5 (COPA)',           7.00, 49),
  ('DOS MADERAS 5+5 (CUBATA)',        10.00, 50),
  ('LAPHROAIG 10 AÑOS (COPA)',         7.00, 51),
  ('LAPHROAIG 10 AÑOS (CUBATA)',      10.00, 52),
  ('KAVALAN (COPA)',                   9.00, 53),
  ('KAVALAN (CUBATA)',                12.00, 54),
  ('COPA OLIVIA',                      5.00, 55),
  ('JARRA 1906',                      12.00, 56),
  ('CAMPARI CASK TALES',               9.00, 57),
  ('PUNT E MES',                       4.50, 58),
  ('R. LA QUINTINYE',                  4.50, 59),
  ('LUSTAU',                           4.50, 60),
  ('CARPANO',                          4.00, 61),
  ('CARPANO FORMULA ANTICA',           9.00, 62),
  ('ESTRELLA GALICIA',                 3.00, 63)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 8. ITEMS — CAFES E INF (barra)
-- =====================================================================
-- CAFE ESPECIAL precio 0 (en Excel viene 0, no NULL) → camarero ajusta.
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'CAFES E INF';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('CAFE ESPECIAL',     0.00, 1),
  ('INFUSION',          1.60, 2),
  ('CAFE ARABICA 100%', 1.70, 3),
  ('CAFE CON HIELO',    1.90, 4),
  ('CARAJILLO QUEMADO', 2.50, 5),
  ('CARAJILLO',         2.20, 6)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


-- =====================================================================
-- 9. ITEMS — AGUA Y REFRESCOS (barra)
-- =====================================================================
SELECT id INTO v_cat_id FROM menu_categories
  WHERE restaurant_id = v_restaurant_id AND name = 'AGUA Y REFRESCOS';

INSERT INTO menu_items (restaurant_id, category_id, name, price, available, is_available, sort_order)
SELECT v_restaurant_id, v_cat_id, n, p, true, true, ord FROM (VALUES
  ('AGUA PEQ.',             1.50, 1),
  ('CASERA',                2.70, 2),
  ('ZUMO MELOCOTON',        3.00, 3),
  ('AQUARIUS NARANJA',      3.00, 4),
  ('NESTEA',                3.00, 5),
  ('SERVICIO DE AGUA VIVA', 1.90, 6),
  ('MULTIFRUTAS FUENSANTA', 3.00, 7),
  ('COCA COLA',             3.00, 8),
  ('COCA COLA ZERO',        3.00, 9),
  ('MOSTO BLANCO',          3.00, 10),
  ('AQUARIUS LIMON',        3.00, 11),
  ('SEVEN UP',              3.00, 12),
  ('KAS NARANJA',           3.00, 13),
  ('KAS LIMON',             3.00, 14),
  ('TONICA SCHWEPPES',      3.00, 15),
  ('AGUA CON GAS',          3.00, 16)
) AS t(n, p, ord)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = v_restaurant_id AND name = t.n);


END $$;

-- =====================================================================
-- Verificación: contar lo insertado
-- =====================================================================
SELECT name AS categoria, COUNT(*) AS num_items
FROM menu_categories mc
LEFT JOIN menu_items mi ON mi.category_id = mc.id
WHERE mc.restaurant_id = 'bf17533a-fc4e-43c9-a81f-50b364cca9a9'
GROUP BY mc.name, mc.sort_order
ORDER BY mc.sort_order;
