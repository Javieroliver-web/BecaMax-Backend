-- ============================================================
-- SCRIPT DE REPARACIÓN MAESTRA DE BASE DE DATOS (MÉDICO TOTAL)
-- Corrige todos los errores de Avatar, Perfiles y Políticas
-- ============================================================

-- 1. Asegurar que la tabla y TODAS sus columnas (incluyendo Avatar) existen
CREATE TABLE IF NOT EXISTS public.perfiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_estudio TEXT,
  region TEXT,
  area TEXT,
  rol TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Si habías olvidado ejecutar el script de avatares anterior, esto lo soluciona:
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Asegurar que ningún estudiante se haya quedado sin su fila de perfil
INSERT INTO public.perfiles (user_id, rol)
SELECT id, 'user' FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.users.id);

-- 3. Blindar el registro futuro (Trigger)
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

-- 4. Función de Admin Segura (Arregla el Error 500 para siempre)
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.uid() AND rol = 'admin');
END;
$$;

-- 5. Reestructurar las políticas de Seguridad
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_perfil_all" ON public.perfiles;
CREATE POLICY "user_perfil_all" ON public.perfiles
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
