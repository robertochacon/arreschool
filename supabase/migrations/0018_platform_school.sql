-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0018 · La plataforma pasa de "items" al colegio
-- ═══════════════════════════════════════════════════════════════════════════
-- El starter traía `items` como entidad de ejemplo y todo el andamiaje de
-- plataforma (topes de plan, panel de super-admin, purga) contaba items. Con el
-- dominio escolar ya en su sitio (0013-0017), esta migración:
--
--   1) Retira `items` (tabla, enum, triggers y funciones).
--   2) Cambia el tope de plan a ESTUDIANTES ACTIVOS (max_items → max_students):
--      es lo que mide el tamaño real de un colegio. Prefijo PLAN_LIMIT_STUDENTS.
--   3) Reescribe las RPC del super-admin y la purga para que cuenten y borren
--      el dominio escolar completo.
--   4) Da al OWNER gestión de su equipo con roles (antes solo el super-admin
--      podía cambiar un rol).
--
-- Se hace como migración nueva y no editando 0001-0011: esas ya son historia
-- (ver CLAUDE.md, "Nunca se edita una migración ya aplicada").
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Fuera items
-- ──────────────────────────────────────────────────────────────────────────
drop table if exists public.items cascade;
drop function if exists public.enforce_item_limit();
drop function if exists public.enforce_item_consistency();
drop type if exists item_status;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Topes de plan por estudiantes
-- ──────────────────────────────────────────────────────────────────────────
do $$ begin
  alter table public.plan_settings rename column max_items to max_students;
exception when undefined_column then null; end $$;

-- Las viñetas y topes de fábrica hablaban de items. Solo se tocan las filas que
-- siguen EXACTAMENTE como las sembró 0009: si el super-admin ya las editó, su
-- versión manda (mismo criterio que el `on conflict do nothing` de la siembra).
update public.plan_settings
set max_students = 30, max_members = 2,
    features = array[
      'Hasta 30 estudiantes activos',
      '2 usuarios (Dirección + Secretaría)',
      'Estudiantes, familias, asistencia y evaluaciones',
      'Cargos, pagos y recibos',
      'Soporte por correo'
    ]
where plan = 'basic'
  and features = array['Hasta 10 items', 'Un solo usuario', 'Panel con las métricas del negocio', 'Soporte por correo'];

update public.plan_settings
set features = array[
      'Estudiantes ilimitados',
      'Usuarios ilimitados con roles (docentes, secretaría, finanzas)',
      'Boletines y reportes completos',
      'Historial académico de todos los años',
      'Soporte prioritario'
    ]
where plan = 'pro'
  and features = array['Items ilimitados', 'Usuarios ilimitados', 'Invitaciones para tu equipo',
                       'Historial y bitácora completos', 'Soporte prioritario'];

-- Cuenta ACTIVOS, no todos: el historial (graduados, retirados) no puede costar
-- cupo, o un colegio con diez años de vida no cabría en ningún plan. Por eso
-- también se dispara al REACTIVAR un estudiante, no solo al crearlo.
create or replace function public.enforce_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  plan_code;
  v_max   integer;
  v_name  text;
  v_count int;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select plan into v_plan from subscriptions where tenant_id = new.tenant_id;
  v_plan := coalesce(v_plan, 'basic');

  select ps.max_students, ps.name into v_max, v_name
  from plan_settings ps where ps.plan = v_plan;
  if not found then
    v_max  := case when v_plan = 'basic' then 30 else null end;
    v_name := v_plan::text;
  end if;

  if v_max is not null then
    select count(*) into v_count from students
    where tenant_id = new.tenant_id and status = 'active' and id <> new.id;
    if v_count >= v_max then
      raise exception 'PLAN_LIMIT_STUDENTS: El plan % permite % estudiantes activos. Actualiza tu plan para inscribir más.', v_name, v_max;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_student_limit on public.students;
