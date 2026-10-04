-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0013 · Estructura del colegio (períodos, grados, secciones, docentes)
-- ═══════════════════════════════════════════════════════════════════════════
-- Primera capa del dominio: lo que un colegio configura UNA vez al año antes de
-- inscribir a nadie. Flujo: período académico → grados → secciones → docentes.
--
-- Tres decisiones de modelo que valen para todo el dominio (0013-0017):
--
-- 1) FOREIGN KEYS COMPUESTAS (tenant_id, x_id). Cada tabla expone
--    `unique (tenant_id, id)` y sus hijas la referencian con las DOS columnas.
--    Así es IMPOSIBLE, por construcción, que una sección apunte al período de
--    otro colegio o un pago al estudiante de otro colegio: la base lo rechaza
--    aunque la RLS, una RPC definer o una Edge Function con service_role se
--    equivoquen. El patrón de `enforce_item_consistency` (comprobar cada FK en
--    un trigger) hacía lo mismo con más código y con huecos al olvidarse una.
--
-- 2) EL TENANT NUNCA VIENE DEL CLIENTE. `tenant_id` lleva `default
--    auth_tenant_id()` (el cliente ni lo manda) y `enforce_tenant_row()` rechaza
--    cualquier valor distinto del colegio de quien escribe, en INSERT y UPDATE.
--
-- 3) PERMISOS POR ROL EN LA BASE. Los predicados `auth_can_*()` resumen la
--    matriz de roles de 0012; las políticas los usan y la UI los replica en
--    src/lib/permissions.ts solo para no enseñar botones que fallarían.
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Datos del colegio que el starter no tenía
-- ──────────────────────────────────────────────────────────────────────────
-- El tenant ES el colegio. Lo que sale impreso en recibos y boletines vive aquí.
alter table public.tenants add column if not exists legal_id        text;  -- RNC / registro
alter table public.tenants add column if not exists principal_name  text;  -- firma del boletín
alter table public.tenants add column if not exists receipt_footer  text;  -- pie del recibo

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Predicados de rol (cimiento de las políticas del dominio)
-- ──────────────────────────────────────────────────────────────────────────
-- Todos `stable security definer` con search_path fijo, igual que
-- auth_tenant_id(): leen profiles desde dentro de políticas y sin definer
-- caerían en la RLS de profiles. Devuelven false (nunca NULL) para quien no
-- tiene colegio, porque un `not f()` con NULL en plpgsql no es falso.
create or replace function public.auth_role()
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and tenant_id is not null
$$;

create or replace function public.auth_has_role(p_roles member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = any (p_roles) from public.profiles where id = auth.uid() and tenant_id is not null),
    false
  )
$$;

-- Nombres de negocio para las combinaciones que usan las políticas. Leer
-- `auth_can_manage_students()` en una política dice qué se protege; leer un
-- array de roles obliga a reconstruir la intención.
create or replace function public.auth_can_manage_academics()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_role(array['owner', 'admin']::member_role[])
$$;

create or replace function public.auth_can_manage_students()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_role(array['owner', 'admin', 'secretary']::member_role[])
$$;

-- Caja: ver cuentas, crear cargos y cobrar. La secretaría entra porque en un
-- colegio pequeño es quien recibe el dinero en la puerta.
create or replace function public.auth_can_handle_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_role(array['owner', 'admin', 'accountant', 'secretary']::member_role[])
$$;

