-- ============================================================
--  SUPABASE SQL: Tabla notificaciones
--  Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  texto       TEXT NOT NULL,
  icono       TEXT DEFAULT '🔔',
  url_destino TEXT,
  leida       BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_notif_user_id ON public.notificaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_leida ON public.notificaciones(leida);
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON public.notificaciones(created_at DESC);

-- 3. Habilitar Row Level Security
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- 4. Política: cada usuario solo ve SUS notificaciones
CREATE POLICY "notificaciones_select_own" ON public.notificaciones
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Política: los usuarios pueden marcar sus notificaciones como leídas
CREATE POLICY "notificaciones_update_own" ON public.notificaciones
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- (Opcional) Política para insertar desde el dashboard si fuese necesario 
-- (generalmente las crea el backend o triggers)
CREATE POLICY "notificaciones_insert_own" ON public.notificaciones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Política: eliminar propias
CREATE POLICY "notificaciones_delete_own" ON public.notificaciones
  FOR DELETE USING (auth.uid() = user_id);

-- 7. GRANT base: sin esto RLS nunca llega a evaluarse, PostgREST devuelve
-- "permission denied for table notificaciones" directamente. Mismo hueco
-- que en favoritos_setup.sql, detectado y corregido en produccion el
-- mismo dia (2026-08-30) -- la campana de notificaciones nunca pudo leer
-- ni marcar como leida ninguna notificacion real hasta este GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notificaciones TO authenticated;
