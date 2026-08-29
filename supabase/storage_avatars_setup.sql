-- ============================================================
--  SUPABASE SQL: Storage para Avatares
--  Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear el bucket público "avatars" si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permitir que cualquiera lea los avatares (SELECT)
CREATE POLICY "Avatar images are publicly accessible."
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- 3. Permitir que los usuarios autenticados suban avatares (INSERT)
CREATE POLICY "Users can upload their own avatars."
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND 
  auth.role() = 'authenticated'
);

-- 4. Permitir que los usuarios actualicen sus propios avatares (UPDATE)
CREATE POLICY "Users can update their own avatars."
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND 
  auth.role() = 'authenticated'
);

-- 5. Permitir que los usuarios eliminen sus propios avatares (DELETE)
CREATE POLICY "Users can delete their own avatars."
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' AND 
  auth.role() = 'authenticated'
);
