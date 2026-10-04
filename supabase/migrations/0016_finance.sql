-- ═══════════════════════════════════════════════════════════════════════════
-- ArreSchool · 0016 · Finanzas (conceptos, cargos, pagos, recibos)
-- ═══════════════════════════════════════════════════════════════════════════
-- El módulo que más confianza tiene que dar: si un recibo dice que se pagó, se
-- pagó, y nadie puede reescribirlo después. Reglas que salen de ahí:
--
--   • Un CARGO es lo que se debe (mensualidad de marzo, inscripción). Su
--     `amount_paid` y su `status` los calcula la base; ningún cliente los
--     escribe (privilegios por columna + trigger).
--   • Un PAGO es dinero recibido. Es INMUTABLE: no tiene UPDATE ni DELETE desde
--     el cliente. Un error se corrige ANULÁNDOLO (void_payment), que deja rastro
--     con motivo, fecha y autor, y devuelve el saldo a los cargos.
--   • Un pago se REPARTE entre cargos (payment_allocations). Lo que sobra queda
--     como saldo a favor del estudiante y se aplica después (apply_student_credit).
--   • El número de recibo es correlativo POR COLEGIO (tenant_counters) y nunca
--     se reutiliza, ni siquiera tras anular.
--   • Todo movimiento de dinero pasa por RPC SECURITY DEFINER que bloquea la
--     cuenta del estudiante (advisory lock) para que dos cajas cobrando a la
--     vez el mismo cargo no lo paguen dos veces.
--
-- Las FK compuestas llevan además `student_id`: un abono solo puede unir un
-- pago y un cargo del MISMO estudiante, y lo garantiza la base, no la RPC.
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  alter table public.enrollments
    add constraint enrollments_student_key unique (tenant_id, id, student_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) fee_concepts — el catálogo de lo que se cobra
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.fee_concepts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  name           text not null check (btrim(name) <> ''),
  kind           fee_kind not null default 'tuition',
  default_amount numeric(12, 2) not null default 0 check (default_amount >= 0),
  -- Mensualidad: se genera por mes (billing_month) y no se puede duplicar.
  is_recurring   boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fee_concepts_tenant_id_key unique (tenant_id, id),
  constraint fee_concepts_name_key unique (tenant_id, name)
);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) charges — lo que se debe
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.charges (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  student_id     uuid not null,
  enrollment_id  uuid,
  fee_concept_id uuid,
  description    text not null check (btrim(description) <> ''),
  amount         numeric(12, 2) not null check (amount > 0),
  amount_paid    numeric(12, 2) not null default 0,
  status         charge_status not null default 'pending',
  due_date       date,
  -- Primer día del mes que cubre (mensualidades). Es la llave anti-duplicado.
  billing_month  date check (billing_month is null or extract(day from billing_month) = 1),
  voided_at      timestamptz,
  voided_by      uuid references auth.users (id) on delete set null,
  void_reason    text,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint charges_paid_range check (amount_paid >= 0 and amount_paid <= amount),
  constraint charges_tenant_id_key unique (tenant_id, id),
  constraint charges_student_key unique (tenant_id, id, student_id),
  constraint charges_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  -- La inscripción, si se indica, tiene que ser DEL MISMO estudiante.
  constraint charges_enrollment_fk foreign key (tenant_id, enrollment_id, student_id)
    references public.enrollments (tenant_id, id, student_id) on delete restrict,
  constraint charges_concept_fk foreign key (tenant_id, fee_concept_id)
    references public.fee_concepts (tenant_id, id) on delete restrict
);
create index if not exists charges_student_idx on public.charges (tenant_id, student_id, status);
create index if not exists charges_open_idx on public.charges (tenant_id, status, due_date);
create index if not exists charges_enrollment_idx on public.charges (tenant_id, enrollment_id);
create index if not exists charges_concept_idx on public.charges (tenant_id, fee_concept_id);
create index if not exists charges_created_by_idx on public.charges (created_by);
create index if not exists charges_voided_by_idx on public.charges (voided_by);
-- La misma mensualidad dos veces al mismo niño es SIEMPRE un error (doble
-- generación, doble clic). Un cargo anulado deja de contar.
create unique index if not exists charges_no_double_month
  on public.charges (tenant_id, student_id, fee_concept_id, billing_month)
  where billing_month is not null and fee_concept_id is not null and status <> 'void';

