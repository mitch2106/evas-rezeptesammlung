-- Evas Rezeptesammlung: Supabase Tabellen-Setup

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  portions INTEGER,
  tags JSONB DEFAULT '[]'::jsonb,
  source_url TEXT DEFAULT '',
  ingredients TEXT DEFAULT '',
  preparation TEXT DEFAULT '',
  image TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_favorite BOOLEAN DEFAULT FALSE,
  last_viewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_title TEXT DEFAULT '',
  text TEXT NOT NULL,
  category TEXT DEFAULT 'Sonstiges',
  checked BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE planner_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: Öffentlicher Zugriff für anon key
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_access" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_access" ON recipes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_access" ON shopping_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_access" ON planner_entries FOR ALL TO anon USING (true) WITH CHECK (true);
