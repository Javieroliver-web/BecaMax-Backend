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
-- NOTA (2026-08-29): antes usaba la subconsulta directa
-- (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin'. Como esta
-- policy es FOR ALL (incluye SELECT), Postgres la evalúa también en cada
-- lectura pública de noticias, y esa subconsulta exige que el rol que
-- consulta (incluido `anon`) tenga GRANT sobre perfiles -- si no lo tiene
-- (ver grant_permissions.sql, que se lo quita a anon a propósito), la
-- lectura pública entera fallaba con "permission denied for table
-- perfiles" aunque la policy "Anyone can read news" fuera correcta.
-- public.is_admin() es SECURITY DEFINER (ver supabase/master_repair.sql)
-- y evita ese problema evaluando con privilegios propios, no los del rol
-- que llama.
DROP POLICY IF EXISTS "Admins can manage news" ON noticias;
CREATE POLICY "Admins can manage news" ON noticias
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Los grants de anon/authenticated/service_role se gestionan en
-- supabase/grant_permissions.sql (no repetir aquí para evitar que un
-- futuro re-run de este archivo vuelva a abrir permisos ya cerrados).