create trigger trg_enforce_student_limit before insert or update of status on public.students
  for each row execute function public.enforce_student_limit();
revoke all on function public.enforce_student_limit() from public, anon;

-- admin_update_plan cambia de firma (p_max_items → p_max_students). Una firma
-- distinta es OTRA función para Postgres: hay que soltar la vieja o quedarían
-- las dos y PostgREST no sabría a cuál llamar.
drop function if exists public.admin_update_plan(plan_code, text, numeric, numeric, integer, integer, boolean, text[], boolean, boolean, integer);

create or replace function public.admin_update_plan(
  p_plan          plan_code,
  p_name          text     default null,
  p_price_monthly numeric  default null,
  p_price_usd     numeric  default null,
  p_max_students  integer  default null,
  p_max_members   integer  default null,
  p_clear_max     boolean  default false,
  p_features      text[]   default null,
  p_is_offered    boolean  default null,
  p_is_featured   boolean  default null,
  p_sort_order    integer  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row plan_settings;
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;
  if p_price_monthly is not null and p_price_monthly < 0 then
    raise exception 'El precio mensual no puede ser negativo';
  end if;
  if p_price_usd is not null and p_price_usd < 0 then
    raise exception 'El precio en US$ no puede ser negativo';
  end if;
  if p_max_students is not null and p_max_students < 1 then
    raise exception 'El tope de estudiantes debe ser 1 o más (usa "ilimitado" para quitarlo)';
  end if;
  if p_max_members is not null and p_max_members < 1 then
    raise exception 'El tope de usuarios debe ser 1 o más (usa "ilimitado" para quitarlo)';
  end if;
  if p_name is not null and btrim(p_name) = '' then
    raise exception 'El plan necesita un nombre';
  end if;

  if coalesce(p_is_featured, false) then
    update plan_settings set is_featured = false where plan <> p_plan and is_featured;
  end if;

  update plan_settings set
    name          = coalesce(nullif(btrim(p_name), ''), name),
    price_monthly = coalesce(p_price_monthly, price_monthly),
    price_usd     = coalesce(p_price_usd, price_usd),
    max_students  = case when p_clear_max then null else coalesce(p_max_students, max_students) end,
    max_members   = case when p_clear_max then null else coalesce(p_max_members, max_members) end,
    features      = coalesce(p_features, features),
    is_offered    = coalesce(p_is_offered, is_offered),
    is_featured   = coalesce(p_is_featured, is_featured),
    sort_order    = coalesce(p_sort_order, sort_order),
    updated_at    = now(),
    updated_by    = auth.uid()
  where plan = p_plan
  returning * into v_row;

  if v_row.plan is null then
    raise exception 'Plan % no encontrado', p_plan;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) RPC del super-admin: cifras del colegio en vez de items
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'tenants',         (select count(*) from tenants),
    'members',         (select count(*) from profiles where tenant_id is not null),
    'students',        (select count(*) from students),
    'active_students', (select count(*) from students where status = 'active'),
    'collected_total', (select coalesce(sum(amount), 0) from payments where status = 'valid'),
    'platform_admins', (select count(*) from platform_admins),
    'by_plan', (
      select coalesce(jsonb_object_agg(plan_txt, c), '{}'::jsonb)
      from (select plan::text as plan_txt, count(*) c from subscriptions group by plan) q
    ),
    'by_status', (
      select coalesce(jsonb_object_agg(status_txt, c), '{}'::jsonb)
      from (select status::text as status_txt, count(*) c from subscriptions group by status) q
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_list_tenants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  select coalesce(jsonb_agg(t_row order by created_at desc), '[]'::jsonb)
  into result
  from (
    select
      t.created_at as created_at,
      jsonb_build_object(
        'id',              t.id,
        'name',            t.name,
        'created_at',      t.created_at,
        'whatsapp',        t.whatsapp,
        'currency',        t.currency,
        'suspended',       (t.suspended_at is not null),
        'plan',            s.plan,
        'sub_status',      s.status,
        'trial_ends_at',   s.trial_ends_at,
        'owner_name',      o.full_name,
        'owner_email',     au.email,
        'members',         (select count(*) from profiles pr where pr.tenant_id = t.id),
        'students',        (select count(*) from students st where st.tenant_id = t.id),
        'active_students', (select count(*) from students st where st.tenant_id = t.id and st.status = 'active'),
        'collected_total', (select coalesce(sum(p.amount), 0) from payments p
                            where p.tenant_id = t.id and p.status = 'valid')
      ) as t_row
    from tenants t
    left join subscriptions s on s.tenant_id = t.id
    left join lateral (
      select id, full_name
      from profiles
      where tenant_id = t.id and role = 'owner'
      order by created_at asc
      limit 1
    ) o on true
    left join auth.users au on au.id = o.id
  ) sub;

  return result;
end;
$$;

create or replace function public.admin_tenant_summary(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'students_total',       (select count(*) from students where tenant_id = p_tenant),
    'students_active',      (select count(*) from students where tenant_id = p_tenant and status = 'active'),
    'enrolled',             (select count(*) from enrollments e
                             join academic_periods ap on ap.tenant_id = e.tenant_id and ap.id = e.academic_period_id
                             where e.tenant_id = p_tenant and ap.status = 'active' and e.status = 'enrolled'),
    'teachers',             (select count(*) from teachers where tenant_id = p_tenant and status = 'active'),
    'guardians',            (select count(*) from guardians where tenant_id = p_tenant),
    'sections',             (select count(*) from sections s
                             join academic_periods ap on ap.tenant_id = s.tenant_id and ap.id = s.academic_period_id
                             where s.tenant_id = p_tenant and ap.status = 'active'),
    'collected_total',      (select coalesce(sum(amount), 0) from payments
                             where tenant_id = p_tenant and status = 'valid'),
    'collected_this_month', (select coalesce(sum(amount), 0) from payments
                             where tenant_id = p_tenant and status = 'valid'
                               and paid_on >= date_trunc('month', now())::date),
    'members',              (select count(*) from profiles where tenant_id = p_tenant),
    'created_this_week',    (select count(*) from students
                             where tenant_id = p_tenant and created_at >= date_trunc('week', now())),
    'pending_invites',      (select count(*) from tenant_invites
                             where tenant_id = p_tenant and accepted_at is null and expires_at > now())
  ) into result;

  return result;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Purga: vista previa y borrado con TODO el dominio escolar
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_tenant_purge_preview(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_t      public.tenants;
  v_files  int;
  v_result jsonb;
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_t from public.tenants where id = p_tenant;
  if not found then
    raise exception 'Colegio no encontrado';
  end if;

  begin
    select count(*) into v_files
    from storage.objects
    where bucket_id in ('logos', 'files')
      and (storage.foldername(name))[1] = p_tenant::text;
  exception when others then
    v_files := null;
  end;

  select jsonb_build_object(
    'tenant_id',     v_t.id,
    'name',          v_t.name,
    'suspended',     (v_t.suspended_at is not null),
    'created_at',    v_t.created_at,
    'owner_email', (
      select au.email
      from public.profiles pr
      join auth.users au on au.id = pr.id
      where pr.tenant_id = p_tenant and pr.role = 'owner'
      order by pr.created_at
      limit 1
    ),
    'members',         (select count(*) from public.profiles where tenant_id = p_tenant),
    'students',        (select count(*) from public.students where tenant_id = p_tenant),
    'active_students', (select count(*) from public.students where tenant_id = p_tenant and status = 'active'),
    'guardians',       (select count(*) from public.guardians where tenant_id = p_tenant),
    'enrollments',     (select count(*) from public.enrollments where tenant_id = p_tenant),
    'payments',        (select count(*) from public.payments where tenant_id = p_tenant),
    'collected_total', (select coalesce(sum(amount), 0) from public.payments
                        where tenant_id = p_tenant and status = 'valid'),
    'notifications',   (select count(*) from public.notifications where tenant_id = p_tenant),
    'audit_logs',      (select count(*) from public.audit_logs where tenant_id = p_tenant),
    'invites',         (select count(*) from public.tenant_invites where tenant_id = p_tenant),
    'plan_requests',   (select count(*) from public.plan_requests where tenant_id = p_tenant),
    'files',           v_files
  ) into v_result;

  return v_result;
end;
$$;

-- Copia de 0011 con UN cambio: la lista hijo→padre incluye ahora todo el
-- dominio escolar. Con FK `restrict` (inscripciones, pagos, cargos…) el orden
-- ya no es una cortesía: una tabla fuera de sitio deja el colegio inborrable.
-- Los triggers que reaccionan al DELETE (enrollments_guard,
-- classroom_row_guard, block_write_if_tenant_suspended) se apartan con la marca
-- de purga, como en 0011.
create or replace function public.admin_delete_tenant(
  p_tenant       uuid,
  p_confirm_name text,
  p_delete_users boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
-- El rol `authenticated` viene con `statement_timeout = 8s`: un negocio con un
-- año de historia no cabe, y como todo va en una transacción el corte revierte
-- TODO → el negocio quedaba inborrable y reintentar daba lo mismo. Este ajuste
-- de función es EXACTAMENTE un `set local` al entrar (así lo define Postgres), y
-- PostgREST además lo aplica antes de la llamada; un `set local` escrito dentro
-- del cuerpo NO serviría, porque el temporizador del statement ya está armado.
-- 50 s a propósito: por DEBAJO del corte HTTP del gateway (60 s), con margen
-- para el TLS y para serializar la respuesta. Así, si algo se pasa de tiempo,
-- quien aborta es Postgres —rollback limpio y error claro— y no la petición,
-- que dejaría el borrado hecho, los archivos sin limpiar y la UI diciendo que
-- falló.
set statement_timeout = '50s'
as $$
declare
  v_t      public.tenants;
  v_tbl    text;
  v_n      bigint;
  v_counts jsonb := '{}'::jsonb;
  v_owner  text;
  v_actor  uuid := auth.uid();
  v_uids   uuid[];
  v_files  bigint := 0;
  v_paths  jsonb := '[]'::jsonb;
  -- Orden hijo → padre. No se confía en el orden de las cascadas de FK: hoy
  -- todas son ON DELETE CASCADE y un `delete from tenants` bastaría, pero en
  -- cuanto alguien clone `items` con una tabla hija en RESTRICT (el caso normal
  -- al crecer), el borrado empezaría a fallar según el orden en que PostgreSQL
  -- decida disparar las cascadas. Aquí el orden es explícito y, de paso, es lo
  -- que permite contar cuánto cayó de cada tabla.
  -- Al añadir una tabla con tenant_id, añádela A ESTA LISTA.
  v_order  text[] := array[
    -- Dinero primero: los abonos apuntan a pagos y cargos.
    'payment_allocations',
    'payments',
    'charges',
    'fee_concepts',
    -- Aula: boletines, evaluaciones, anecdotario y asistencia cuelgan de la
    -- inscripción y de la sección.
    'report_cards',
    'student_observations',
    'assessments',
    'indicators',
    'competencies',
    'attendance_records',
    'announcements',
    -- Personas y su paso por cada año.
    'enrollments',
    'student_documents',
    'student_guardians',
    'guardians',
    'students',
    -- Estructura del colegio.
    'section_teachers',
    'sections',
    'teachers',
    'grading_terms',
    'academic_periods',
    'grade_levels',
    'tenant_counters',
    -- Plataforma (lo que ya borraba 0011).
    'notifications',
    'audit_logs',
    'tenant_invites',
    'plan_requests',
    'subscriptions',
    'profiles'           -- desvincula a los usuarios; su login se decide abajo
  ];
begin
  if not public.auth_is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  -- Serializa contra cualquier otra operación del panel sobre este negocio
  -- (suspender, cambiar plan, resolver una solicitud) mientras desaparece.
  perform pg_advisory_xact_lock(hashtext('arreschool_purge:' || p_tenant::text));

  select * into v_t from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'Colegio no encontrado';
  end if;

  -- Un negocio cuyo nombre se quedó en blanco convertiría la confirmación en un
  -- trámite vacío: cualquier casilla vacía "coincidiría" y bastaría un clic.
  if public.norm_name(v_t.name) = '' then
    raise exception 'Este negocio no tiene nombre: ponle uno antes de borrarlo (así la confirmación sirve de algo)';
  end if;
  if public.norm_name(p_confirm_name) is distinct from public.norm_name(v_t.name) then
    raise exception 'El nombre no coincide: escribe exactamente "%" para confirmar', v_t.name;
  end if;

  -- ── Fotografía para la bitácora (ANTES de borrar) ──────────────────────
  select au.email into v_owner
  from public.profiles pr
  join auth.users au on au.id = pr.id
  where pr.tenant_id = p_tenant and pr.role = 'owner'
  order by pr.created_at
  limit 1;

  select coalesce(array_agg(pr.id), '{}'::uuid[]) into v_uids
  from public.profiles pr
  where pr.tenant_id = p_tenant
    -- Cinturón: un super-admin no tiene negocio (0007/0008), pero si alguna vez
    -- lo tuviera por un arreglo manual, su cuenta de plataforma no se borra.
    and not exists (select 1 from public.platform_admins pa where pa.user_id = pr.id);

  -- ── Marca el borrado en curso (apaga los triggers de reacción) ─────────
  -- En particular `block_write_if_tenant_suspended` (0008), que bloquea también
  -- el DELETE: sin esto, borrar un negocio SUSPENDIDO —el caso normal, primero
  -- se suspende y luego se borra— fallaría con CUENTA_SUSPENDIDA.
  perform set_config('arreschool.purging_tenant', p_tenant::text, true);

  -- ── Borrado, hijo → padre ──────────────────────────────────────────────
  foreach v_tbl in array v_order loop
    execute format('delete from public.%I where tenant_id = $1', v_tbl) using p_tenant;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  -- ── Archivos ───────────────────────────────────────────────────────────
  -- Los archivos NO se borran por SQL: quitar la fila de `storage.objects` deja
  -- el blob huérfano en el bucket, invisible y para siempre, ocupando espacio
  -- que se paga. Se devuelven sus rutas y el cliente las borra con la API de
  -- Storage, que sí elimina el archivo. Si esa segunda parte falla, las filas
  -- siguen ahí y la bitácora dice cuántas eran → se puede reintentar sin haber
  -- perdido nada.
  begin
    select count(*) into v_files
    from storage.objects
    where bucket_id in ('logos', 'files')
      and (storage.foldername(name))[1] = p_tenant::text;

    select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'path', name)), '[]'::jsonb)
    into v_paths
    from (
      select bucket_id, name
      from storage.objects
      where bucket_id in ('logos', 'files')
        and (storage.foldername(name))[1] = p_tenant::text
      order by bucket_id, name
      -- Tope solo para no devolver un JSON gigantesco. Está muy por encima de
      -- cualquier negocio real, y si alguna vez se pasara, `counts.files` (que
      -- NO va topado) delata la diferencia y la UI puede avisar en vez de
      -- cantar victoria.
      limit 20000
    ) f;
  exception when others then
    -- Sin privilegio sobre storage: se sigue borrando la base (que es lo que
    -- pidió el super-admin) y queda constancia de que los archivos no se tocaron.
    v_files := -1;
    v_paths := '[]'::jsonb;
  end;
  v_counts := v_counts || jsonb_build_object('files', v_files);

  -- ── El negocio ─────────────────────────────────────────────────────────
  delete from public.tenants where id = p_tenant;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('tenants', v_n);

  -- ── Cuentas de login ───────────────────────────────────────────────────
  -- Por omisión NO se borran (mismo criterio que admin_remove_member): la
  -- persona conserva su acceso y puede crear otro negocio. Con p_delete_users
  -- se borra la cuenta entera de Auth, sesiones incluidas.
  -- `cardinality` y no `array_length`: con el array vacío este devuelve 0 y
  -- aquel NULL, que convertiría el `if` en NULL en vez de en falso.
  if p_delete_users and cardinality(v_uids) > 0 then
    -- Es el único DELETE del proyecto contra el esquema `auth`. Si al rol de la
    -- función le faltara el privilegio, sin este bloque el error tumbaría TODO
    -- el borrado y el negocio quedaría inborrable cada vez que se marque la
    -- casilla. Se anota -1 y la UI lo dice.
    begin
      delete from auth.users where id = any(v_uids);
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object('auth_users', v_n);
    exception when insufficient_privilege then
      v_counts := v_counts || jsonb_build_object('auth_users', -1);
    end;
  end if;

  -- ── Bitácora ───────────────────────────────────────────────────────────
  insert into public.tenant_purges (
    tenant_id, tenant_name, owner_email, deleted_by, deleted_by_email,
    deleted_users, counts
  )
  values (
    p_tenant, v_t.name, v_owner, v_actor,
    (select email from auth.users where id = v_actor),
    coalesce(p_delete_users, false), v_counts
  );

  return jsonb_build_object(
    'tenant_id', p_tenant,
    'name',      v_t.name,
    'counts',    v_counts,
    -- Rutas que el cliente debe vaciar con la API de Storage (ver arriba).
    'files',     v_paths
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Equipo con roles, gestionado por el OWNER
-- ──────────────────────────────────────────────────────────────────────────
-- profiles_guard (0008) solo dejaba cambiar rol/negocio al super-admin. Ahora
-- también la Dirección cambia roles de su equipo, pero SIEMPRE por RPC: el guard
-- pasa a frenar solo la escritura DIRECTA del cliente. Dentro de una función
-- SECURITY DEFINER `current_user` es el dueño de la función, no
-- `authenticated`, así que esas RPC (todas con su propia guardia) pasan.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.auth_is_platform_admin() then
    return new;
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se permite cambiar el colegio de un perfil';
  end if;
  if new.role is distinct from old.role then
    raise exception 'No se permite cambiar el rol desde el cliente';
  end if;
  return new;
end;
$$;

-- Equipo con correo (profiles no lo guarda; vive en auth.users). Solo para
-- Dirección: es lo que necesita para saber a quién enlazar como docente.
create or replace function public.list_team_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.auth_can_manage_academics() then
    raise exception 'No autorizado';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'role', p.role,
             'email', u.email, 'created_at', p.created_at
           ) order by (p.role = 'owner') desc, p.created_at), '[]'::jsonb)
    from profiles p
    left join auth.users u on u.id = p.id
    where p.tenant_id = v_tenant
  );
