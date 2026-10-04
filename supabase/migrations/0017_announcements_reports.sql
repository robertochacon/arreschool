-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0017 · Comunicados, cierre de año, panel y reportes
-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que cierra el círculo del flujo del colegio:
--   • Comunicados para todo el colegio, un grado o una sección.
--   • Activar y CERRAR un año escolar, y promover a los estudiantes al
--     siguiente grado: es lo que mantiene correcto el historial año tras año.
--   • dashboard_summary() reescrita para el colegio (sustituye la de items).
--   • Reportes como RPC de una sola llamada.
--
-- Los reportes son SECURITY INVOKER: corren con la RLS de quien los pide, así
-- que un reporte nunca puede enseñar más de lo que esa persona ya puede leer
-- fila a fila (una docente que pide ingresos recibe ceros, no los de caja).
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1) announcements — comunicados
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  title          text not null check (btrim(title) <> ''),
  body           text not null check (btrim(body) <> ''),
  audience       announcement_audience not null default 'all',
  grade_level_id uuid,
  section_id     uuid,
  pinned         boolean not null default false,
  published_at   timestamptz not null default now(),
  expires_on     date,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- La audiencia y sus columnas tienen que cuadrar: un comunicado "para la
  -- sección" sin sección no le llegaría a nadie.
  constraint announcements_audience check (
       (audience = 'all'         and grade_level_id is null and section_id is null)
    or (audience = 'grade_level' and grade_level_id is not null and section_id is null)
    or (audience = 'section'     and section_id is not null)
  ),
  constraint announcements_grade_fk foreign key (tenant_id, grade_level_id)
    references public.grade_levels (tenant_id, id) on delete cascade,
  constraint announcements_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete cascade
);
create index if not exists announcements_tenant_idx on public.announcements (tenant_id, published_at desc);
create index if not exists announcements_section_idx on public.announcements (tenant_id, section_id);
create index if not exists announcements_grade_idx on public.announcements (tenant_id, grade_level_id);
create index if not exists announcements_created_by_idx on public.announcements (created_by);