-- Configurar conceptos y ANULAR: lo que mueve dinero ya registrado.
create or replace function public.auth_can_manage_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_has_role(array['owner', 'admin', 'accountant']::member_role[])
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Trigger genérico de tenant (reemplaza el patrón por-tabla de items)
-- ──────────────────────────────────────────────────────────────────────────
-- INVOKER a propósito (como enforce_item_consistency): evalúa auth_tenant_id()
-- con el JWT del llamador real. Dentro de una RPC definer auth.uid() sigue
-- siendo el del llamador, así que también vigila a las RPC.
create or replace function public.enforce_tenant_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sin JWT: dueño de la base, migración o service_role (ver 0005).
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se permite mover un registro a otro colegio';
  end if;
  if new.tenant_id is distinct from public.auth_tenant_id() then
    raise exception 'El registro no pertenece a tu colegio';
  end if;
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) setup_tenant_table() — las "cuatro cosas" de CLAUDE.md en una llamada
-- ──────────────────────────────────────────────────────────────────────────
-- Cada tabla del dominio necesita lo mismo: RLS, revoke a anon, cuatro
-- políticas por tenant (+ predicado de rol), lectura del super-admin, trigger
-- de tenant, bloqueo por suspensión y updated_at. Escribirlo a mano 17 veces es
-- la forma de que a una le falte justo la mitad que importa.
--
-- p_read / p_write son predicados SQL que se AÑADEN a `tenant_id =
-- auth_tenant_id()`; 'true' = cualquier miembro del colegio. Las tablas con
-- reglas especiales (docentes por sección) reemplazan después la política que
-- toque con un `drop policy` + `create policy` explícito.
--
-- Es una herramienta de MIGRACIÓN: nadie la llama desde el cliente (revoke).
create or replace function public.setup_tenant_table(p_table text, p_read text, p_write text)
returns void
language plpgsql
set search_path = public
as $$
declare
  r text := format('tenant_id = public.auth_tenant_id() and (%s)', p_read);
  w text := format('tenant_id = public.auth_tenant_id() and (%s)', p_write);
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('revoke all on public.%I from anon', p_table);

  execute format('drop policy if exists %I on public.%I', p_table || '_select', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (%s)',
                 p_table || '_select', p_table, r);
  execute format('drop policy if exists %I on public.%I', p_table || '_insert', p_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                 p_table || '_insert', p_table, w);
  execute format('drop policy if exists %I on public.%I', p_table || '_update', p_table);
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                 p_table || '_update', p_table, w, w);
  execute format('drop policy if exists %I on public.%I', p_table || '_delete', p_table);
  execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                 p_table || '_delete', p_table, w);

  -- Lectura cross-tenant del super-admin: PERMISIVA y SOLO SELECT (0007).
  execute format('drop policy if exists %I on public.%I', p_table || '_platform_select', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated '
    || 'using (public.auth_is_platform_admin() and public.auth_tenant_id() is null)',
    p_table || '_platform_select', p_table);

  execute format('drop trigger if exists trg_tenant_row on public.%I', p_table);
  execute format('create trigger trg_tenant_row before insert or update on public.%I '
                 || 'for each row execute function public.enforce_tenant_row()', p_table);

  execute format('drop trigger if exists trg_block_suspended on public.%I', p_table);
  execute format('create trigger trg_block_suspended before insert or update or delete on public.%I '
                 || 'for each row execute function public.block_write_if_tenant_suspended()', p_table);

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = p_table and column_name = 'updated_at') then
    execute format('drop trigger if exists trg_updated on public.%I', p_table);
    execute format('create trigger trg_updated before update on public.%I '
                   || 'for each row execute function public.set_updated_at()', p_table);
  end if;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Contadores por colegio (matrícula, número de recibo)
-- ──────────────────────────────────────────────────────────────────────────
-- Una secuencia de Postgres es global: el recibo 1 del Colegio B sería el 37 si
-- antes cobró el Colegio A, y los huecos delatarían la actividad de otros. Un
-- contador por (tenant, clave) con UPSERT bloquea solo la fila de ese colegio.
-- Sin políticas: solo lo tocan funciones definer.
create table if not exists public.tenant_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key       text not null,
  value     bigint not null default 0,
  primary key (tenant_id, key)
);
alter table public.tenant_counters enable row level security;
revoke all on public.tenant_counters from anon, authenticated;

