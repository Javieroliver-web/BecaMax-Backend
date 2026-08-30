-- ============================================================
-- SCRIPT DE CONCESIÓN DE PERMISOS BÁSICOS
-- "Permission denied for table perfiles"
-- ============================================================

-- NOTA DE SEGURIDAD (2026-08-29): la versión anterior de este script daba
-- GRANT ALL PRIVILEGES (incluye TRUNCATE/REFERENCES/TRIGGER) también a
-- `anon` en perfiles y filtros_guardados, pese a que ningún flujo anónimo
-- de la app necesita tocar esas tablas (login es obligatorio para ambas).
-- RLS ya bloqueaba esos accesos, pero era una capa de defensa de menos.
-- Se reduce a los privilegios de datos que realmente se usan, y se
-- revoca por completo el acceso de `anon` a perfiles y filtros_guardados.

REVOKE ALL PRIVILEGES ON TABLE public.perfiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.perfiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.perfiles TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.filtros_guardados FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.filtros_guardados TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.filtros_guardados TO service_role;

-- Mesa de Noticias: la lectura pública SÍ es intencional (RLS "Anyone can
-- read news" no exige login), pero escribir no lo es (RLS restringe a
-- admins). `anon` solo necesita SELECT.
GRANT SELECT ON TABLE public.noticias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.noticias TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.noticias TO service_role;

-- (2026-08-30) favoritos y notificaciones: mismo problema que dio nombre
-- a este script ("permission denied for table X"), pero nunca se habian
-- incluido aqui -- sus propios *_setup.sql solo creaban tabla + RLS, sin
-- el GRANT base, asi que ninguna de las dos funciones llego a funcionar
-- de verdad en produccion hasta detectarlo probando con una cuenta de
-- usuario real. Ver tambien favoritos_setup.sql y notificaciones_setup.sql.
REVOKE ALL PRIVILEGES ON TABLE public.favoritos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favoritos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.favoritos TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.notificaciones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notificaciones TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.notificaciones TO service_role;