-- Estado calculado + reglas que un formulario no puede saltarse.
create or replace function public.charges_sync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'UPDATE' and old.status = 'void' and v_client then
    raise exception 'CARGO_ANULADO: Este cargo está anulado y ya no se modifica.';
  end if;
  if tg_op = 'UPDATE' and new.amount <> old.amount and new.amount < old.amount_paid then
    raise exception 'MONTO_INVALIDO: El monto no puede quedar por debajo de lo ya pagado (%).', old.amount_paid;
  end if;
  if new.status <> 'void' then
    new.status := case
      when new.amount_paid >= new.amount then 'paid'
      when new.amount_paid > 0 then 'partial'
      else 'pending'
    end::charge_status;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_b_charges_sync on public.charges;
create trigger trg_b_charges_sync before insert or update on public.charges
  for each row execute function public.charges_sync();

-- ──────────────────────────────────────────────────────────────────────────
-- 3) payments — dinero recibido (inmutable)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.auth_tenant_id()
                 references public.tenants (id) on delete cascade,
  student_id     uuid not null,
  -- Quién pagó (sale en el recibo). Opcional: a veces paga una tía.
  guardian_id    uuid,
  payer_name     text,
  receipt_number bigint not null,
  amount         numeric(12, 2) not null check (amount > 0),
  method         payment_method not null default 'cash',
  reference      text,
  paid_on        date not null default current_date,
  notes          text,
  status         payment_status not null default 'valid',
  voided_at      timestamptz,
  voided_by      uuid references auth.users (id) on delete set null,
  void_reason    text,
  received_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint payments_tenant_id_key unique (tenant_id, id),
  constraint payments_student_key unique (tenant_id, id, student_id),
  constraint payments_receipt_key unique (tenant_id, receipt_number),
  constraint payments_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  constraint payments_guardian_fk foreign key (tenant_id, guardian_id)
    references public.guardians (tenant_id, id) on delete set null (guardian_id)
);
create index if not exists payments_student_idx on public.payments (tenant_id, student_id, paid_on desc);
create index if not exists payments_date_idx on public.payments (tenant_id, paid_on desc);
create index if not exists payments_guardian_idx on public.payments (tenant_id, guardian_id);
create index if not exists payments_received_by_idx on public.payments (received_by);
create index if not exists payments_voided_by_idx on public.payments (voided_by);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) payment_allocations — qué parte de cada pago cubre qué cargo
-- ──────────────────────────────────────────────────────────────────────────
-- Se conservan aunque el pago se anule: son la historia de lo que pasó. Los
-- totales siempre filtran por `payments.status = 'valid'`.
create table if not exists public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.auth_tenant_id()
             references public.tenants (id) on delete cascade,
  payment_id uuid not null,
  charge_id  uuid not null,
  student_id uuid not null,
  amount     numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_unique unique (payment_id, charge_id),
  constraint payment_allocations_payment_fk foreign key (tenant_id, payment_id, student_id)
    references public.payments (tenant_id, id, student_id) on delete restrict,
  constraint payment_allocations_charge_fk foreign key (tenant_id, charge_id, student_id)
    references public.charges (tenant_id, id, student_id) on delete restrict
);
create index if not exists payment_allocations_charge_idx on public.payment_allocations (tenant_id, charge_id);
create index if not exists payment_allocations_payment_idx on public.payment_allocations (tenant_id, payment_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) RLS y privilegios por columna
-- ──────────────────────────────────────────────────────────────────────────
-- Docentes NO ven finanzas: la lectura también va por rol.
select public.setup_tenant_table('fee_concepts',        'public.auth_can_handle_finance()', 'public.auth_can_manage_finance()');
select public.setup_tenant_table('charges',             'public.auth_can_handle_finance()', 'public.auth_can_handle_finance()');
select public.setup_tenant_table('payments',            'public.auth_can_handle_finance()', 'false');
select public.setup_tenant_table('payment_allocations', 'public.auth_can_handle_finance()', 'false');

-- Cargos: el cliente crea y corrige descripción/monto/vencimiento. Lo que
-- refleja dinero (amount_paid, status) y la anulación solo los mueve la base.
revoke insert, update on public.charges from authenticated;
grant insert (student_id, enrollment_id, fee_concept_id, description, amount, due_date, billing_month)
  on public.charges to authenticated;
grant update (description, amount, due_date) on public.charges to authenticated;

