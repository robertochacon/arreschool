-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0015 · Asistencia, evaluaciones, observaciones y boletines
-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que la docente hace cada día (asistencia) y cada corte (evaluar). Todo
-- cuelga de la INSCRIPCIÓN (0014), no del estudiante, y guarda una FOTO de la
-- sección en la que estaba ese día (`section_id`): si en marzo lo cambian de
-- Kinder A a Kinder B, la asistencia de enero sigue diciendo Kinder A.
--
-- Esa misma `section_id` es la que decide quién escribe: la política usa
-- auth_teaches_section(section_id), así que una docente solo toca a su grupo.
-- La rellena un trigger a partir de la inscripción; el cliente no la elige.
--
-- Evaluación de inicial (MINERD): competencias → indicadores de logro →
-- nivel cualitativo (Logrado / En proceso / Iniciado). `score` queda listo para
-- primaria y secundaria sin otra tabla.
--
-- Boletín = FOTO congelada (`snapshot` jsonb) del corte. Generarlo copia
-- competencias, niveles, asistencia y observaciones visibles a la familia; una
-- vez publicado no cambia aunque luego se corrija un indicador o se renombre
-- una competencia. Eso es lo que hace fiable el historial.
-- ═══════════════════════════════════════════════════════════════════════════

-- Destino de las FK compuestas de assessments: una evaluación solo puede ser de
-- una inscripción del MISMO año que su corte.
do $$ begin
  alter table public.enrollments
    add constraint enrollments_period_key unique (tenant_id, id, academic_period_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) attendance_records — una marca por inscripción y día
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.auth_tenant_id()
                references public.tenants (id) on delete cascade,
  enrollment_id uuid not null,
  section_id    uuid,
  date          date not null,
  status        attendance_status not null,
  note          text,
  recorded_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- La llave natural es la que hace IDEMPOTENTE pasar lista: guardar dos veces
  -- (o reintentar desde la cola offline) actualiza la marca, no la duplica.
  constraint attendance_unique unique (enrollment_id, date),
  constraint attendance_enrollment_fk foreign key (tenant_id, enrollment_id)
    references public.enrollments (tenant_id, id) on delete cascade,
  constraint attendance_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete restrict
);
create index if not exists attendance_section_date_idx on public.attendance_records (tenant_id, section_id, date);
create index if not exists attendance_tenant_date_idx on public.attendance_records (tenant_id, date);
create index if not exists attendance_recorded_by_idx on public.attendance_records (recorded_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Competencias e indicadores (el currículo que configura Dirección)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.competencies (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  -- NULL = aplica a todos los grados (competencias transversales).
  grade_level_id uuid,
  area           text not null check (btrim(area) <> ''),
  name           text not null check (btrim(name) <> ''),
  description    text,
  sort_order     integer not null default 1,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint competencies_tenant_id_key unique (tenant_id, id),
  constraint competencies_grade_fk foreign key (tenant_id, grade_level_id)
    references public.grade_levels (tenant_id, id) on delete restrict
);
create index if not exists competencies_tenant_idx on public.competencies (tenant_id, grade_level_id, sort_order);

create table if not exists public.indicators (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.auth_tenant_id()
                references public.tenants (id) on delete cascade,
  competency_id uuid not null,
  description   text not null check (btrim(description) <> ''),
  sort_order    integer not null default 1,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint indicators_tenant_id_key unique (tenant_id, id),
  -- Cascade desde la competencia, pero las evaluaciones frenan (restrict): una
  -- competencia ya evaluada no se borra, se desactiva.
  constraint indicators_competency_fk foreign key (tenant_id, competency_id)
    references public.competencies (tenant_id, id) on delete cascade
);
create index if not exists indicators_competency_idx on public.indicators (tenant_id, competency_id, sort_order);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) assessments — el nivel de un indicador para un estudiante en un corte
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.auth_tenant_id()
                     references public.tenants (id) on delete cascade,
  enrollment_id      uuid not null,
  -- Lo rellena el trigger desde la inscripción; existe para que las FK
  -- compuestas comprueben que corte e inscripción son del mismo año.
  academic_period_id uuid not null,
  grading_term_id    uuid not null,
  indicator_id       uuid not null,
  section_id         uuid,
  level              achievement_level,
  score              numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  comment            text,
  assessed_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint assessments_has_value check (level is not null or score is not null),
  constraint assessments_unique unique (enrollment_id, grading_term_id, indicator_id),
  constraint assessments_enrollment_fk foreign key (tenant_id, enrollment_id, academic_period_id)
    references public.enrollments (tenant_id, id, academic_period_id) on delete cascade,
  constraint assessments_term_fk foreign key (tenant_id, academic_period_id, grading_term_id)
    references public.grading_terms (tenant_id, academic_period_id, id) on delete restrict,
  constraint assessments_indicator_fk foreign key (tenant_id, indicator_id)
    references public.indicators (tenant_id, id) on delete restrict,
  constraint assessments_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete restrict
);
create index if not exists assessments_term_idx on public.assessments (tenant_id, grading_term_id, section_id);
create index if not exists assessments_enrollment_idx on public.assessments (tenant_id, enrollment_id);
create index if not exists assessments_indicator_idx on public.assessments (tenant_id, indicator_id);
create index if not exists assessments_assessed_by_idx on public.assessments (assessed_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) student_observations — anecdotario
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.student_observations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.auth_tenant_id()
                    references public.tenants (id) on delete cascade,
  enrollment_id     uuid not null,
  section_id        uuid,
  grading_term_id   uuid,
  category          text not null default 'general'
                    check (category in ('academic', 'behavior', 'health', 'family', 'general')),
  body              text not null check (btrim(body) <> ''),
  -- Solo las visibles a la familia entran al boletín.
  visible_to_family boolean not null default false,
  author_id         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint observations_enrollment_fk foreign key (tenant_id, enrollment_id)
    references public.enrollments (tenant_id, id) on delete cascade,
  constraint observations_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete restrict,
  constraint observations_term_fk foreign key (tenant_id, grading_term_id)
    references public.grading_terms (tenant_id, id) on delete set null (grading_term_id)
);
create index if not exists observations_enrollment_idx on public.student_observations (tenant_id, enrollment_id);
create index if not exists observations_author_idx on public.student_observations (author_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) report_cards — boletines (foto congelada por corte)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.report_cards (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.auth_tenant_id()
                  references public.tenants (id) on delete cascade,
  enrollment_id   uuid not null,
  grading_term_id uuid not null,
  section_id      uuid,
  status          report_card_status not null default 'draft',
  snapshot        jsonb not null default '{}'::jsonb,
  general_comment text,
  generated_by    uuid default auth.uid() references auth.users (id) on delete set null,
  published_at    timestamptz,
  published_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint report_cards_unique unique (enrollment_id, grading_term_id),
  constraint report_cards_enrollment_fk foreign key (tenant_id, enrollment_id)
    references public.enrollments (tenant_id, id) on delete cascade,
  constraint report_cards_term_fk foreign key (tenant_id, grading_term_id)
    references public.grading_terms (tenant_id, id) on delete restrict,
  constraint report_cards_section_fk foreign key (tenant_id, section_id)
    references public.sections (tenant_id, id) on delete restrict
);
create index if not exists report_cards_term_idx on public.report_cards (tenant_id, grading_term_id, section_id);
create index if not exists report_cards_generated_by_idx on public.report_cards (generated_by);
create index if not exists report_cards_published_by_idx on public.report_cards (published_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Relleno de la foto de sección + guardas de período y corte
-- ──────────────────────────────────────────────────────────────────────────
-- Un solo trigger para las tres tablas "de aula". En INSERT copia la sección
-- (y el año, para assessments) de la inscripción; si el cliente mandó otra
-- sección, falla en vez de corregirla en silencio: es un bug de la pantalla.
-- En UPDATE la foto NO se mueve. En las tres, un año cerrado es intocable, y
-- en assessments también un corte cerrado.
create or replace function public.classroom_row_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid := coalesce(new.tenant_id, old.tenant_id);
  v_enr_id  uuid := coalesce(new.enrollment_id, old.enrollment_id);
  v_enr     enrollments;
  v_term    uuid;
begin
  if public.is_purging_tenant(v_tenant) then
    return coalesce(new, old);
  end if;

  select * into v_enr from enrollments
  where tenant_id = v_tenant and id = v_enr_id;
  -- Inscripción inexistente o de otro colegio: la FK compuesta la rechaza con
  -- su propio error, no hace falta adelantarse.
  if not found then
    return coalesce(new, old);
  end if;

  if exists (select 1 from academic_periods
             where tenant_id = v_enr.tenant_id and id = v_enr.academic_period_id and status = 'closed') then
    raise exception 'PERIODO_CERRADO: Ese año escolar está cerrado; su historial ya no se modifica.';
  end if;

  if tg_table_name = 'assessments' then
    v_term := coalesce(new.grading_term_id, old.grading_term_id);
    if exists (select 1 from grading_terms where tenant_id = v_enr.tenant_id and id = v_term and is_closed) then
      raise exception 'CORTE_CERRADO: Ese corte de evaluación está cerrado. Pide a Dirección que lo reabra.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_enr.section_id is null then
      raise exception 'SIN_SECCION: Asigna una sección al estudiante antes de registrar esto.';
    end if;
    if new.section_id is not null and new.section_id <> v_enr.section_id then
      raise exception 'El estudiante no pertenece a esa sección';
    end if;
    new.section_id := v_enr.section_id;
  else
    new.section_id := old.section_id;
  end if;

  if tg_table_name = 'assessments' then
    new.academic_period_id := v_enr.academic_period_id;
    -- El nivel cuenta como de quien lo puso por última vez.
    new.assessed_by := coalesce(auth.uid(), new.assessed_by);
  elsif tg_table_name = 'attendance_records' then
    if new.date > current_date then
      raise exception 'No se puede pasar lista de un día que todavía no ha llegado';
    end if;
    new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  end if;

  return new;
end;
$$;

-- Nombre con prefijo `trg_a_`: los BEFORE se disparan por orden alfabético y
-- este tiene que ir ANTES que la RLS lo evalúe (la RLS siempre va después de
-- los BEFORE) y antes que nada que lea section_id.
drop trigger if exists trg_a_classroom on public.attendance_records;
create trigger trg_a_classroom before insert or update or delete on public.attendance_records
  for each row execute function public.classroom_row_guard();
drop trigger if exists trg_a_classroom on public.assessments;
create trigger trg_a_classroom before insert or update or delete on public.assessments
  for each row execute function public.classroom_row_guard();
drop trigger if exists trg_a_classroom on public.student_observations;
create trigger trg_a_classroom before insert or update or delete on public.student_observations
  for each row execute function public.classroom_row_guard();

-- Boletín publicado = documento entregado. Solo se edita volviéndolo a borrador
-- (publish_report_cards con p_publish = false), que es una decisión de Dirección.
create or replace function public.report_cards_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'published' and new.status = 'published' and current_user in ('authenticated', 'anon') then
    raise exception 'BOLETIN_PUBLICADO: Este boletín ya se publicó. Pide a Dirección que lo devuelva a borrador para cambiarlo.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_report_cards_guard on public.report_cards;
create trigger trg_report_cards_guard before update on public.report_cards
  for each row execute function public.report_cards_guard();

-- ──────────────────────────────────────────────────────────────────────────
-- 7) RLS
-- ──────────────────────────────────────────────────────────────────────────
select public.setup_tenant_table('attendance_records',   'true', 'public.auth_teaches_section(section_id)');
select public.setup_tenant_table('competencies',         'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('indicators',           'true', 'public.auth_can_manage_academics()');
select public.setup_tenant_table('assessments',          'true', 'public.auth_teaches_section(section_id)');
select public.setup_tenant_table('student_observations', 'true', 'public.auth_teaches_section(section_id)');
select public.setup_tenant_table('report_cards',         'true', 'public.auth_teaches_section(section_id)');

-- Anecdotario: cualquiera de la sección escribe, pero cada quien edita o borra
-- SOLO lo suyo (Dirección puede con todo). Se reemplazan las dos políticas
-- genéricas.
drop policy if exists student_observations_update on public.student_observations;
create policy student_observations_update on public.student_observations
  for update to authenticated
  using (tenant_id = public.auth_tenant_id()
         and (author_id = auth.uid() or public.auth_can_manage_academics()))
  with check (tenant_id = public.auth_tenant_id() and public.auth_teaches_section(section_id));
drop policy if exists student_observations_delete on public.student_observations;
create policy student_observations_delete on public.student_observations
  for delete to authenticated
  using (tenant_id = public.auth_tenant_id()
         and (author_id = auth.uid() or public.auth_can_manage_academics()));

-- Boletines: se crean y publican SOLO por RPC (la foto la arma la base). Desde
-- el cliente únicamente se escribe el comentario general, y solo en borrador.
-- Privilegios por COLUMNA: aunque una política lo dejara pasar, un PATCH a
-- `snapshot` o `status` falla con 42501.
revoke insert, update, delete on public.report_cards from authenticated;
grant update (general_comment) on public.report_cards to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 8) save_attendance() — pasar lista de una sección en UNA llamada
-- ──────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER a propósito: corre con los permisos de quien llama, así que
-- la RLS (auth_teaches_section) y los triggers deciden igual que en un insert
-- directo. La RPC solo junta 25 upserts en una ida y vuelta —importa en el aula
-- con señal mala— y es idempotente: la cola offline puede repetirla sin miedo.
--
-- p_marks: [{ "enrollment_id": uuid, "status": attendance_status | null, "note": text }]
-- status null = borrar la marca de ese día (se marcó por error).
create or replace function public.save_attendance(p_section uuid, p_date date, p_marks jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_n integer := 0;
  v_d integer := 0;
begin
  if public.auth_tenant_id() is null then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_marks) <> 'array' then
    raise exception 'Formato de asistencia inválido';
  end if;

  delete from attendance_records ar
  using jsonb_array_elements(p_marks) m
  where ar.enrollment_id = (m->>'enrollment_id')::uuid
    and ar.date = p_date
    and coalesce(m->>'status', '') = '';
  get diagnostics v_d = row_count;

  insert into attendance_records (enrollment_id, section_id, date, status, note)
  select (m->>'enrollment_id')::uuid, p_section, p_date,
         (m->>'status')::attendance_status, nullif(btrim(m->>'note'), '')
  from jsonb_array_elements(p_marks) m
  where coalesce(m->>'status', '') <> ''
  on conflict (enrollment_id, date) do update
    set status = excluded.status, note = excluded.note;
  get diagnostics v_n = row_count;

  return v_n + v_d;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 9) save_assessments() — calificar a un estudiante en un corte
