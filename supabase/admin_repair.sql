-- ============================================================
-- SCRIPT DE REPARACIÓN DEL PANEL DE ADMINISTRACIÓN
-- Arregla el error 403 (Permisos) al cargar la pestaña Monitorización.
-- ============================================================

-- 1. Otorgar permisos básicos de Postgres a las tablas de administración
-- NOTA DE SEGURIDAD (2026-08-29): la versión anterior daba GRANT ALL
-- PRIVILEGES también a `anon` en ambas tablas. system_logs no tiene ningún
-- flujo anónimo legítimo (solo el backend con service_role y el panel
-- admin escriben ahí) y, aunque RLS ya bloqueaba filas, era una capa de
-- defensa de menos. incidencias sí tiene un formulario público de reporte
-- sin login por diseño, pero solo necesita INSERT, no ALL PRIVILEGES.
REVOKE ALL PRIVILEGES ON TABLE public.system_logs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_logs TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.system_logs TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.incidencias FROM anon;
GRANT INSERT ON TABLE public.incidencias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.incidencias TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.incidencias TO service_role;

-- 2. Actualizar la política de los logs para usar nuestra nueva función segura is_admin()
DROP POLICY IF EXISTS "admin_all_logs" ON public.system_logs;
CREATE POLICY "admin_all_logs" ON public.system_logs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
