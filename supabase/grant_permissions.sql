-- ============================================================
-- SCRIPT DE CONCESIÓN DE PERMISOS BÁSICOS
-- "Permission denied for table perfiles"
-- ============================================================

-- Otorgar los permisos básicos de Postgres a los roles de Supabase
GRANT ALL PRIVILEGES ON TABLE public.perfiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.perfiles TO anon;
GRANT ALL PRIVILEGES ON TABLE public.perfiles TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.filtros_guardados TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.filtros_guardados TO anon;
GRANT ALL PRIVILEGES ON TABLE public.filtros_guardados TO service_role;
