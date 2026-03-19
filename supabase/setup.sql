-- ============================================================
--  SUPABASE SETUP – Ejecutar en SQL Editor de Supabase
--  https://app.supabase.com → tu proyecto → SQL Editor
-- ============================================================

-- ============================================================
-- Tabla de perfiles de usuario (Debe ir primero por dependencias)
-- ============================================================
CREATE TABLE IF NOT EXISTS perfiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_estudio TEXT,
  region       TEXT,
  area         TEXT,
  rol          TEXT NOT NULL DEFAULT 'user',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_perfil_all" ON perfiles
  FOR ALL
  USING (auth.uid() = user_id OR (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK (auth.uid() = user_id OR (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin');

-- Tabla principal de filtros guardados por usuario
CREATE TABLE IF NOT EXISTS filtros_guardados (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  filtros    JSONB NOT NULL DEFAULT '{}',
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_filtros_user ON filtros_guardados(user_id);

-- Row Level Security: cada usuario solo accede a sus propias alertas
ALTER TABLE filtros_guardados ENABLE ROW LEVEL SECURITY;

-- Política: acceso completo solo al propietario o para administradores
CREATE POLICY "owner_all" ON filtros_guardados
  FOR ALL
  USING  (auth.uid() = user_id OR (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK (auth.uid() = user_id OR (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin');

-- ============================================================
-- Tabla de incidencias y soporte
-- ============================================================
CREATE TABLE IF NOT EXISTS incidencias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo        TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Políticas (Opcional, pero recomendado: solo insertar, solo admin lee)
ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;

-- Permitir a cualquier usuario (incluso anónimos) insertar una incidencia
CREATE POLICY "Cualquiera puede insertar incidencias" ON incidencias
  FOR INSERT
  WITH CHECK (true);

-- Solo el dueño o los administradores pueden ver/gestionar incidencias
CREATE POLICY "Usuarios ven sus propias incidencias o admin ve todas" ON incidencias
  FOR ALL
  USING (auth.uid() = user_id  OR (SELECT rol FROM perfiles WHERE user_id = auth.uid()) = 'admin');


-- ============================================================
-- Trigger para crear perfil por defecto al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