-- Pagos y abonos: solo lectura. El 42501 ruidoso en vez del 204 silencioso.
revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.payment_allocations from authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Saldos por estudiante (vista con la RLS de quien consulta)
-- ──────────────────────────────────────────────────────────────────────────
-- `security_invoker`: sin él, una vista corre con los permisos de su dueño y se
-- SALTA la RLS — sería una ventana a los saldos de todos los colegios.
create or replace view public.student_accounts
with (security_invoker = true) as
select
  s.tenant_id,
  s.id         as student_id,
  s.code,
  s.first_name,
  s.last_name,
  s.status,
  coalesce(c.total_charged, 0) as total_charged,
  coalesce(c.total_paid, 0)    as total_paid,
  coalesce(c.balance, 0)       as balance,
  coalesce(c.overdue, 0)       as overdue,
  coalesce(c.open_charges, 0)  as open_charges,
  c.next_due_date,
  coalesce(p.credit, 0)        as credit
from public.students s
left join lateral (
  select
    sum(ch.amount)                                                         as total_charged,
    sum(ch.amount_paid)                                                    as total_paid,
    sum(ch.amount - ch.amount_paid)                                        as balance,
    sum(ch.amount - ch.amount_paid) filter (where ch.due_date < current_date) as overdue,
    count(*) filter (where ch.status in ('pending', 'partial'))            as open_charges,
    min(ch.due_date) filter (where ch.status in ('pending', 'partial'))    as next_due_date
  from public.charges ch
  where ch.tenant_id = s.tenant_id and ch.student_id = s.id and ch.status <> 'void'
) c on true
left join lateral (
  select sum(py.amount - coalesce((select sum(a.amount) from public.payment_allocations a
                                   where a.tenant_id = py.tenant_id and a.payment_id = py.id), 0)) as credit
  from public.payments py
  where py.tenant_id = s.tenant_id and py.student_id = s.id and py.status = 'valid'
) p on true;

revoke all on public.student_accounts from anon;
grant select on public.student_accounts to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 7) Reparto interno de un monto entre los cargos abiertos (FIFO)
-- ──────────────────────────────────────────────────────────────────────────
-- Interna: la usan register_payment y apply_student_credit. Orden: primero lo
-- que vence antes; sin vencimiento, al final; a igualdad, lo más antiguo.
create or replace function public.allocate_fifo(p_tenant uuid, p_payment uuid, p_student uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left numeric := p_amount;
  v_c    record;
  v_amt  numeric;
begin
  for v_c in
    select id, amount, amount_paid from charges
    where tenant_id = p_tenant and student_id = p_student and status in ('pending', 'partial')
    order by due_date nulls last, created_at
    for update
  loop
    exit when v_left <= 0;
    v_amt := least(v_left, v_c.amount - v_c.amount_paid);
    insert into payment_allocations (tenant_id, payment_id, charge_id, student_id, amount)
    values (p_tenant, p_payment, v_c.id, p_student, v_amt)
    on conflict (payment_id, charge_id) do update set amount = payment_allocations.amount + excluded.amount;
    update charges set amount_paid = amount_paid + v_amt where id = v_c.id;
    v_left := v_left - v_amt;
  end loop;
  return p_amount - v_left;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 8) register_payment() — cobrar
