-- ============================================================
-- CRÍTICO (2026-08-29): impide la auto-escalada de privilegios
-- ============================================================
-- La policy RLS "user_perfil_all" (ver setup.sql/fix_rls.sql/master_repair.sql)
-- solo comprueba que el usuario es dueño de la fila (auth.uid() = user_id),
-- no qué columnas puede cambiar. Combinado con GRANT UPDATE de tabla
-- completa a `authenticated`, CUALQUIER usuario registrado podía
-- autopromocionarse a admin llamando directamente a la API de Supabase:
--   supabaseClient.from('perfiles').update({rol:'admin'}).eq('user_id', miId)
-- Por el mismo motivo, un usuario bloqueado (estado='bloqueado') podía
-- desbloquearse a sí mismo cambiando su propio 'estado'.
--
-- RLS no puede comparar el valor ANTIGUO vs NUEVO de una columna, así que
-- se usa un trigger: permite el cambio de rol/estado solo si quien ejecuta
-- la petición ya es admin (public.is_admin()); en caso contrario, si se
-- intenta cambiar rol o estado, la petición entera falla.

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
      RAISE EXCEPTION 'No autorizado para cambiar el rol';
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'No autorizado para cambiar el estado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.perfiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();
