-- Añadir columna avatar_url a la tabla perfiles si no existe
ALTER TABLE public.perfiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- (Opcional) Registrar un comentario en la base de datos
COMMENT ON COLUMN public.perfiles.avatar_url IS 'URL apuntando a la foto de perfil elegida por el usuario.';
