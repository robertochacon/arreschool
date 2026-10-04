-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0019 · Solo Dirección y Administración editan el colegio
-- ═══════════════════════════════════════════════════════════════════════════
-- `tenants_update` (0003) se escribió cuando todo miembro era owner o admin:
-- `id = auth_tenant_id()` bastaba. Con los roles del colegio (0012) eso deja que
-- una docente o la secretaría cambien por API el nombre del colegio, el RNC, el
-- logo o el pie de los recibos — lo que sale impreso en documentos oficiales.
-- La UI ya lo ocultaba; aquí se cierra de verdad.
--
-- `tenants_guard` (0008) sigue protegiendo `suspended_at` igual que antes.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.auth_tenant_id() and public.auth_can_manage_academics())
  with check (id = public.auth_tenant_id() and public.auth_can_manage_academics());
