-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0012 · Roles escolares y tipos del dominio
-- ═══════════════════════════════════════════════════════════════════════════
-- A partir de aquí el starter deja de ser genérico: cada tenant es un COLEGIO.
-- Esta migración solo declara vocabulario (roles y enums); las tablas llegan en
-- 0013-0018.
--
-- ¿Por qué un archivo aparte solo para esto? `alter type ... add value` no se
-- puede USAR en la misma transacción que lo añade ("unsafe use of new value").
-- El CLI aplica cada migración en su propia transacción, así que separar el
-- `add value` de las políticas que comparan contra 'teacher' o 'accountant' es
-- lo que hace que la siguiente migración funcione a la primera.
--
-- Roles del colegio (se suman a owner/admin del starter):
--   owner      → Dirección / dueño: todo, incluido plan y equipo.
--   admin      → Administración: todo lo operativo.
--   secretary  → Secretaría: estudiantes, familias, inscripciones, asistencia,
--                comunicados y caja (cobrar).
--   teacher    → Docente: lee lo académico; escribe asistencia, evaluaciones y
--                observaciones SOLO de sus secciones. No ve finanzas.
--   accountant → Finanzas: conceptos, cargos, pagos y anulaciones.
-- La matriz exacta vive en las políticas (0013+) y en src/lib/permissions.ts.
-- ═══════════════════════════════════════════════════════════════════════════

alter type member_role add value if not exists 'secretary';
alter type member_role add value if not exists 'teacher';
alter type member_role add value if not exists 'accountant';

-- Nivel educativo. Hoy el producto se centra en inicial, pero el grado lo
-- declara desde el principio: añadir primaria o secundaria es crear grados con
-- otro nivel, no migrar datos.
do $$ begin
  create type education_level as enum ('initial', 'primary', 'secondary');
exception when duplicate_object then null; end $$;

-- Año escolar. Solo uno 'active' por colegio (índice parcial en 0013). Un
-- período 'closed' queda CONGELADO: es lo que hace fiable el historial.
do $$ begin
  create type period_status as enum ('planning', 'active', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type student_status as enum ('active', 'inactive', 'graduated', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type staff_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type guardian_relationship as enum (
    'mother', 'father', 'grandparent', 'sibling', 'uncle_aunt', 'tutor', 'other'
  );
exception when duplicate_object then null; end $$;

-- Cómo terminó (o sigue) un año escolar para un estudiante. 'promoted' y
-- 'retained' los pone el cierre del período; 'withdrawn' la secretaría.
do $$ begin
  create type enrollment_status as enum ('enrolled', 'withdrawn', 'completed', 'promoted', 'retained');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'absent', 'late', 'excused');
exception when duplicate_object then null; end $$;

-- Escala cualitativa de inicial (Logrado / En proceso / Iniciado). Primaria y
-- secundaria usarán `assessments.score`; la tabla admite las dos.
do $$ begin
  create type achievement_level as enum ('achieved', 'in_progress', 'started');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_card_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_kind as enum (
    'birth_certificate', 'id_document', 'medical', 'vaccination', 'photo', 'previous_school', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type fee_kind as enum ('enrollment', 'tuition', 'materials', 'uniform', 'transport', 'activity', 'other');
exception when duplicate_object then null; end $$;

-- Estado de un cargo: lo CALCULA un trigger a partir de amount/amount_paid
-- (0016). Ningún cliente lo escribe.
do $$ begin
  create type charge_status as enum ('pending', 'partial', 'paid', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'transfer', 'card', 'check', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('valid', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type announcement_audience as enum ('all', 'grade_level', 'section');
exception when duplicate_object then null; end $$;
