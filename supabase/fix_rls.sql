-- ============================================================
-- PARCHE DE SEGURIDAD CRÍTICO (Error 500 Supabase)
-- Resuelve el problema de Recursión Infinita en la política RLS
-- y garantiza que todos los usuarios tengan un perfil.
-- ============================================================

-- 1. Asegurar que TODOS los usuarios (nuevos y antiguos) tengan una fila en 'perfiles'
INSERT INTO public.perfiles (user_id)
SELECT id FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.users.id);

-- 2. Crear un disparador para que cada usuario nuevo tenga un perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.perfiles (user_id, rol)
  VALUES (new.id, 'user');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Crear función auxiliar (SECURITY DEFINER) para evitar la Recursión Infinita en RLS
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfiles WHERE user_id = auth.uid() AND rol = 'admin'
  );
END;
$$;

-- 4. Reemplazar las políticas recursivas por las optimizadas
DROP POLICY IF EXISTS "user_perfil_all" ON perfiles;
CREATE POLICY "user_perfil_all" ON perfiles
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "owner_all" ON filtros_guardados;
CREATE POLICY "owner_all" ON filtros_guardados
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
