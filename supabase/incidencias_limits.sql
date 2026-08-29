-- ============================================================
-- LÍMITES DE TAMAÑO EN incidencias (2026-08-29)
-- ============================================================
-- El formulario público de incidencias (sin login) escribe directo contra
-- la API REST de Supabase, sin pasar por el rate-limit del backend Express.
-- Sin límite de longitud, es un vector barato de saturar la tabla/DB con
-- inserts masivos. Los valores son generosos para no afectar el uso normal.

ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_descripcion_len,
  ADD CONSTRAINT incidencias_descripcion_len CHECK (char_length(descripcion) <= 5000);

ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_tipo_len,
  ADD CONSTRAINT incidencias_tipo_len CHECK (char_length(tipo) <= 100);
