-- Campos nuevos para filtros de recomendacion mas especificos, a peticion
-- del usuario. Ya aplicados en produccion. Sin cambios de RLS/GRANT: son
-- columnas nuevas en tablas ya protegidas (perfiles: dueno+admin;
-- becas: lectura publica ya existente).

-- becas: umbrales estructurados, solo rellenados cuando el requisito da una
-- cifra clara en el texto libre existente (columna `requisitos`). El resto
-- se deja NULL a proposito -- "renta familiar baja"/"por tramos" no es una
-- cifra, no se inventa un umbral. NULL en cualquiera de los dos lados
-- (perfil o beca) significa "sin restriccion conocida", nunca se usa para
-- OCULTAR una beca a la que el usuario podria optar.
ALTER TABLE public.becas
  ADD COLUMN edad_min integer,
  ADD COLUMN edad_max integer,
  ADD COLUMN renta_max numeric;

COMMENT ON COLUMN public.becas.edad_min IS 'Edad minima requerida, si esta especificada de forma clara en requisitos. NULL = sin restriccion conocida.';
COMMENT ON COLUMN public.becas.edad_max IS 'Edad maxima requerida, si esta especificada de forma clara en requisitos. NULL = sin restriccion conocida.';
COMMENT ON COLUMN public.becas.renta_max IS 'Umbral maximo de renta familiar anual (EUR) si esta especificado como cifra exacta en requisitos. NULL = sin umbral numerico conocido (puede seguir habiendo un requisito de renta descrito solo en texto).';

-- perfiles: datos de perfil para poder recomendar becas mas ajustadas.
ALTER TABLE public.perfiles
  ADD COLUMN fecha_nacimiento date,
  ADD COLUMN renta_familiar_anual numeric,
  ADD COLUMN provincia text,
  ADD COLUMN centro_educativo text,
  ADD COLUMN curso_actual text;

COMMENT ON COLUMN public.perfiles.fecha_nacimiento IS 'Usada para calcular la edad y filtrar becas con requisito de edad. Opcional.';
COMMENT ON COLUMN public.perfiles.renta_familiar_anual IS 'Dato sensible, opcional. Ya protegido por la RLS existente de perfiles (solo el dueno y admin lo ven).';
COMMENT ON COLUMN public.perfiles.provincia IS 'Mas granular que region (que solo distingue Andalucia/Nacional). Opcional.';
COMMENT ON COLUMN public.perfiles.centro_educativo IS 'Informativo -- ninguna beca referencia centros concretos de forma estructurada, no se usa para filtrar.';
COMMENT ON COLUMN public.perfiles.curso_actual IS 'Informativo (ej. "2 Bachillerato"), mas especifico que tipo_estudio pero no estructurado, no se usa para filtrar.';

-- Retro-relleno de las becas ya existentes (23 filas en el momento de
-- escribir esto, dataset pequeno, revisado a mano una por una).
UPDATE public.becas SET renta_max = 11939 WHERE id = 1; -- Beca 6000: "Renta familiar < 11.939 €"
UPDATE public.becas SET edad_min = 18, edad_max = 24 WHERE id = 3; -- Beca Segunda Oportunidad: "18 a 24 años"
UPDATE public.becas SET edad_max = 35 WHERE id = 16; -- Beca Iberoamérica Jóvenes Profesores: "Menos de 35 años"