-- Secretaría y Dirección publican a quien quieran; una docente, solo a sus
-- secciones.
select public.setup_tenant_table(
  'announcements', 'true',
  'public.auth_can_manage_students() or (section_id is not null and public.auth_teaches_section(section_id))'
);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Ciclo de vida del año escolar
-- ──────────────────────────────────────────────────────────────────────────
-- Activar: uno solo a la vez (lo exige también el índice parcial de 0013); la
-- RPC existe para dar el mensaje claro en vez de un 23505.
create or replace function public.activate_academic_period(p_period uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_other  text;
  v_status period_status;
begin
  if v_tenant is null or not public.auth_can_manage_academics() then
    raise exception 'No autorizado';
  end if;
  select status into v_status from academic_periods where tenant_id = v_tenant and id = p_period;
  if not found then
    raise exception 'Año escolar no encontrado';
  end if;
  if v_status = 'closed' then
    raise exception 'PERIODO_CERRADO: Ese año escolar ya está cerrado y no se puede reactivar.';
  end if;
  select name into v_other from academic_periods
  where tenant_id = v_tenant and status = 'active' and id <> p_period;
  if v_other is not null then
    raise exception 'PERIODO_ACTIVO: Ya hay un año activo (%). Ciérralo antes de activar otro.', v_other;
  end if;
  update academic_periods set status = 'active' where id = p_period;
end;
$$;

-- Cerrar: pone el estado FINAL a cada inscripción y congela el año.
--   enrolled → promoted  (si existe un grado siguiente por sort_order)
--   enrolled → completed (último grado: el estudiante pasa a 'graduated')
--   withdrawn / retained → se respetan (los marca Secretaría antes de cerrar)
-- Todos los cortes quedan cerrados. Después de esto, enrollments_guard y
-- classroom_row_guard impiden cualquier cambio en ese año.
create or replace function public.close_academic_period(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_tenant    uuid := public.auth_tenant_id();
  v_per       academic_periods;
  v_promoted  integer;
  v_completed integer;
begin
  if v_tenant is null or not public.auth_can_manage_academics() then
    raise exception 'No autorizado';
  end if;
  select * into v_per from academic_periods where tenant_id = v_tenant and id = p_period for update;
  if not found then
    raise exception 'Año escolar no encontrado';
  end if;
  if v_per.status = 'closed' then
    raise exception 'Ese año escolar ya estaba cerrado';
  end if;

  with nexts as (
    select e.id,
           exists (select 1 from grade_levels g2
                   where g2.tenant_id = g.tenant_id and g2.active
                     and g2.sort_order > g.sort_order) as has_next
    from enrollments e
    join grade_levels g on g.tenant_id = e.tenant_id and g.id = e.grade_level_id
    where e.tenant_id = v_tenant and e.academic_period_id = p_period and e.status = 'enrolled'
  )
  update enrollments e
  set status   = case when n.has_next then 'promoted'::enrollment_status else 'completed'::enrollment_status end,
      ended_on = coalesce(e.ended_on, least(v_per.ends_on, current_date))
  from nexts n
  where e.id = n.id;

  select count(*) filter (where status = 'promoted'), count(*) filter (where status = 'completed')
  into v_promoted, v_completed
  from enrollments where tenant_id = v_tenant and academic_period_id = p_period;

  update students s set status = 'graduated'
  from enrollments e
  where e.tenant_id = v_tenant and e.academic_period_id = p_period and e.status = 'completed'
    and s.tenant_id = e.tenant_id and s.id = e.student_id and s.status = 'active';

  update grading_terms set is_closed = true where tenant_id = v_tenant and academic_period_id = p_period;
  update academic_periods set status = 'closed' where id = p_period;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'period.close', 'academic_periods', p_period,
          jsonb_build_object('promoted', v_promoted, 'completed', v_completed));

  return jsonb_build_object('promoted', v_promoted, 'completed', v_completed);
end;
$$;

-- Reinscribir en el año nuevo a partir del cierre del anterior: promovidos al
-- grado siguiente, repitentes al mismo. Sin sección (se asigna después). Quien
-- ya tiene inscripción en el año destino se salta.
create or replace function public.promote_students(p_from_period uuid, p_to_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_tenant  uuid := public.auth_tenant_id();
  v_created integer;
  v_total   integer;
begin
  if v_tenant is null or not public.auth_can_manage_academics() then
    raise exception 'No autorizado';
  end if;
  if p_from_period = p_to_period then
    raise exception 'Elige un año destino distinto';
  end if;
  if not exists (select 1 from academic_periods where tenant_id = v_tenant and id = p_from_period and status = 'closed') then
    raise exception 'Primero cierra el año de origen';
  end if;
  if not exists (select 1 from academic_periods where tenant_id = v_tenant and id = p_to_period and status <> 'closed') then
    raise exception 'El año destino no existe o ya está cerrado';
  end if;

  select count(*) into v_total from enrollments
  where tenant_id = v_tenant and academic_period_id = p_from_period and status in ('promoted', 'retained');

  insert into enrollments (tenant_id, student_id, academic_period_id, grade_level_id, created_by)
  select v_tenant, e.student_id, p_to_period,
         case when e.status = 'retained' then e.grade_level_id
              else (select g2.id from grade_levels g2
                    where g2.tenant_id = v_tenant and g2.active and g2.sort_order > g.sort_order
                    order by g2.sort_order limit 1) end,
         auth.uid()
  from enrollments e
  join grade_levels g on g.tenant_id = e.tenant_id and g.id = e.grade_level_id
  join students s on s.tenant_id = e.tenant_id and s.id = e.student_id and s.status = 'active'
  where e.tenant_id = v_tenant and e.academic_period_id = p_from_period
    and e.status in ('promoted', 'retained')
  on conflict (tenant_id, student_id, academic_period_id) do nothing;
  get diagnostics v_created = row_count;

  return jsonb_build_object('created', v_created, 'skipped', v_total - v_created);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) dashboard_summary() — el panel del colegio
-- ──────────────────────────────────────────────────────────────────────────
-- Reemplaza la versión de items (0002). Una sola ida y vuelta, como siempre.
-- Las cifras de dinero solo van para quien maneja finanzas: para el resto la
-- clave `finance` llega en null y la UI no pinta esas tarjetas. Ocultarlas en
-- la UI no bastaría: la RPC es definer y la vería cualquiera con `curl`.
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t        uuid := public.auth_tenant_id();
  v_period academic_periods;
  v_today  date := current_date;
begin
  if t is null then
    return '{}'::jsonb;
  end if;

  select * into v_period from academic_periods where tenant_id = t and status = 'active';

  return jsonb_build_object(
    'current_period', case when v_period.id is null then null else jsonb_build_object(
        'id', v_period.id, 'name', v_period.name,
        'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on) end,
    'students_active', (select count(*) from students where tenant_id = t and status = 'active'),
    'students_total',  (select count(*) from students where tenant_id = t),
    'enrolled',        (select count(*) from enrollments
                        where tenant_id = t and academic_period_id = v_period.id and status = 'enrolled'),
    'unassigned',      (select count(*) from enrollments
                        where tenant_id = t and academic_period_id = v_period.id
                          and status = 'enrolled' and section_id is null),
    'sections',        (select count(*) from sections where tenant_id = t and academic_period_id = v_period.id),
    'teachers_active', (select count(*) from teachers where tenant_id = t and status = 'active'),
    'guardians',       (select count(*) from guardians where tenant_id = t),
    'members',         (select count(*) from profiles where tenant_id = t),
    'birthdays_month', (select count(*) from students
                        where tenant_id = t and status = 'active' and birth_date is not null
                          and extract(month from birth_date) = extract(month from v_today)),
    'attendance_today', (
      select jsonb_build_object(
        'present',  count(*) filter (where ar.status = 'present'),
        'absent',   count(*) filter (where ar.status = 'absent'),
        'late',     count(*) filter (where ar.status = 'late'),
        'excused',  count(*) filter (where ar.status = 'excused'),
        'recorded', count(*))
      from attendance_records ar where ar.tenant_id = t and ar.date = v_today),
    'attendance_rate_30d', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where status in ('present', 'late')) / count(*), 1) end
      from attendance_records where tenant_id = t and date > v_today - 30),
    'by_grade', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'grade_level_id', g.id, 'name', g.name,
               'enrolled', (select count(*) from enrollments e
                            where e.tenant_id = t and e.academic_period_id = v_period.id
                              and e.grade_level_id = g.id and e.status = 'enrolled'),
               'capacity', (select sum(capacity) from sections s
                            where s.tenant_id = t and s.academic_period_id = v_period.id
                              and s.grade_level_id = g.id)
             ) order by g.sort_order, g.name), '[]'::jsonb)
      from grade_levels g where g.tenant_id = t and g.active),
    'finance', case when not public.auth_can_handle_finance() then null else jsonb_build_object(
        'receivable', (select coalesce(sum(amount - amount_paid), 0) from charges
                       where tenant_id = t and status in ('pending', 'partial')),
        'overdue',    (select coalesce(sum(amount - amount_paid), 0) from charges
                       where tenant_id = t and status in ('pending', 'partial') and due_date < v_today),
        'students_overdue', (select count(distinct student_id) from charges
                       where tenant_id = t and status in ('pending', 'partial') and due_date < v_today),
        'collected_month', (select coalesce(sum(amount), 0) from payments
                       where tenant_id = t and status = 'valid'
                         and paid_on >= date_trunc('month', v_today)::date),
        'collected_today', (select coalesce(sum(amount), 0) from payments
                       where tenant_id = t and status = 'valid' and paid_on = v_today),
        'payments_today',  (select count(*) from payments
                       where tenant_id = t and status = 'valid' and paid_on = v_today)
      ) end
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Reportes (SECURITY INVOKER: la RLS de quien pregunta manda)
-- ──────────────────────────────────────────────────────────────────────────
-- Asistencia por estudiante en un rango, opcionalmente de una sección.
create or replace function public.report_attendance(p_from date, p_to date, p_section uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r->>'section_name', r->>'last_name', r->>'first_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'enrollment_id', e.id,
      'student_id',    s.id,
      'first_name',    s.first_name,
      'last_name',     s.last_name,
      'section_name',  g.name || ' ' || sc.name,
      'present',       count(ar.id) filter (where ar.status = 'present'),
      'absent',        count(ar.id) filter (where ar.status = 'absent'),
      'late',          count(ar.id) filter (where ar.status = 'late'),
      'excused',       count(ar.id) filter (where ar.status = 'excused'),
      'total',         count(ar.id),
      'rate',          case when count(ar.id) = 0 then null else
                         round(100.0 * count(ar.id) filter (where ar.status in ('present', 'late')) / count(ar.id), 1) end
    ) as r
    from attendance_records ar
    join enrollments e on e.tenant_id = ar.tenant_id and e.id = ar.enrollment_id
    join students s on s.tenant_id = e.tenant_id and s.id = e.student_id
    join sections sc on sc.tenant_id = ar.tenant_id and sc.id = ar.section_id
    join grade_levels g on g.tenant_id = sc.tenant_id and g.id = sc.grade_level_id
    where ar.tenant_id = public.auth_tenant_id()
      and ar.date between p_from and p_to
      and (p_section is null or ar.section_id = p_section)
    group by e.id, s.id, s.first_name, s.last_name, g.name, sc.name
  ) x
