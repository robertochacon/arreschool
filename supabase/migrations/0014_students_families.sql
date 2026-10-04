-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0014 · Estudiantes, familias, documentos e inscripciones
-- ═══════════════════════════════════════════════════════════════════════════
-- El centro del producto. Separación deliberada:
--
--   students     → la PERSONA. Existe una vez, aunque pase diez años en el
--                  colegio. Sus datos médicos y de contacto no se duplican.
--   enrollments  → su paso por UN año escolar: grado, sección y cómo terminó.
--                  El historial académico es la lista de sus inscripciones, y
--                  la asistencia, las evaluaciones y los boletines cuelgan de
--                  la inscripción, no del estudiante. Por eso cambiar de
--                  sección o de año nunca reescribe lo que pasó antes.
--   guardians + student_guardians → la familia. Un tutor puede tener varios
--                  hijos en el colegio (hermanos) sin duplicar su ficha.
--
-- Borrado: casi todo es `on delete restrict`. Un estudiante con historia NO se
-- borra, se marca como retirado; el error de FK lo traduce la UI a un mensaje
-- humano (src/lib/errors.ts, código 23503).
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1) students
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  -- Matrícula interna. Si no se escribe, la asigna students_assign_code() con
  -- el contador del colegio (EST-000001…).
  code           text,
  first_name     text not null check (btrim(first_name) <> ''),
  last_name      text not null check (btrim(last_name) <> ''),
  birth_date     date,
  gender         text check (gender is null or gender in ('F', 'M', 'X')),
  document_id    text,
  nationality    text,
  address        text,
  blood_type     text,
  -- Lo que una maestra tiene que saber antes de la merienda.
  allergies      text,
  medical_notes  text,
  -- Ruta en el bucket privado `files` (<tenant_id>/students/…), nunca una URL.
  photo_path     text,
  status         student_status not null default 'active',
  admission_date date not null default current_date,
  notes          text,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint students_tenant_id_key unique (tenant_id, id),
  constraint students_code_key unique (tenant_id, code),
  constraint students_photo_path check (photo_path is null or split_part(photo_path, '/', 1) = tenant_id::text)
);
create index if not exists students_tenant_idx on public.students (tenant_id, status);
create index if not exists students_name_idx on public.students (tenant_id, last_name, first_name);
create index if not exists students_created_by_idx on public.students (created_by);

create or replace function public.students_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'EST-' || lpad(public.next_counter(new.tenant_id, 'student_code')::text, 6, '0');
  else
    new.code := btrim(new.code);
  end if;
  return new;
end;
$$;
-- Va DESPUÉS de trg_tenant_row por orden alfabético de nombre (los BEFORE se
-- disparan por nombre): el contador nunca avanza para una fila que el trigger
-- de tenant va a rechazar.
drop trigger if exists trg_zz_students_code on public.students;
create trigger trg_zz_students_code before insert on public.students
  for each row execute function public.students_assign_code();

-- ──────────────────────────────────────────────────────────────────────────
-- 2) guardians — padres, madres y tutores
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.guardians (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.auth_tenant_id()
              references public.tenants (id) on delete cascade,
  first_name  text not null check (btrim(first_name) <> ''),
  last_name   text not null check (btrim(last_name) <> ''),
  document_id text,
  phone       text,
  phone_alt   text,
  email       text,
  occupation  text,
  workplace   text,
  address     text,
  -- Reservado para ArreSchool Family (portal de familias): la cuenta con la que
  -- este tutor entrará a ver a sus hijos. Hoy no se concede acceso por aquí.
  user_id     uuid references auth.users (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint guardians_tenant_id_key unique (tenant_id, id)
);
create index if not exists guardians_tenant_idx on public.guardians (tenant_id, last_name, first_name);
create index if not exists guardians_user_idx on public.guardians (user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) student_guardians — quién es quién para cada niño
-- ──────────────────────────────────────────────────────────────────────────
-- Las banderas responden a las preguntas del día a día: ¿a quién llamo?,
-- ¿quién puede recogerlo?, ¿a nombre de quién va el recibo?
create table if not exists public.student_guardians (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null default public.auth_tenant_id()
                           references public.tenants (id) on delete cascade,
  student_id               uuid not null,
  guardian_id              uuid not null,
  relationship             guardian_relationship not null default 'mother',
  is_primary               boolean not null default false,
  lives_with               boolean not null default true,
  can_pickup               boolean not null default true,
  is_emergency_contact     boolean not null default true,
  is_financial_responsible boolean not null default false,
  created_at               timestamptz not null default now(),
  constraint student_guardians_unique unique (student_id, guardian_id),
  constraint student_guardians_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete cascade,
  constraint student_guardians_guardian_fk foreign key (tenant_id, guardian_id)
    references public.guardians (tenant_id, id) on delete cascade
);
create index if not exists student_guardians_tenant_idx on public.student_guardians (tenant_id);
create index if not exists student_guardians_guardian_idx on public.student_guardians (tenant_id, guardian_id);
-- Un solo contacto principal por estudiante: es el que sale en listados y recibos.
create unique index if not exists student_guardians_one_primary
  on public.student_guardians (student_id) where is_primary;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) student_documents — acta de nacimiento, vacunas, certificados…
