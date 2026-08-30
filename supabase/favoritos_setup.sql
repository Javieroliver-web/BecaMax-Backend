-- ============================================================
--  SUPABASE SQL: Tabla favoritos
--  Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS public.favoritos (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beca_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Evitar duplicados: un usuario solo puede tener una vez cada beca
  CONSTRAINT favoritos_unique UNIQUE (user_id, beca_id)
);

-- 2. Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_favoritos_user_id ON public.favoritos(user_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_beca_id ON public.favoritos(beca_id);

-- 3. Habilitar Row Level Security
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;

-- 4. Política: cada usuario solo ve/modifica SUS favoritos
CREATE POLICY "favoritos_select_own" ON public.favoritos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "favoritos_insert_own" ON public.favoritos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favoritos_delete_own" ON public.favoritos
  FOR DELETE USING (auth.uid() = user_id);

-- Sin esta politica, upsert() (INSERT ... ON CONFLICT DO UPDATE) falla:
-- Postgres exige permiso de UPDATE para la clausula de conflicto aunque
-- en la practica no haya ninguna fila que actualizar. Sin ella, la
-- escritura se rechazaba en silencio (el cliente de Supabase no lanza
-- excepcion, solo devuelve un campo `error` que el codigo no comprobaba).
CREATE POLICY "favoritos_update_own" ON public.favoritos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. GRANT base: sin esto RLS nunca llega a evaluarse, PostgREST devuelve
-- "permission denied for table favoritos" directamente. Se detecto en
-- produccion que este paso se habia omitido por completo desde que se
-- creo la tabla -- favoritos nunca llego a guardar nada realmente hasta
-- corregirlo (2026-08-30). Solo authenticated: es una funcion privada,
-- igual que perfiles/filtros_guardados en grant_permissions.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favoritos TO authenticated;