-- ──────────────────────────────────────────────────────────────────────────
-- p_allocations (opcional): [{ "charge_id": uuid, "amount": number }]. Sin él,
-- el pago se aplica solo a lo más antiguo (lo que espera cualquier caja).
-- Devuelve { payment_id, receipt_number, allocated, credit }.
create or replace function public.register_payment(
  p_student     uuid,
  p_amount      numeric,
  p_method      payment_method default 'cash',
  p_paid_on     date default current_date,
  p_reference   text default null,
  p_guardian    uuid default null,
  p_payer_name  text default null,
  p_notes       text default null,
  p_allocations jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid := public.auth_tenant_id();
  v_payment uuid;
  v_receipt bigint;
  v_left    numeric := p_amount;
  v_a       jsonb;
  v_charge  uuid;
  v_amt     numeric;
  v_open    numeric;
  v_desc    text;
begin
  if v_tenant is null or not public.auth_can_handle_finance() then
    raise exception 'No autorizado';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;
  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'La fecha del pago no puede ser futura';
  end if;
  if not exists (select 1 from students where tenant_id = v_tenant and id = p_student) then
    raise exception 'Estudiante no encontrado';
  end if;

  -- Serializa la CUENTA del estudiante: dos cajas cobrando a la vez no pueden
  -- leer el mismo saldo y aplicarlo dos veces.
  perform pg_advisory_xact_lock(hashtext('arreschool_account:' || p_student::text));

  v_receipt := public.next_counter(v_tenant, 'receipt');

  insert into payments (tenant_id, student_id, guardian_id, payer_name, receipt_number, amount,
                        method, reference, paid_on, notes, received_by)
  values (v_tenant, p_student, p_guardian, nullif(btrim(p_payer_name), ''), v_receipt, p_amount,
          coalesce(p_method, 'cash'), nullif(btrim(p_reference), ''), p_paid_on,
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_payment;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array'
     and jsonb_array_length(p_allocations) > 0 then
    for v_a in select * from jsonb_array_elements(p_allocations) loop
      v_charge := (v_a->>'charge_id')::uuid;
      v_amt    := (v_a->>'amount')::numeric;
      if v_amt is null or v_amt <= 0 then
        continue;
      end if;
      select amount - amount_paid, description into v_open, v_desc
      from charges
      where tenant_id = v_tenant and id = v_charge and student_id = p_student
        and status in ('pending', 'partial')
      for update;
      if not found then
        raise exception 'Uno de los cargos elegidos no está pendiente o no es de este estudiante';
      end if;
      if v_amt > v_open then
        raise exception 'El abono a "%" supera lo que falta por pagar (%)', v_desc, v_open;
      end if;
      if v_amt > v_left then
        raise exception 'Lo repartido entre los cargos supera el monto del pago';
      end if;
      insert into payment_allocations (tenant_id, payment_id, charge_id, student_id, amount)
      values (v_tenant, v_payment, v_charge, p_student, v_amt);
      update charges set amount_paid = amount_paid + v_amt where id = v_charge;
      v_left := v_left - v_amt;
    end loop;
  else
    v_left := v_left - public.allocate_fifo(v_tenant, v_payment, p_student, p_amount);
  end if;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'payment.register', 'payments', v_payment,
          jsonb_build_object('receipt_number', v_receipt, 'amount', p_amount, 'student_id', p_student));

  return jsonb_build_object(
    'payment_id', v_payment,
    'receipt_number', v_receipt,
    'allocated', p_amount - v_left,
    'credit', v_left
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 9) void_payment() — anular un pago (con motivo, nunca borrar)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_pay    payments;
  v_a      record;
begin
  if v_tenant is null or not public.auth_can_manage_finance() then
    raise exception 'No autorizado';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;

  select * into v_pay from payments where tenant_id = v_tenant and id = p_payment;
  if not found then
    raise exception 'Pago no encontrado';
  end if;
  perform pg_advisory_xact_lock(hashtext('arreschool_account:' || v_pay.student_id::text));
  -- Se relee con la cuenta ya bloqueada: otra anulación pudo ganar la carrera.
  select * into v_pay from payments where id = p_payment for update;
  if v_pay.status = 'void' then
    raise exception 'Este pago ya estaba anulado';
  end if;

  for v_a in select charge_id, amount from payment_allocations where payment_id = p_payment loop
    update charges set amount_paid = amount_paid - v_a.amount
    where id = v_a.charge_id and status <> 'void';
  end loop;

  update payments
  set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_payment;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'payment.void', 'payments', p_payment,
          jsonb_build_object('receipt_number', v_pay.receipt_number, 'amount', v_pay.amount,
                             'reason', btrim(p_reason)));
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 10) void_charge() — anular un cargo sin pagos
-- ──────────────────────────────────────────────────────────────────────────
-- Un cargo con dinero aplicado no se anula: primero se anulan esos pagos (y el
-- dinero vuelve al saldo a favor o a otros cargos). Al revés, el dinero
-- quedaría apuntando a una deuda que ya no existe.
create or replace function public.void_charge(p_charge uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_ch     charges;
begin
  if v_tenant is null or not public.auth_can_manage_finance() then
    raise exception 'No autorizado';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;
  select * into v_ch from charges where tenant_id = v_tenant and id = p_charge for update;
  if not found then
    raise exception 'Cargo no encontrado';
  end if;
  if v_ch.status = 'void' then
    raise exception 'Este cargo ya estaba anulado';
  end if;
  if v_ch.amount_paid > 0 then
    raise exception 'CARGO_CON_PAGOS: Este cargo tiene pagos aplicados. Anula primero esos pagos.';
  end if;

  update charges
  set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_charge;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'charge.void', 'charges', p_charge,
          jsonb_build_object('amount', v_ch.amount, 'reason', btrim(p_reason)));
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 11) apply_student_credit() — usar el saldo a favor en cargos nuevos
-- ──────────────────────────────────────────────────────────────────────────
-- El caso típico: la familia adelantó dinero y luego se generó la mensualidad.
create or replace function public.apply_student_credit(p_student uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_p      record;
  v_total  numeric := 0;
begin
  if v_tenant is null or not public.auth_can_handle_finance() then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from students where tenant_id = v_tenant and id = p_student) then
    raise exception 'Estudiante no encontrado';
  end if;
  perform pg_advisory_xact_lock(hashtext('arreschool_account:' || p_student::text));

  for v_p in
    select py.id, py.amount - coalesce((select sum(a.amount) from payment_allocations a
                                        where a.payment_id = py.id), 0) as unallocated
    from payments py
    where py.tenant_id = v_tenant and py.student_id = p_student and py.status = 'valid'
    order by py.paid_on, py.receipt_number
  loop
    continue when v_p.unallocated <= 0;
    v_total := v_total + public.allocate_fifo(v_tenant, v_p.id, p_student, v_p.unallocated);
  end loop;

  return v_total;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 12) generate_charges() — cargar a todo un grupo de una vez