-- ──────────────────────────────────────────────────────────────────────────
-- Mismo criterio que save_attendance: INVOKER, idempotente, RLS al mando.
-- p_marks: [{ "indicator_id": uuid, "level": achievement_level | null,
--             "score": number | null, "comment": text }]
-- level y score vacíos = quitar la evaluación de ese indicador.
create or replace function public.save_assessments(p_enrollment uuid, p_term uuid, p_marks jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_period uuid;
  v_n integer := 0;
  v_d integer := 0;
begin
  if public.auth_tenant_id() is null then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_marks) <> 'array' then
    raise exception 'Formato de evaluación inválido';
  end if;

  -- La RLS ya filtra por colegio: si no se ve, para esta persona no existe.
  select academic_period_id into v_period from enrollments where id = p_enrollment;
  if v_period is null then
    raise exception 'Inscripción no encontrada';
  end if;

  delete from assessments a
  using jsonb_array_elements(p_marks) m
  where a.enrollment_id = p_enrollment
    and a.grading_term_id = p_term
    and a.indicator_id = (m->>'indicator_id')::uuid
    and coalesce(m->>'level', '') = ''
    and coalesce(m->>'score', '') = '';
  get diagnostics v_d = row_count;

  insert into assessments (enrollment_id, academic_period_id, grading_term_id, indicator_id, level, score, comment)
  select p_enrollment, v_period, p_term, (m->>'indicator_id')::uuid,
         nullif(m->>'level', '')::achievement_level,
         nullif(m->>'score', '')::numeric,
         nullif(btrim(m->>'comment'), '')
  from jsonb_array_elements(p_marks) m
  where coalesce(m->>'level', '') <> '' or coalesce(m->>'score', '') <> ''
  on conflict (enrollment_id, grading_term_id, indicator_id) do update
    set level = excluded.level, score = excluded.score, comment = excluded.comment;
  get diagnostics v_n = row_count;

  return v_n + v_d;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 10) build_report_card_snapshot() — la foto de un boletín
