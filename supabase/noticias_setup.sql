-- ============================================================
--  NEWS TABLE SETUP
-- ============================================================

CREATE TABLE IF NOT EXISTS noticias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ, -- NULL means no expiration
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indices for quick lookup of active news
CREATE INDEX IF NOT EXISTS idx_noticias_expires ON noticias(expires_at);

-- Row Level Security
ALTER TABLE noticias ENABLE ROW LEVEL SECURITY;

-- 1. Anyone can read any (active) news
CREATE POLICY "Anyone can read news" ON noticias
  FOR SELECT
  USING (expires_at IS NULL OR expires_at > NOW());

-- 2. Only admins can insert/update/delete news
CREATE POLICY "Admins can manage news" ON noticias
  FOR ALL
  USING ((SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin');
