-- ============================================================
-- ACTUALIZACIÓN SUPABASE: Panel de Monitorización y Gestión
-- Ejecuta este script en el SQL Editor de Supabase
-- ============================================================

-- 1. Añadir columna estado a la tabla perfiles
ALTER TABLE public.perfiles 
ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo';

-- 2. Asegurarnos que todos los existentes tengan estado activo
UPDATE public.perfiles SET estado = 'activo' WHERE estado IS NULL;

-- 3. Crear tabla para logs del sistema
CREATE TABLE IF NOT EXISTS public.system_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Usuario afectado (opcional)
    admin_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin que ejecuta (opcional)
    action     TEXT NOT NULL,
    details    TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Seguridad (Row Level Security) para los logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Solo los administradores pueden leer e insertar logs
CREATE POLICY "admin_all_logs" ON public.system_logs
  FOR ALL
  USING ((SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin');

-- Permitir a cualquier usuario anónimo o logueado insertar logs de acceso general
CREATE POLICY "anyone_insert_logs" ON public.system_logs
  FOR INSERT
  WITH CHECK (true);
