-- Create restaurant_config table for ticket/receipt settings
CREATE TABLE IF NOT EXISTS restaurant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  titular TEXT NOT NULL DEFAULT '',
  nif TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  codigo_postal TEXT NOT NULL DEFAULT '',
  ciudad TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  pie_ticket TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id)
);