create or replace function public.next_counter(p_tenant uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  insert into tenant_counters as c (tenant_id, key, value)
  values (p_tenant, p_key, 1)
  on conflict (tenant_id, key) do update set value = c.value + 1
  returning c.value into v;
  return v;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6) academic_periods — el año escolar
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.academic_periods (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.auth_tenant_id()
             references public.tenants (id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  starts_on  date not null,
  ends_on    date not null,
  status     period_status not null default 'planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_periods_dates check (ends_on > starts_on),
  constraint academic_periods_tenant_id_key unique (tenant_id, id),
  constraint academic_periods_name_key unique (tenant_id, name)
);
create index if not exists academic_periods_tenant_idx on public.academic_periods (tenant_id, starts_on desc);
-- UN solo año activo por colegio: "el año en curso" es la referencia por
-- defecto de inscripciones, asistencia y cargos, y con dos no habría respuesta.
create unique index if not exists academic_periods_one_active
  on public.academic_periods (tenant_id) where status = 'active';

-- ──────────────────────────────────────────────────────────────────────────
-- 7) grading_terms — cortes de evaluación dentro del año (trimestres…)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.grading_terms (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.auth_tenant_id()
                     references public.tenants (id) on delete cascade,
  academic_period_id uuid not null,
  name               text not null check (btrim(name) <> ''),
  sort_order         integer not null default 1,
  starts_on          date,
  ends_on            date,
  -- Cerrado = sus evaluaciones quedan congeladas (las publica el boletín).
  is_closed          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint grading_terms_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint grading_terms_tenant_id_key unique (tenant_id, id),
  -- Destino de la FK compuesta de assessments: garantiza que el corte es del
  -- MISMO año que la inscripción evaluada.
  constraint grading_terms_period_key unique (tenant_id, academic_period_id, id),
  constraint grading_terms_name_key unique (tenant_id, academic_period_id, name),
  constraint grading_terms_period_fk foreign key (tenant_id, academic_period_id)
    references public.academic_periods (tenant_id, id) on delete cascade
);
create index if not exists grading_terms_period_idx on public.grading_terms (tenant_id, academic_period_id, sort_order);

-- ──────────────────────────────────────────────────────────────────────────
-- 8) grade_levels — los grados (Maternal, Pre-Kinder, Kinder, Preprimario…)
-- ──────────────────────────────────────────────────────────────────────────
-- NO dependen del período: el grado "Kinder" es el mismo año tras año, y eso es
-- lo que permite promover (Pre-Kinder → Kinder) siguiendo sort_order.
create table if not exists public.grade_levels (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.auth_tenant_id()
                  references public.tenants (id) on delete cascade,
  name            text not null check (btrim(name) <> ''),
  education_level education_level not null default 'initial',
  sort_order      integer not null default 1,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint grade_levels_tenant_id_key unique (tenant_id, id),
  constraint grade_levels_name_key unique (tenant_id, name)
);
create index if not exists grade_levels_tenant_idx on public.grade_levels (tenant_id, sort_order);

-- ──────────────────────────────────────────────────────────────────────────
-- 9) teachers — el personal docente
-- ──────────────────────────────────────────────────────────────────────────
-- Una ficha de docente NO es un usuario: muchos colegios registran a su
-- personal sin darle acceso. `user_id` la enlaza opcionalmente a la cuenta con
-- rol 'teacher' que la usa (ArreSchool Teacher); de ese enlace sale qué
-- secciones puede calificar.
create table if not exists public.teachers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.auth_tenant_id()
              references public.tenants (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  first_name  text not null check (btrim(first_name) <> ''),
  last_name   text not null check (btrim(last_name) <> ''),
  document_id text,
  email       text,
  phone       text,
  specialty   text,
  hired_on    date,
  status      staff_status not null default 'active',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teachers_tenant_id_key unique (tenant_id, id),
  -- Una cuenta = una ficha por colegio; si no, ¿de cuál salen sus secciones?
  constraint teachers_user_key unique (tenant_id, user_id)
);
create index if not exists teachers_tenant_idx on public.teachers (tenant_id, last_name, first_name);
create index if not exists teachers_user_idx on public.teachers (user_id);

-- La cuenta enlazada tiene que ser de ESTE colegio. Sin esto, una directora
-- podría enlazar el uuid de un usuario ajeno y regalarle (vía
-- auth_teaches_section) permisos de escritura sobre sus secciones.
create or replace function public.teachers_check_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from profiles where id = new.user_id and tenant_id = new.tenant_id
  ) then
    raise exception 'La cuenta enlazada no pertenece a este colegio';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_teachers_check_user on public.teachers;
create trigger trg_teachers_check_user before insert or update of user_id, tenant_id on public.teachers
  for each row execute function public.teachers_check_user();