-- ──────────────────────────────────────────────────────────────────────────
-- "Generar la mensualidad de septiembre a todo el colegio" en un clic. Aplica a
-- las inscripciones ACTIVAS del año (por defecto, el activo), filtrables por
-- grado o sección. No duplica: una inscripción que ya tiene ese concepto (y ese
-- mes, si es mensual) sin anular se cuenta en `skipped`.
create or replace function public.generate_charges(
  p_concept       uuid,
  p_amount        numeric default null,
  p_description   text    default null,
  p_due_date      date    default null,
  p_billing_month date    default null,
  p_period        uuid    default null,
  p_grade         uuid    default null,
  p_section       uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_tenant  uuid := public.auth_tenant_id();
  v_concept fee_concepts;
  v_amount  numeric;
  v_period  uuid;
  v_month   date := case when p_billing_month is null then null
                         else date_trunc('month', p_billing_month)::date end;
  v_e       record;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  if v_tenant is null or not public.auth_can_manage_finance() then
    raise exception 'No autorizado';
  end if;

  select * into v_concept from fee_concepts where tenant_id = v_tenant and id = p_concept;
  if not found then
    raise exception 'Concepto no encontrado';
  end if;
  v_amount := coalesce(p_amount, v_concept.default_amount);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Indica un monto mayor que cero';
  end if;

  v_period := coalesce(p_period,
    (select id from academic_periods where tenant_id = v_tenant and status = 'active'));
  if v_period is null then
    raise exception 'SIN_PERIODO_ACTIVO: No hay un año escolar activo. Actívalo en Académico.';
  end if;

  for v_e in
    select e.id, e.student_id from enrollments e
    where e.tenant_id = v_tenant and e.academic_period_id = v_period and e.status = 'enrolled'
      and (p_grade is null or e.grade_level_id = p_grade)
      and (p_section is null or e.section_id = p_section)
  loop
    if exists (
      select 1 from charges c
      where c.tenant_id = v_tenant and c.status <> 'void' and c.fee_concept_id = p_concept
        and c.student_id = v_e.student_id
        and (case when v_month is null then c.enrollment_id = v_e.id
                  else c.billing_month = v_month end)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into charges (tenant_id, student_id, enrollment_id, fee_concept_id, description,
                         amount, due_date, billing_month, created_by)
    values (v_tenant, v_e.student_id, v_e.id, p_concept,
            coalesce(nullif(btrim(p_description), ''), v_concept.name),
            v_amount, p_due_date, v_month, auth.uid());
    v_created := v_created + 1;
  end loop;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), 'charges.generate', 'fee_concepts', p_concept,
          jsonb_build_object('created', v_created, 'skipped', v_skipped, 'amount', v_amount,
                             'billing_month', v_month));

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 13) Permisos de ejecución
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  fns text[] := array[
    'public.register_payment(uuid, numeric, payment_method, date, text, uuid, text, text, jsonb)',
    'public.void_payment(uuid, text)',
    'public.void_charge(uuid, text)',
    'public.apply_student_credit(uuid)',
    'public.generate_charges(uuid, numeric, text, date, date, uuid, uuid, uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on function public.allocate_fifo(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.charges_sync() from public, anon;