end;
$$;

create or replace function public.set_member_role(p_user uuid, p_role member_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_role   member_role;
begin
  if v_tenant is null or not public.auth_is_owner() then
    raise exception 'Solo la Dirección (dueño de la cuenta) puede cambiar roles';
  end if;
  if p_user = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol';
  end if;
  if p_role = 'owner' then
    raise exception 'La propiedad de la cuenta se transfiere desde soporte de ArreSchool';
  end if;
  perform pg_advisory_xact_lock(hashtext('arreschool_owner:' || v_tenant::text));
  select role into v_role from profiles where id = p_user and tenant_id = v_tenant;
  if not found then
    raise exception 'Usuario no encontrado en tu colegio';
  end if;
  if v_role = 'owner' then
    raise exception 'No puedes cambiar el rol de otro dueño';
  end if;

  update profiles set role = p_role where id = p_user;
  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'member.role', 'profiles', p_user,
          jsonb_build_object('from', v_role, 'to', p_role));
end;
$$;

create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_role   member_role;
begin
  if v_tenant is null or not public.auth_is_owner() then
    raise exception 'Solo la Dirección (dueño de la cuenta) puede quitar usuarios';
  end if;
  if p_user = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo';
  end if;
  perform pg_advisory_xact_lock(hashtext('arreschool_owner:' || v_tenant::text));
  select role into v_role from profiles where id = p_user and tenant_id = v_tenant;
  if not found then
    raise exception 'Usuario no encontrado en tu colegio';
  end if;
  if v_role = 'owner' then
    raise exception 'No puedes quitar a otro dueño';
  end if;

  -- La ficha de docente se conserva (es historia del colegio); solo se suelta
  -- el enlace con la cuenta que ya no pertenece al equipo.
  update teachers set user_id = null where tenant_id = v_tenant and user_id = p_user;
  delete from profiles where id = p_user;
  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'member.remove', 'profiles', p_user, jsonb_build_object('role', v_role));
