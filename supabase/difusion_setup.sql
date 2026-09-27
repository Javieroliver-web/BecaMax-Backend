-- ============================================================
--  DIFUSIÓN AUTOMÁTICA – Ejecutar en el SQL Editor de Supabase
--  ANTES de publicar el backend con la difusión activada.
--
--  Tabla de control: una fila por beca y canal. Es la única fuente de
--  verdad de "qué se ha publicado ya" (syncBdns no distingue becas nuevas
--  de actualizadas: hace upsert y toca updated_at en todas).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.difusion_publicaciones (
  id BIGSERIAL PRIMARY KEY,
  codigo_bdns TEXT NOT NULL,
  canal TEXT NOT NULL,              -- 'telegram' | 'bluesky' | 'newsletter'
  -- 'publicando': reservada justo antes de publicar. Si el post sale pero no
  --               se puede apuntar el resultado, se queda así y NO se
  --               reintenta (mejor perder una publicación que duplicarla).
  -- 'publicado' | 'error' (se reintenta hasta 3 veces) | 'omitido'
  estado TEXT NOT NULL,
  referencia_externa TEXT,          -- id del mensaje o post, si lo hay
  error TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (codigo_bdns, canal)
);

ALTER TABLE public.difusion_publicaciones ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni anon ni authenticated pueden leerla ni escribirla.
REVOKE ALL ON public.difusion_publicaciones FROM anon, authenticated;

-- En este proyecto las tablas nuevas NO dan permisos al service_role
-- (lección de "Descargar mis datos", 25/09/2026): se conceden a mano.
GRANT SELECT, INSERT, UPDATE ON public.difusion_publicaciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.difusion_publicaciones_id_seq TO service_role;

-- Comprobación: las dos deben devolver true.
SELECT has_table_privilege('service_role', 'public.difusion_publicaciones', 'INSERT') AS puede_insertar,
       has_table_privilege('service_role', 'public.difusion_publicaciones', 'UPDATE') AS puede_actualizar;