-- ──────────────────────────────────────────────────────────────────────────
-- El archivo vive en Storage (bucket privado `files`); aquí solo los metadatos.
-- El check de la ruta repite en la base la regla de Storage (primera carpeta =
-- tenant): una fila que apuntara a la carpeta de otro colegio no serviría para
-- leer nada (la política de Storage lo impide), pero sí para confundir.
create table if not exists public.student_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.auth_tenant_id()
              references public.tenants (id) on delete cascade,
  student_id  uuid not null,
  kind        document_kind not null default 'other',
  title       text not null check (btrim(title) <> ''),
  file_path   text not null,
  file_name   text,
  mime_type   text,
  size_bytes  bigint,
  notes       text,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint student_documents_path check (split_part(file_path, '/', 1) = tenant_id::text),
  constraint student_documents_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete cascade
);
create index if not exists student_documents_student_idx on public.student_documents (tenant_id, student_id);
create index if not exists student_documents_uploaded_by_idx on public.student_documents (uploaded_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) enrollments — un estudiante en un año escolar
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.enrollments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.auth_tenant_id()
                     references public.tenants (id) on delete cascade,
  student_id         uuid not null,
  academic_period_id uuid not null,
  grade_level_id     uuid not null,
  -- NULL = inscrito pero todavía sin sección asignada (flujo normal en agosto).
  section_id         uuid,
  status             enrollment_status not null default 'enrolled',
  enrolled_on        date not null default current_date,
  ended_on           date,
  end_reason         text,
  notes              text,
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint enrollments_tenant_id_key unique (tenant_id, id),
  -- Una inscripción por estudiante y año: el historial es una línea por año.
  constraint enrollments_student_period_key unique (tenant_id, student_id, academic_period_id),
  constraint enrollments_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  constraint enrollments_period_fk foreign key (tenant_id, academic_period_id)
    references public.academic_periods (tenant_id, id) on delete restrict,
  constraint enrollments_grade_fk foreign key (tenant_id, grade_level_id)
    references public.grade_levels (tenant_id, id) on delete restrict,
  -- La sección tiene que ser del MISMO año y del MISMO grado. Con MATCH SIMPLE
  -- (el default) la FK se ignora mientras section_id sea NULL.
  constraint enrollments_section_fk foreign key (tenant_id, academic_period_id, grade_level_id, section_id)
    references public.sections (tenant_id, academic_period_id, grade_level_id, id) on delete restrict
);
create index if not exists enrollments_period_idx on public.enrollments (tenant_id, academic_period_id, status);
create index if not exists enrollments_section_idx on public.enrollments (tenant_id, section_id);
create index if not exists enrollments_student_idx on public.enrollments (tenant_id, student_id);
create index if not exists enrollments_grade_idx on public.enrollments (tenant_id, grade_level_id);
create index if not exists enrollments_created_by_idx on public.enrollments (created_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Guardas de inscripción
-- ──────────────────────────────────────────────────────────────────────────
-- (a) Un año CERRADO es historia: no se inscribe, no se mueve ni se borra a
--     nadie en él. El cierre (close_academic_period, 0017) pone los estados
--     finales ANTES de cerrar, así que no choca con esto.
-- (b) Capacidad de la sección: el tope se comprueba al ENTRAR en ella, con la
--     fila de la sección bloqueada para que dos inscripciones simultáneas no
--     metan al alumno 26 en una sala de 25.
create or replace function public.enrollments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period  uuid := coalesce(new.academic_period_id, old.academic_period_id);
  v_tenant  uuid := coalesce(new.tenant_id, old.tenant_id);
  v_cap     integer;
  v_name    text;
  v_count   integer;
begin
  if public.is_purging_tenant(v_tenant) then
    return coalesce(new, old);
  end if;

  if exists (select 1 from academic_periods
             where tenant_id = v_tenant and id = v_period and status = 'closed') then
    raise exception 'PERIODO_CERRADO: Ese año escolar está cerrado; su historial ya no se modifica.';
  end if;
  if tg_op = 'UPDATE' and new.academic_period_id is distinct from old.academic_period_id
     and exists (select 1 from academic_periods
                 where tenant_id = v_tenant and id = old.academic_period_id and status = 'closed') then
    raise exception 'PERIODO_CERRADO: Ese año escolar está cerrado; su historial ya no se modifica.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.section_id is not null
     and (tg_op = 'INSERT' or new.section_id is distinct from old.section_id)
     and new.status = 'enrolled' then
    select capacity, name into v_cap, v_name
    from sections where tenant_id = new.tenant_id and id = new.section_id
    for update;
    if v_cap is not null then
      select count(*) into v_count from enrollments
      where tenant_id = new.tenant_id and section_id = new.section_id
        and status = 'enrolled' and id <> new.id;
      if v_count >= v_cap then
        raise exception 'SECCION_LLENA: La sección % ya tiene % de % lugares ocupados.', v_name, v_count, v_cap;
      end if;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_enrollments_guard on public.enrollments;
create trigger trg_enrollments_guard before insert or update or delete on public.enrollments
  for each row execute function public.enrollments_guard();

-- ──────────────────────────────────────────────────────────────────────────
-- 7) RLS
-- ──────────────────────────────────────────────────────────────────────────
-- Todo el colegio LEE (la docente necesita alergias y teléfonos de su grupo;
-- finanzas necesita nombres). Escribe Dirección + Secretaría.
select public.setup_tenant_table('students',          'true', 'public.auth_can_manage_students()');
select public.setup_tenant_table('guardians',         'true', 'public.auth_can_manage_students()');
select public.setup_tenant_table('student_guardians', 'true', 'public.auth_can_manage_students()');
select public.setup_tenant_table('student_documents', 'true', 'public.auth_can_manage_students()');
select public.setup_tenant_table('enrollments',       'true', 'public.auth_can_manage_students()');

revoke all on function public.students_assign_code() from public, anon;
revoke all on function public.enrollments_guard() from public, anon;