-- ──────────────────────────────────────────────────────────────────────────
-- 10) sections — un grupo concreto de un grado en un año ("Kinder A 2026-27")
-- ──────────────────────────────────────────────────────────────────────────
-- Pertenecen al período: así el historial dice "estuvo en Kinder A del año X"
-- aunque al año siguiente Kinder A sea otra gente con otra maestra.
create table if not exists public.sections (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.auth_tenant_id()
                     references public.tenants (id) on delete cascade,
  academic_period_id uuid not null,
  grade_level_id     uuid not null,
  name               text not null check (btrim(name) <> ''),
  capacity           integer check (capacity is null or capacity > 0),
  room               text,
  shift              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sections_tenant_id_key unique (tenant_id, id),
  -- Destino de la FK de enrollments: una inscripción solo puede ir a una
  -- sección de SU año y SU grado. Declarativo, sin trigger.
  constraint sections_placement_key unique (tenant_id, academic_period_id, grade_level_id, id),
  constraint sections_name_key unique (tenant_id, academic_period_id, grade_level_id, name),
  constraint sections_period_fk foreign key (tenant_id, academic_period_id)
    references public.academic_periods (tenant_id, id) on delete restrict,
  constraint sections_grade_fk foreign key (tenant_id, grade_level_id)
    references public.grade_levels (tenant_id, id) on delete restrict
);
create index if not exists sections_period_idx on public.sections (tenant_id, academic_period_id);
create index if not exists sections_grade_idx on public.sections (tenant_id, grade_level_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 11) section_teachers — quién da clase en cada sección
-- ──────────────────────────────────────────────────────────────────────────
-- Tabla y no una columna `teacher_id` en sections: en inicial hay titular y
-- auxiliar, y en primaria/secundaria habrá un docente por materia.
create table if not exists public.section_teachers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.auth_tenant_id()
             references public.tenants (id) on delete cascade,
  section_id uuid not null,
  teacher_id uuid not null,
  role       text not null default 'lead' check (role in ('lead', 'assistant', 'subject')),
  subject    text,
  created_at timestamptz not null default now(),
  constraint section_teachers_unique unique (section_id, teacher_id),
  constraint section_teachers_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete cascade,
  constraint section_teachers_teacher_fk foreign key (tenant_id, teacher_id)
    references public.teachers (tenant_id, id) on delete cascade
);
create index if not exists section_teachers_tenant_idx on public.section_teachers (tenant_id);
create index if not exists section_teachers_teacher_idx on public.section_teachers (tenant_id, teacher_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 12) auth_teaches_section() — ¿la persona conectada da clase en esa sección?
-- ──────────────────────────────────────────────────────────────────────────
-- Es la regla que separa a una docente de las demás secciones: puede LEER todo
-- lo académico, pero solo escribe asistencia y evaluaciones de las suyas.
-- Dirección y secretaría pasan siempre (cubren ausencias).
create or replace function public.auth_teaches_section(p_section uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_can_manage_students()
      or exists (
        select 1
        from public.section_teachers st
        join public.teachers t on t.tenant_id = st.tenant_id and t.id = st.teacher_id
        where st.section_id = p_section
          and st.tenant_id = public.auth_tenant_id()
          and t.user_id = auth.uid()
          and t.status = 'active'
      )
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 13) RLS: lectura para todo el colegio, configuración para Dirección
-- ──────────────────────────────────────────────────────────────────────────
select public.setup_tenant_table('academic_periods', 'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('grading_terms',    'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('grade_levels',     'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('teachers',         'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('sections',         'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('section_teachers', 'true', 'public.auth_can_manage_academics()');

-- ──────────────────────────────────────────────────────────────────────────
-- 14) Permisos de ejecución (convención de 0002: `from public, anon`)
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  fns text[] := array[
    'public.auth_role()',
    'public.auth_has_role(member_role[])',
    'public.auth_can_manage_academics()',
    'public.auth_can_manage_students()',
    'public.auth_can_handle_finance()',
    'public.auth_can_manage_finance()',
    'public.auth_teaches_section(uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Herramientas internas: ni el cliente ni anon las invocan nunca.
revoke all on function public.setup_tenant_table(text, text, text) from public, anon, authenticated;
revoke all on function public.next_counter(uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_tenant_row() from public, anon;
revoke all on function public.teachers_check_user() from public, anon;
