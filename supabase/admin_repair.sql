-- ============================================================
-- SCRIPT DE REPARACIÓN DEL PANEL DE ADMINISTRACIÓN
-- Arregla el error 403 (Permisos) al cargar la pestaña Monitorización.
-- ============================================================

-- 1. Otorgar permisos básicos de Postgres a las tablas de administración (Crucial para el 403)
GRANT ALL PRIVILEGES ON TABLE public.system_logs TO authenticated, anon, service_role;
GRANT ALL PRIVILEGES ON TABLE public.incidencias TO authenticated, anon, service_role;

-- 2. Actualizar la política de los logs para usar nuestra nueva función segura is_admin()
DROP POLICY IF EXISTS "admin_all_logs" ON public.system_logs;
CREATE POLICY "admin_all_logs" ON public.system_logs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
