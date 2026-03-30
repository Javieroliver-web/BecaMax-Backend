-- ============================================================
-- BECAMAX - GESTIÓN DE SEGURIDAD (ELIMINACIÓN DE CUENTAS)
-- Permite que un usuario elimine legalmente todos sus datos y su cuenta.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que la petición viene de un usuario autenticado explícitamente y válido
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Borrar físicamente al usuario de auth.users
  -- Debido al ON DELETE CASCADE, esto purgará automáticamente:
  -- 1. Sus alertas en filtros_guardados
  -- 2. Su perfil y foto en perfiles
  -- 3. Sus incidencias.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Permisos
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
