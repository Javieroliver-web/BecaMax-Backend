-- ============================================================
-- 24/09/2026 — Aplicado ya en producción (dos migraciones de Supabase:
-- perfiles_sin_insert_delete_directo y rls_initplan_e_indices_fk).
-- ============================================================

-- 1. SEGURIDAD: escalada a admin borrando y recreando el perfil.
-- La política user_perfil_all (ALL, dueño o admin) dejaba a cualquier
-- usuario BORRAR su fila de perfiles y CREARLA de nuevo con rol='admin'
-- (o sin su estado 'bloqueado'): trg_prevent_privilege_escalation solo
-- vigila UPDATE. Bastaba el cliente de Supabase del navegador.
-- La app nunca crea ni borra perfiles con la sesión del usuario: los crea
-- handle_new_user() y los borra delete_my_account(), ambas SECURITY
-- DEFINER y propiedad de postgres, así que no les afecta.
revoke insert, delete, truncate, references, trigger on table public.perfiles from authenticated;

-- 2. RENDIMIENTO (linter de Supabase): misma lógica, pero auth.*() dentro
-- de (select ...) se evalúa una vez por consulta y no una vez por fila.
alter policy "favoritos_select_own" on public.favoritos using ((select auth.uid()) = user_id);
alter policy "favoritos_insert_own" on public.favoritos with check ((select auth.uid()) = user_id);
alter policy "favoritos_update_own" on public.favoritos using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "favoritos_delete_own" on public.favoritos using ((select auth.uid()) = user_id);

alter policy "notificaciones_select_own" on public.notificaciones using ((select auth.uid()) = user_id);
alter policy "notificaciones_insert_own" on public.notificaciones with check ((select auth.uid()) = user_id);
alter policy "notificaciones_update_own" on public.notificaciones using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "notificaciones_delete_own" on public.notificaciones using ((select auth.uid()) = user_id);

alter policy "owner_all" on public.filtros_guardados
  using (((select auth.uid()) = user_id) or (select is_admin()))
  with check (((select auth.uid()) = user_id) or (select is_admin()));

alter policy "user_perfil_all" on public.perfiles
  using (((select auth.uid()) = user_id) or (select is_admin()))
  with check (((select auth.uid()) = user_id) or (select is_admin()));

alter policy "Cualquiera puede insertar incidencias" on public.incidencias
  with check ((user_id is null) or (user_id = (select auth.uid())));

alter policy "Usuarios ven sus propias incidencias o admin ve todas" on public.incidencias
  using (((select auth.uid()) = user_id) or ((select perfiles.rol from perfiles where perfiles.user_id = (select auth.uid())) = 'admin'::text));

alter policy "Only admins/service role can modify becas" on public.becas
  using ((select auth.role()) = 'service_role'::text);

-- 3. Claves ajenas sin índice.
create index if not exists idx_eventos_embudo_user_id on public.eventos_embudo (user_id);
create index if not exists idx_incidencias_user_id on public.incidencias (user_id);
create index if not exists idx_noticias_created_by on public.noticias (created_by);
create index if not exists idx_system_logs_admin_id on public.system_logs (admin_id);
create index if not exists idx_system_logs_user_id on public.system_logs (user_id);
