-- =====================================================================
-- Modelo fiscal: simplificada / completa / rectificativa
-- =====================================================================
--
-- Tres tipos de documento fiscal, todos persistidos en `tickets`:
--   - S (simplificada) — el ticket "normal" del bar
--   - F (completa)     — con datos de cliente (NIF, razón social, dir)
--   - R (rectificativa) — anula otro ticket previo (S o F)
--
-- Numeración: serie + YYMM + correlativo 5 dígitos. Reset mensual por
-- serie y restaurante. Ejemplo: S2605 00007 = simplificada, mayo 2026,
-- número 7 del mes.
--
-- Las rectificativas siempre anulan al 100% el ticket que rectifican
-- (sabor "anulación total"). Para corregir un cobro mal hecho:
--   1. Emitir R contra el ticket original (queda con saldo 0)
--   2. Emitir nuevo ticket S/F con el importe correcto
--
-- Verifactu / R1: el modelo deja hueco para encadenamiento de hashes
-- (hash_anterior, hash_actual) que se rellenará cuando se conecte la
-- integración con la AEAT más adelante. Por ahora los campos quedan
-- NULL y nadie los valida — el modelo está preparado, no activado.
--
-- IMPORTANTE — orden de despliegue:
--   1. Aplicar este SQL en Supabase SQL Editor.
--   2. Hacer pull del código que usa los nuevos campos.
-- Si se invierte, el código que emite tickets fallaría hasta el SQL.
--
-- =====================================================================

-- Nuevas columnas en `tickets`. Todas IF NOT EXISTS para que el script
-- sea idempotente (se puede reaplicar sin romper nada).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS serie CHAR(1) NOT NULL DEFAULT 'S'
  CHECK (serie IN ('S', 'F', 'R'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS year SMALLINT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS month SMALLINT
  CHECK (month IS NULL OR month BETWEEN 1 AND 12);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS correlativo INT;

-- Datos cliente — usados solo para serie F (completa). NULL en S y R.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cliente_nif TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cliente_nombre TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cliente_direccion TEXT;

-- Rectificativa — usado solo en serie R. Apunta al ticket original.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rectifica_ticket_id UUID
  REFERENCES tickets(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS motivo_rectificativa TEXT;

-- Encadenamiento preparado para Verifactu. Por ahora NULL siempre.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hash_anterior TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hash_actual TEXT;

-- Backfill de tickets existentes: les damos serie='S' y un correlativo
-- coherente con su `created_at`. Sin esto, el siguiente ticket emitido
-- chocaría con un NULL del unique constraint.
UPDATE tickets
SET
  serie = COALESCE(serie, 'S'),
  year = COALESCE(year, EXTRACT(YEAR FROM created_at)::SMALLINT % 100),
  month = COALESCE(month, EXTRACT(MONTH FROM created_at)::SMALLINT),
  correlativo = COALESCE(correlativo, 0)
WHERE serie IS NULL OR year IS NULL OR month IS NULL OR correlativo IS NULL;

-- Re-asignamos correlativos a los tickets existentes en orden cronológico
-- por (restaurante, serie, año, mes). Sin esto todos quedarían a 0 y el
-- unique constraint fallaría. ROW_NUMBER en SQL puro.
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, serie, year, month
      ORDER BY created_at ASC
    ) AS rn
  FROM tickets
)
UPDATE tickets t SET correlativo = ordered.rn
FROM ordered
WHERE t.id = ordered.id;

-- Ahora podemos imponer NOT NULL en year/month/correlativo de forma
-- segura porque el backfill los rellenó.
ALTER TABLE tickets ALTER COLUMN year SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN month SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN correlativo SET NOT NULL;

-- Unicidad: dentro de un restaurante, serie, año y mes, el correlativo
-- es único. La función emit_ticket() de abajo se apoya en esto para
-- garantizar que no hay huecos ni duplicados aunque dos cajeros cobren
-- a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_serie_yyyymm_corr_unique
  ON tickets (restaurant_id, serie, year, month, correlativo);

-- Índice para búsqueda rápida de rectificativas: "¿este ticket está
-- rectificado?" se contesta con un EXISTS sobre este índice.
CREATE INDEX IF NOT EXISTS tickets_rectifica_idx
  ON tickets (rectifica_ticket_id)
  WHERE rectifica_ticket_id IS NOT NULL;

-- =====================================================================
-- Función emit_ticket(): obtiene el siguiente correlativo y lo reserva
-- de forma atómica usando un advisory lock por (restaurante, serie,
-- año, mes). Devuelve el correlativo libre para que el código de
-- aplicación inserte el ticket con ese número.
--
-- ¿Por qué advisory lock y no SELECT...FOR UPDATE?
--   FOR UPDATE bloquea filas existentes; emitir el primer ticket de
--   un mes nuevo no tiene filas que bloquear. Un advisory lock es
--   exactamente la herramienta para "lock by key": Postgres mantiene
--   un mapa de claves bloqueadas, dos transacciones con la misma
--   clave se serializan. Se libera al hacer COMMIT/ROLLBACK.
--
-- Uso desde el código:
--   const { data: next } = await supabase.rpc('next_correlativo', {
--     p_restaurant_id, p_serie, p_year, p_month
--   })
--   ... INSERT INTO tickets (..., correlativo: next.correlativo) ...
--
-- Hacemos la función no-transactional friendly: solo da el siguiente
-- número. El INSERT real es responsabilidad del caller, y el unique
-- constraint cubre el race condition residual: si dos llamadas
-- consiguen el mismo número por algún bug, el segundo INSERT falla
-- y el código reintenta.
-- =====================================================================

CREATE OR REPLACE FUNCTION next_correlativo(
  p_restaurant_id UUID,
  p_serie CHAR(1),
  p_year SMALLINT,
  p_month SMALLINT
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_key BIGINT;
  v_next INT;
BEGIN
  -- Construimos una clave de bloqueo determinística a partir del
  -- restaurante + serie + año + mes. hashtextextended es 64 bits.
  v_lock_key := ('x' || substr(
    md5(p_restaurant_id::text || p_serie || p_year::text || p_month::text),
    1, 16
  ))::bit(64)::bigint;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(correlativo), 0) + 1 INTO v_next
  FROM tickets
  WHERE restaurant_id = p_restaurant_id
    AND serie = p_serie
    AND year = p_year
    AND month = p_month;

  RETURN v_next;
END;
$$;

-- =====================================================================
-- Vista útil para depuración: ver el último número emitido por
-- (restaurante, serie, año, mes). Útil en SQL Editor cuando algo no
-- cuadra.
-- =====================================================================
CREATE OR REPLACE VIEW v_ticket_series_status AS
SELECT
  restaurant_id,
  serie,
  year,
  month,
  COUNT(*) AS total_emitidos,
  MAX(correlativo) AS ultimo_correlativo,
  MAX(created_at) AS ultimo_creado_at
FROM tickets
GROUP BY restaurant_id, serie, year, month
ORDER BY year DESC, month DESC, serie;