$$;

-- Ingresos en un rango: total y desgloses por método, concepto y día.
create or replace function public.report_income(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with pay as (
    select * from payments
    where tenant_id = public.auth_tenant_id() and status = 'valid' and paid_on between p_from and p_to
  )
  select jsonb_build_object(
    'total',  (select coalesce(sum(amount), 0) from pay),
    'count',  (select count(*) from pay),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', n)
                                            order by total desc), '[]'::jsonb)
                  from (select method, sum(amount) total, count(*) n from pay group by method) m),
    'by_concept', (select coalesce(jsonb_agg(jsonb_build_object('concept', concept, 'total', total)
                                             order by total desc), '[]'::jsonb)
                   from (select coalesce(fc.name, 'Sin concepto') concept, sum(a.amount) total
                         from pay
                         join payment_allocations a on a.tenant_id = pay.tenant_id and a.payment_id = pay.id
                         join charges c on c.tenant_id = a.tenant_id and c.id = a.charge_id
                         left join fee_concepts fc on fc.tenant_id = c.tenant_id and fc.id = c.fee_concept_id
                         group by 1) cpt),
    'unallocated', (select coalesce(sum(pay.amount), 0) - coalesce((
                      select sum(a.amount) from payment_allocations a
                      where a.payment_id in (select id from pay)), 0) from pay),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('date', paid_on, 'total', total) order by paid_on), '[]'::jsonb)
               from (select paid_on, sum(amount) total from pay group by paid_on) d)
  )
