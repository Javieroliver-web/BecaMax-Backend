-- ============================================================
-- MIGRACIÓN: soporte para sincronización real con la BDNS
-- Ejecutar en el SQL Editor de Supabase antes de correr
-- src/scripts/bdns_sync.js (ver ese archivo).
-- ============================================================

-- La tabla becas ya existe en producción con id SERIAL (autoincremental)
-- para los 20 registros seed originales. La BDNS identifica cada
-- convocatoria con su propio código estable (codigoBDNS), necesario para
-- que un upsert repetido actualice la misma fila en vez de duplicarla.
-- Se añade como columna aparte, no como id, para no romper nada existente.
ALTER TABLE public.becas ADD COLUMN IF NOT EXISTS codigo_bdns TEXT UNIQUE;
ALTER TABLE public.becas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_becas_codigo_bdns ON public.becas(codigo_bdns);
