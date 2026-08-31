-- Tabla de telemetria de producto (embudo busqueda -> ver beca -> crear
-- alerta -> registro). Separada de system_logs a proposito: system_logs es
-- el log de auditoria de admin (bloqueos, noticias...) y se llenaria de
-- ruido con un evento por cada busqueda/vista de beca. Solo se envian
-- eventos desde el frontend tras consentimiento de la categoria "Analisis"
-- del banner de cookies (ver js/cookies.js, js/supabase.js AnalyticsAPI).
-- Ya aplicada en produccion.

CREATE TABLE public.eventos_embudo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL CHECK (evento IN ('busqueda', 'ver_beca', 'crear_alerta', 'registro')),
  meta jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  analytics_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eventos_embudo_evento_created ON public.eventos_embudo (evento, created_at DESC);

ALTER TABLE public.eventos_embudo ENABLE ROW LEVEL SECURITY;

-- Insercion anonima permitida (igual que incidencias): es telemetria sin
-- datos sensibles, y muchos eventos del embudo (busqueda, ver_beca) ocurren
-- antes de que el usuario tenga sesion.
CREATE POLICY eventos_embudo_insert_any ON public.eventos_embudo
  FOR INSERT WITH CHECK (true);

-- Lectura solo para admin.
CREATE POLICY eventos_embudo_select_admin ON public.eventos_embudo
  FOR SELECT USING (is_admin());

-- RLS sin GRANT no sirve de nada (leccion aprendida esta misma sesion con
-- favoritos/notificaciones): sin esto, "permission denied" directo antes de
-- que la policy llegue a evaluarse.
GRANT INSERT ON public.eventos_embudo TO anon, authenticated;
GRANT SELECT ON public.eventos_embudo TO authenticated;