$$;

-- Matrícula de un año: por grado y sección, con capacidad y género.
create or replace function public.report_enrollment(p_period uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by sort_order, section_name nulls first), '[]'::jsonb)
  from (
    select g.sort_order, sc.name as section_name,
           jsonb_build_object(
             'grade_level_id', g.id,
             'grade_name',     g.name,
             'section_id',     sc.id,
             'section_name',   sc.name,
             'capacity',       sc.capacity,
             'enrolled',       count(e.id) filter (where e.status = 'enrolled'),
             'withdrawn',      count(e.id) filter (where e.status = 'withdrawn'),
             'female',         count(e.id) filter (where e.status = 'enrolled' and s.gender = 'F'),
             'male',           count(e.id) filter (where e.status = 'enrolled' and s.gender = 'M')
           ) as r
    from enrollments e
    join grade_levels g on g.tenant_id = e.tenant_id and g.id = e.grade_level_id
    join students s on s.tenant_id = e.tenant_id and s.id = e.student_id
    left join sections sc on sc.tenant_id = e.tenant_id and sc.id = e.section_id
    where e.tenant_id = public.auth_tenant_id() and e.academic_period_id = p_period
    group by g.id, g.name, g.sort_order, sc.id, sc.name, sc.capacity
  ) x
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Permisos de ejecución
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  fns text[] := array[
    'public.activate_academic_period(uuid)',
    'public.close_academic_period(uuid)',
    'public.promote_students(uuid, uuid)',
    'public.dashboard_summary()',
    'public.report_attendance(date, date, uuid)',
    'public.report_income(date, date)',
    'public.report_enrollment(uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
