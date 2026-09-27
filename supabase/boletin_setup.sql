-- ============================================================
--  BOLETÍN SEMANAL – Ejecutar en el SQL Editor de Supabase
--  ANTES de publicar el backend con el boletín.
--
--  RGPD: doble confirmación (no se envía nada hasta confirmar), prueba del
--  consentimiento (texto, versión y fecha) y baja con un clic que BORRA la
--  fila. Las altas sin confirmar se borran a los 7 días (cron semanal).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suscriptores_boletin (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,                 -- siempre en minúsculas
  token_baja TEXT NOT NULL UNIQUE,            -- va en cada correo; solo sirve para darse de baja
  token_confirmacion_hash TEXT UNIQUE,        -- SHA-256 del token; NULL tras confirmar
  confirmacion_expira_en TIMESTAMPTZ,
  confirmacion_enviada_en TIMESTAMPTZ,
  confirmado_en TIMESTAMPTZ,                  -- NULL = pendiente: no recibe boletines
  consentimiento_texto TEXT NOT NULL,
  consentimiento_version TEXT NOT NULL,
  consentimiento_en TIMESTAMPTZ NOT NULL,
  ultimo_envio_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suscriptores_confirmado ON public.suscriptores_boletin (confirmado_en);

ALTER TABLE public.suscriptores_boletin ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el backend (service_role) la toca. Son datos personales.
REVOKE ALL ON public.suscriptores_boletin FROM anon, authenticated;

-- En este proyecto las tablas nuevas NO dan permisos al service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suscriptores_boletin TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.suscriptores_boletin_id_seq TO service_role;

-- Comprobación: las tres deben devolver true.
SELECT has_table_privilege('service_role', 'public.suscriptores_boletin', 'INSERT') AS puede_insertar,
       has_table_privilege('service_role', 'public.suscriptores_boletin', 'UPDATE') AS puede_actualizar,
       has_table_privilege('service_role', 'public.suscriptores_boletin', 'DELETE') AS puede_borrar;
