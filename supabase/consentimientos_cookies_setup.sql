-- Registro del consentimiento de cookies (RGPD art. 7.1: el responsable
-- debe poder DEMOSTRAR que el usuario consintió). Idea tomada de Vesta
-- (revisión del 24/09/2026), con minimización de datos:
--   - SIN IP y SIN usuario: el consentimiento es de un navegador, que guarda
--     un identificador aleatorio (consent_id). Con eso basta para probarlo.
--   - Solo lo escribe el backend (clave de servicio) y solo lo lee el admin.
--   - Se guarda 24 meses (plazo que la AEPD recomienda para renovarlo); el
--     propio endpoint borra los más antiguos.

create table if not exists public.consentimientos_cookies (
  id               bigint generated always as identity primary key,
  consent_id       uuid        not null,
  analisis         boolean     not null,
  marketing        boolean     not null,
  accion           text        not null check (accion in ('aceptar_todo', 'rechazar', 'personalizar')),
  version_politica text        not null check (version_politica ~ '^\d{4}-\d{2}$'),
  user_agent       text        check (char_length(user_agent) <= 200),
  creado           timestamptz not null default now()
);

create index if not exists consentimientos_cookies_consent_id_idx on public.consentimientos_cookies (consent_id);
create index if not exists consentimientos_cookies_creado_idx on public.consentimientos_cookies (creado);

alter table public.consentimientos_cookies enable row level security;

-- Nadie escribe ni lee desde el navegador; el backend usa la clave de servicio.
revoke all on public.consentimientos_cookies from anon, authenticated;

drop policy if exists consentimientos_cookies_select_admin on public.consentimientos_cookies;
create policy consentimientos_cookies_select_admin on public.consentimientos_cookies
  for select to authenticated using (is_admin());
grant select on public.consentimientos_cookies to authenticated;  -- filtrado por la política: solo admin

-- OJO: en este proyecto las tablas nuevas NO dan permisos al service_role por
-- defecto. Sin esto el endpoint daba 500 en producción (24/09/2026).
grant select, insert, delete on public.consentimientos_cookies to service_role;

-- "Descargar mis datos" (GET /api/auth/mis-datos) lee eventos_embudo del
-- propio usuario con la clave de servicio; tampoco tenía permiso.
grant select on public.eventos_embudo to service_role;