end;
$$;

-- create_invite: copia de la versión de 0009 (con su guardia de suspensión, ver
-- el aviso allí) + rechazo del rol 'owner'. Invitar a alguien como dueño le
-- daría plan, equipo y borrado del colegio con un enlace que se reenvía por
-- WhatsApp: la propiedad no viaja por invitación.
create or replace function public.create_invite(
  p_role member_role default 'admin',
  p_email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_role   member_role;
  v_plan   plan_code;
  v_max    integer;
  v_name   text;
  v_code   text;
begin
  select tenant_id, role into v_tenant, v_role from profiles where id = v_uid;
  if v_tenant is null then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from tenants where id = v_tenant and suspended_at is not null) then
    raise exception 'CUENTA_SUSPENDIDA: Este colegio está suspendido. Contacta al administrador de la plataforma.';
  end if;
  if v_role <> 'owner' then
    raise exception 'Solo la Dirección (dueño de la cuenta) puede invitar a otras personas';
  end if;
  if p_role = 'owner' then
    raise exception 'No se puede invitar con rol de dueño; elige otro rol';
  end if;

  select plan into v_plan from subscriptions where tenant_id = v_tenant;
  v_plan := coalesce(v_plan, 'basic');

  select ps.max_members, ps.name into v_max, v_name
  from plan_settings ps where ps.plan = v_plan;
  if not found then
    v_max  := case when v_plan = 'basic' then 1 else null end;
    v_name := v_plan::text;
  end if;

  if v_max is not null and v_max <= 1 then
    raise exception 'PLAN_LIMIT_MEMBERS: El plan % es de un solo usuario. Actualiza tu plan para invitar a más personas.', v_name;
  end if;

  insert into tenant_invites (tenant_id, role, email, created_by)
  values (v_tenant, coalesce(p_role, 'admin'), nullif(trim(p_email), ''), v_uid)
  returning code into v_code;

  return v_code;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Permisos de ejecución
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  fns text[] := array[
    'public.admin_update_plan(plan_code, text, numeric, numeric, integer, integer, boolean, text[], boolean, boolean, integer)',
    'public.admin_overview()',
    'public.admin_list_tenants()',
    'public.admin_tenant_summary(uuid)',
    'public.admin_tenant_purge_preview(uuid)',
    'public.admin_delete_tenant(uuid, text, boolean)',
    'public.list_team_members()',
    'public.set_member_role(uuid, member_role)',
    'public.remove_member(uuid)',
    'public.create_invite(member_role, text)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.profiles_guard() from public, anon;

notify pgrst, 'reload schema';