-- ──────────────────────────────────────────────────────────────────────────
-- Interna (sin grant): la llaman generate_report_cards y nadie más. Todo lo que
-- el boletín imprime sale de aquí, incluidos los datos del colegio: si mañana
-- cambia el nombre de la directora, los boletines ya entregados no cambian.
create or replace function public.build_report_card_snapshot(p_enrollment uuid, p_term uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enr  enrollments;
  v_term grading_terms;
  v_per  academic_periods;
  v_from date;
  v_to   date;
begin
  select * into v_enr from enrollments where id = p_enrollment;
  select * into v_term from grading_terms where tenant_id = v_enr.tenant_id and id = p_term;
  select * into v_per from academic_periods where tenant_id = v_enr.tenant_id and id = v_enr.academic_period_id;
  v_from := coalesce(v_term.starts_on, v_per.starts_on);
  v_to   := coalesce(v_term.ends_on, v_per.ends_on);

  return jsonb_build_object(
    'school', (select jsonb_build_object('name', t.name, 'logo_url', t.logo_url, 'address', t.address,
                                         'phone', t.phone, 'principal_name', t.principal_name)
               from tenants t where t.id = v_enr.tenant_id),
    'student', (select jsonb_build_object('id', s.id, 'code', s.code, 'first_name', s.first_name,
                                          'last_name', s.last_name, 'birth_date', s.birth_date)
                from students s where s.tenant_id = v_enr.tenant_id and s.id = v_enr.student_id),
    'period',  jsonb_build_object('name', v_per.name, 'starts_on', v_per.starts_on, 'ends_on', v_per.ends_on),
    'term',    jsonb_build_object('name', v_term.name, 'starts_on', v_term.starts_on, 'ends_on', v_term.ends_on),
    'grade',   (select jsonb_build_object('name', g.name, 'education_level', g.education_level)
                from grade_levels g where g.tenant_id = v_enr.tenant_id and g.id = v_enr.grade_level_id),
    'section', (select jsonb_build_object('name', sc.name)
                from sections sc where sc.tenant_id = v_enr.tenant_id and sc.id = v_enr.section_id),
    'teachers', (select coalesce(jsonb_agg(t.first_name || ' ' || t.last_name order by st.role, t.last_name), '[]'::jsonb)
                 from section_teachers st
                 join teachers t on t.tenant_id = st.tenant_id and t.id = st.teacher_id
                 where st.tenant_id = v_enr.tenant_id and st.section_id = v_enr.section_id),
    'competencies', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'area', c.area, 'name', c.name,
               'indicators', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'description', i.description, 'level', a.level,
                          'score', a.score, 'comment', a.comment) order by i.sort_order, i.description), '[]'::jsonb)
                 from indicators i
                 left join assessments a on a.tenant_id = i.tenant_id and a.indicator_id = i.id
                   and a.enrollment_id = v_enr.id and a.grading_term_id = p_term
                 where i.tenant_id = c.tenant_id and i.competency_id = c.id and (i.active or a.id is not null)
               )) order by c.sort_order, c.area, c.name), '[]'::jsonb)
      from competencies c
      where c.tenant_id = v_enr.tenant_id
        and (c.grade_level_id is null or c.grade_level_id = v_enr.grade_level_id)
        and c.active
    ),
    'attendance', (
      select jsonb_build_object(
        'present', count(*) filter (where status = 'present'),
        'absent',  count(*) filter (where status = 'absent'),
        'late',    count(*) filter (where status = 'late'),
        'excused', count(*) filter (where status = 'excused'),
        'total',   count(*))
      from attendance_records
      where tenant_id = v_enr.tenant_id and enrollment_id = v_enr.id and date between v_from and v_to
    ),
    'observations', (
      select coalesce(jsonb_agg(jsonb_build_object('category', o.category, 'body', o.body,
                                                   'created_at', o.created_at) order by o.created_at), '[]'::jsonb)
      from student_observations o
      where o.tenant_id = v_enr.tenant_id and o.enrollment_id = v_enr.id and o.visible_to_family
        and (o.grading_term_id = p_term
             or (o.grading_term_id is null and o.created_at::date between v_from and v_to))
    ),
    'generated_at', now()
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 11) generate_report_cards() / publish_report_cards()
-- ──────────────────────────────────────────────────────────────────────────
-- Generar = (re)hacer la foto de los BORRADORES de una sección. Los publicados
-- no se tocan: se informan como `skipped` para que la UI lo diga.
create or replace function public.generate_report_cards(p_section uuid, p_term uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_sec    sections;
  v_term   grading_terms;
  v_enr    record;
  v_gen    integer := 0;
  v_skip   integer := 0;
begin
  if v_tenant is null or not public.auth_teaches_section(p_section) then
    raise exception 'No autorizado';
  end if;

  select * into v_sec from sections where tenant_id = v_tenant and id = p_section;
  if not found then
    raise exception 'Sección no encontrada';
  end if;
  select * into v_term from grading_terms where tenant_id = v_tenant and id = p_term;
  if not found or v_term.academic_period_id <> v_sec.academic_period_id then
    raise exception 'El corte no pertenece al año de esa sección';
  end if;

  for v_enr in
    select e.id from enrollments e
    where e.tenant_id = v_tenant and e.section_id = p_section and e.status <> 'withdrawn'
  loop
    if exists (select 1 from report_cards where enrollment_id = v_enr.id
               and grading_term_id = p_term and status = 'published') then
      v_skip := v_skip + 1;
      continue;
    end if;
    insert into report_cards (tenant_id, enrollment_id, grading_term_id, section_id, snapshot, generated_by)
    values (v_tenant, v_enr.id, p_term, p_section,
            public.build_report_card_snapshot(v_enr.id, p_term), auth.uid())
    on conflict (enrollment_id, grading_term_id) do update
      set snapshot = excluded.snapshot, section_id = excluded.section_id,
          generated_by = excluded.generated_by;
    v_gen := v_gen + 1;
  end loop;

  return jsonb_build_object('generated', v_gen, 'skipped', v_skip);
end;
$$;

-- Publicar es de Dirección: es el momento en que el boletín sale del colegio.
create or replace function public.publish_report_cards(p_section uuid, p_term uuid, p_publish boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_n integer;
begin
  if v_tenant is null or not public.auth_can_manage_academics() then
    raise exception 'No autorizado';
  end if;

  update report_cards
  set status       = case when p_publish then 'published'::report_card_status else 'draft'::report_card_status end,
      published_at = case when p_publish then now() else null end,
      published_by = case when p_publish then auth.uid() else null end
  where tenant_id = v_tenant and section_id = p_section and grading_term_id = p_term
    and status <> case when p_publish then 'published'::report_card_status else 'draft'::report_card_status end;
  get diagnostics v_n = row_count;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), case when p_publish then 'report_cards.publish' else 'report_cards.unpublish' end,
          'sections', p_section, jsonb_build_object('term', p_term, 'count', v_n));

  return v_n;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 12) Permisos de ejecución
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  fns text[] := array[
    'public.save_attendance(uuid, date, jsonb)',
    'public.save_assessments(uuid, uuid, jsonb)',
    'public.generate_report_cards(uuid, uuid)',
    'public.publish_report_cards(uuid, uuid, boolean)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on function public.build_report_card_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.classroom_row_guard() from public, anon;
revoke all on function public.report_cards_guard() from public, anon;
