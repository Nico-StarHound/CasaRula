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

-- Enable RLS
ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY;

-- RLS policy - allow all authenticated users to read/write their restaurant's config
CREATE POLICY "Allow all operations on restaurant_config" ON restaurant_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_config_restaurant_id 
  ON restaurant_config(restaurant_id);

-- Insert default config for existing restaurant if not exists
INSERT INTO restaurant_config (restaurant_id, titular, nif, direccion, codigo_postal, ciudad, provincia, telefono)
SELECT id, '', '', '', '', '', '', ''
FROM restaurants
WHERE NOT EXISTS (
  SELECT 1 FROM restaurant_config WHERE restaurant_config.restaurant_id = restaurants.id
);

-- Note: You need to create a 'logos' bucket in Supabase Storage with public access
-- Go to Supabase Dashboard > Storage > Create new bucket > Name: 'logos' > Public: true
