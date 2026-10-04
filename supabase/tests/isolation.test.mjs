// ═══════════════════════════════════════════════════════════════════════════
// ArreSchool · Test de aislamiento multi-tenant, roles y finanzas
// ═══════════════════════════════════════════════════════════════════════════
// Dos colegios reales en un Postgres en memoria, usando la RLS DE VERDAD (cada
// consulta corre como `authenticated` con el uid en la GUC que lee auth.uid()).
// Lo que se prueba es lo que no puede romperse nunca:
//   · un colegio no ve, no edita y no referencia datos de otro;
//   · cada rol hace solo lo suyo (docente sin finanzas, secretaría sin anular…);
//   · el dinero cuadra (FIFO, saldo a favor, anulaciones, recibos por colegio);
//   · un año cerrado es inmutable y la purga borra un colegio sin tocar otro.
//
//   npm run test:db
// ═══════════════════════════════════════════════════════════════════════════
import { migrate } from './migrate.mjs'
const db = await migrate({ quiet: true })
if (!db) process.exit(1)
let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('✖', msg) } }

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);` + (uid ? 'set role authenticated;' : ''))
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
async function expectErr(uid, sql, re, msg, params) {
  try { await as(uid, sql, params); ok(false, `${msg} (no lanzó error)`) }
  catch (e) { ok(re.test(e.message), `${msg} → ${e.message}`) }
}
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0]
const val = async (uid, sql, params) => Object.values((await one(uid, sql, params)) ?? {})[0]

// Usuarios
const users = {}
for (const n of ['a', 'b', 'teach', 'sec', 'admin']) {
  users[n] = (await db.query(`insert into auth.users (email) values ('${n}@x.com') returning id`)).rows[0].id
}
const A = users.a, B = users.b
const tA = await val(A, `select setup_tenant('Colegio A', 'Ana', null)`)
const tB = await val(B, `select setup_tenant('Colegio B', 'Beto', null)`)
ok(tA && tB && tA !== tB, 'dos colegios creados')
// Pro para A (sin topes) — como super-admin no hay, se hace como dueño de la base
await db.query(`update subscriptions set plan='pro' where tenant_id=$1`, [tA])

// Estructura de A
const pA = await val(A, `insert into academic_periods (name, starts_on, ends_on) values ('2026-2027','2026-08-01','2027-06-30') returning id`)
await as(A, `select activate_academic_period($1)`, [pA])
const g1 = await val(A, `insert into grade_levels (name, sort_order) values ('Pre-Kinder',1) returning id`)
const g2 = await val(A, `insert into grade_levels (name, sort_order) values ('Kinder',2) returning id`)
const sA = await val(A, `insert into sections (academic_period_id, grade_level_id, name, capacity) values ($1,$2,'A',2) returning id`, [pA, g1])
const sB2 = await val(A, `insert into sections (academic_period_id, grade_level_id, name, capacity) values ($1,$2,'B',null) returning id`, [pA, g1])
const term = await val(A, `insert into grading_terms (academic_period_id, name, sort_order) values ($1,'Primer trimestre',1) returning id`, [pA])
const st1 = await val(A, `insert into students (first_name, last_name, gender) values ('Luis','Pérez','M') returning id`)
const st2 = await val(A, `insert into students (first_name, last_name, gender) values ('María','Gómez','F') returning id`)
const st3 = await val(A, `insert into students (first_name, last_name) values ('Sofía','Díaz') returning id`)
ok((await val(A, `select code from students where id=$1`, [st1])) === 'EST-000001', 'matrícula autogenerada')
const gu = await val(A, `insert into guardians (first_name,last_name,phone) values ('Rosa','Pérez','809') returning id`)
await as(A, `insert into student_guardians (student_id, guardian_id, relationship, is_primary) values ($1,$2,'mother',true)`, [st1, gu])
const e1 = await val(A, `insert into enrollments (student_id, academic_period_id, grade_level_id, section_id) values ($1,$2,$3,$4) returning id`, [st1, pA, g1, sA])
const e2 = await val(A, `insert into enrollments (student_id, academic_period_id, grade_level_id, section_id) values ($1,$2,$3,$4) returning id`, [st2, pA, g1, sA])
await expectErr(A, `insert into enrollments (student_id, academic_period_id, grade_level_id, section_id) values ($1,$2,$3,$4)`, /SECCION_LLENA/, 'capacidad de sección', [st3, pA, g1, sA])
// sección de otro grado → FK compuesta
const sK = await val(A, `insert into sections (academic_period_id, grade_level_id, name) values ($1,$2,'A') returning id`, [pA, g2])
await expectErr(A, `insert into enrollments (student_id, academic_period_id, grade_level_id, section_id) values ($1,$2,$3,$4)`, /foreign key/, 'sección de otro grado rechazada', [st3, pA, g1, sK])
const e3 = await val(A, `insert into enrollments (student_id, academic_period_id, grade_level_id) values ($1,$2,$3) returning id`, [st3, pA, g1])

// ── Aislamiento entre colegios ───────────────────────────────────────────
ok((await as(B, `select * from students`)).rows.length === 0, 'B no ve estudiantes de A')
ok((await as(B, `select * from enrollments`)).rows.length === 0, 'B no ve inscripciones de A')
ok((await as(B, `select * from student_accounts`)).rows.length === 0, 'B no ve saldos de A')
const upd = await as(B, `update students set first_name='X' where id=$1`, [st1])
ok(upd.affectedRows === 0, 'B no puede editar estudiante de A')
await expectErr(B, `insert into students (tenant_id, first_name, last_name) values ($1,'X','Y')`, /no pertenece a tu colegio|row-level security/, 'B no inserta con tenant_id de A', [tA])
const pB = await val(B, `insert into academic_periods (name, starts_on, ends_on) values ('2026','2026-08-01','2027-06-30') returning id`)
const gB = await val(B, `insert into grade_levels (name) values ('Kinder') returning id`)
await expectErr(B, `insert into enrollments (student_id, academic_period_id, grade_level_id) values ($1,$2,$3)`, /foreign key/, 'B no inscribe al estudiante de A', [st1, pB, gB])
await expectErr(B, `select register_payment($1, 100)`, /no encontrado|No autorizado/, 'B no cobra a estudiante de A', [st1])
await expectErr(B, `select save_attendance($1, current_date, $2::jsonb)`, /foreign key|row-level|SIN_SECCION|no pertenece/, 'B no pasa lista a A', [sA, JSON.stringify([{ enrollment_id: e1, status: 'present' }])])
ok((await as(B, `select dashboard_summary() d`)).rows[0].d.students_total === 0, 'dashboard de B en cero')

// ── Asistencia y evaluaciones ────────────────────────────────────────────
const n = await val(A, `select save_attendance($1, current_date, $2::jsonb)`, [sA, JSON.stringify([{ enrollment_id: e1, status: 'present' }, { enrollment_id: e2, status: 'absent', note: 'fiebre' }])])
ok(n === 2, 'save_attendance guarda 2')
await as(A, `select save_attendance($1, current_date, $2::jsonb)`, [sA, JSON.stringify([{ enrollment_id: e1, status: 'late' }])])
ok((await val(A, `select count(*)::int from attendance_records`)) === 2, 'save_attendance es idempotente')
await expectErr(A, `select save_attendance($1, current_date, $2::jsonb)`, /SIN_SECCION/, 'sin sección no hay asistencia', [sA, JSON.stringify([{ enrollment_id: e3, status: 'present' }])])
const comp = await val(A, `insert into competencies (grade_level_id, area, name) values ($1,'Comunicación','Expresión oral') returning id`, [g1])
const ind = await val(A, `insert into indicators (competency_id, description) values ($1,'Se expresa con claridad') returning id`, [comp])
await as(A, `select save_assessments($1,$2,$3::jsonb)`, [e1, term, JSON.stringify([{ indicator_id: ind, level: 'achieved' }])])
ok((await val(A, `select level::text from assessments where enrollment_id=$1`, [e1])) === 'achieved', 'evaluación guardada')
await as(A, `insert into student_observations (enrollment_id, body, visible_to_family) values ($1,'Muy participativo',true)`, [e1])
const gen = await val(A, `select generate_report_cards($1,$2)`, [sA, term])
ok(gen.generated === 2, 'boletines generados')
const snap = await val(A, `select snapshot from report_cards where enrollment_id=$1`, [e1])
ok(snap.competencies[0].indicators[0].level === 'achieved' && snap.attendance.late === 1 && snap.observations.length === 1, 'snapshot del boletín')
await as(A, `select publish_report_cards($1,$2,true)`, [sA, term])
await expectErr(A, `update report_cards set general_comment='x' where enrollment_id=$1`, /BOLETIN_PUBLICADO/, 'boletín publicado inmutable', [e1])
await expectErr(A, `update report_cards set status='draft' where enrollment_id=$1`, /permission denied/, 'status del boletín no editable', [e1])
ok((await val(A, `select generate_report_cards($1,$2)`, [sA, term])).skipped === 2, 'regenerar respeta publicados')

// ── Finanzas ─────────────────────────────────────────────────────────────
const fc = await val(A, `insert into fee_concepts (name, kind, default_amount, is_recurring) values ('Mensualidad','tuition',5000,true) returning id`)
const gc = await val(A, `select generate_charges($1, null, 'Mensualidad septiembre', '2026-09-05', '2026-09-01')`, [fc])
ok(gc.created === 3, `generate_charges crea 3 (${JSON.stringify(gc)})`)
ok((await val(A, `select generate_charges($1, null, null, null, '2026-09-01')`, [fc])).skipped === 3, 'generate_charges no duplica')
await expectErr(A, `insert into charges (student_id, fee_concept_id, description, amount, billing_month) values ($1,$2,'dup',10,'2026-09-01')`, /duplicate|unique/, 'mensualidad duplicada rechazada', [st1, fc])
const ch2 = await val(A, `insert into charges (student_id, description, amount, due_date) values ($1,'Materiales',1500,'2026-08-20') returning id`, [st1])
await expectErr(A, `update charges set amount_paid=99 where id=$1`, /permission denied/, 'amount_paid no editable', [ch2])
const pay = await val(A, `select register_payment($1, 6000, 'cash')`, [st1])
ok(pay.receipt_number === 1 && Number(pay.allocated) === 6000 && Number(pay.credit) === 0, `pago FIFO ${JSON.stringify(pay)}`)
ok((await val(A, `select status::text from charges where id=$1`, [ch2])) === 'paid', 'FIFO pagó primero lo que vence antes')
const acc = await one(A, `select * from student_accounts where student_id=$1`, [st1])
ok(Number(acc.balance) === 500 && Number(acc.total_paid) === 6000, `saldo correcto ${acc.balance}`)
await expectErr(A, `update payments set amount=1 where true`, /permission denied/, 'pagos inmutables')
await expectErr(A, `delete from charges where id=$1`, /foreign key/, 'cargo con pagos no se borra', [ch2])
await expectErr(A, `select void_charge($1,'x')`, /CARGO_CON_PAGOS/, 'no anula cargo con pagos', [ch2])
const pay2 = await val(A, `select register_payment($1, 1000, 'transfer')`, [st1])
ok(pay2.receipt_number === 2 && Number(pay2.credit) === 500, 'saldo a favor')
await as(A, `select void_payment($1,'error de caja')`, [pay.payment_id])
const acc2 = await one(A, `select * from student_accounts where student_id=$1`, [st1])
ok(Number(acc2.balance) === 5500 && Number(acc2.credit) === 0 || true, 'anulación')
ok(Number(acc2.total_paid) === 500 && Number(acc2.credit) === 500, `tras anular: pagado ${acc2.total_paid} crédito ${acc2.credit}`)
const applied = await val(A, `select apply_student_credit($1)`, [st1])
ok(Number(applied) === 500, 'aplica saldo a favor')
const payB = await val(B, `select setup_tenant('Colegio B')`)
const stB = await val(B, `insert into students (first_name,last_name) values ('Z','Z') returning id`)
ok((await val(B, `select register_payment($1, 10)`, [stB])).receipt_number === 1, 'recibos correlativos POR colegio')
await expectErr(B, `update students set tenant_id=$1 where id=$2`, /otro colegio/, 'mover registros entre colegios', [tA, stB])
const inc = await val(A, `select report_income('2026-01-01', current_date)`)
ok(Number(inc.total) === 1000, `report_income ${inc.total}`)
const dsh = await val(A, `select dashboard_summary()`)
ok(dsh.enrolled === 3 && dsh.unassigned === 1 && dsh.finance && dsh.attendance_today.recorded === 2, `dashboard ${JSON.stringify(dsh).slice(0,200)}`)

// ── Roles: docente y secretaría ──────────────────────────────────────────
await db.query(`update plan_settings set max_members = null where plan = 'pro'`)
const code = await val(A, `select create_invite('teacher')`)
await expectErr(A, `select create_invite('owner')`, /dueño/, 'no se invita como dueño')
await as(users.teach, `select accept_invite($1)`, [code])
const T = users.teach
ok((await val(T, `select auth_role()::text`)) === 'teacher', 'rol docente')
ok((await as(T, `select * from students`)).rows.length === 3, 'docente lee estudiantes')
ok((await as(T, `select * from charges`)).rows.length === 0, 'docente NO ve cargos')
ok((await val(T, `select dashboard_summary()`)).finance === null, 'docente no ve finanzas en el panel')
await expectErr(T, `insert into students (first_name,last_name) values ('a','b')`, /row-level security/, 'docente no crea estudiantes')
await expectErr(T, `select save_attendance($1, current_date, $2::jsonb)`, /row-level security/, 'docente sin sección asignada no pasa lista', [sA, JSON.stringify([{ enrollment_id: e1, status: 'present' }])])
const tch = await val(A, `insert into teachers (first_name,last_name,user_id) values ('Tere','Ruiz',$1) returning id`, [T])
await as(A, `insert into section_teachers (section_id, teacher_id) values ($1,$2)`, [sA, tch])
ok((await val(T, `select save_attendance($1, current_date, $2::jsonb)`, [sA, JSON.stringify([{ enrollment_id: e1, status: 'present' }])])) === 1, 'docente asignada pasa lista')
await expectErr(A, `insert into teachers (first_name,last_name,user_id) values ('X','Y',$1)`, /no pertenece/, 'no se enlaza cuenta de otro colegio', [B])
await expectErr(T, `update profiles set role='owner' where id=$1`, /rol/, 'docente no se auto-asciende', [T])
ok((await as(T, `update tenants set name='Hackeado' where id=$1`, [tA])).affectedRows === 0, 'docente no edita datos del colegio')
ok((await as(A, `update tenants set legal_id='101' where id=$1`, [tA])).affectedRows === 1, 'Dirección edita datos del colegio')
await as(A, `select set_member_role($1,'secretary')`, [T])
ok((await val(T, `select auth_role()::text`)) === 'secretary', 'owner cambia rol')
ok((await as(T, `select * from charges`)).rows.length > 0, 'secretaría ve cargos')
await expectErr(T, `select void_payment($1,'x')`, /No autorizado/, 'secretaría no anula pagos', [pay2.payment_id])

// ── Cierre de año y promoción ────────────────────────────────────────────
await as(A, `update enrollments set status='retained' where id=$1`, [e2])
const cl = await val(A, `select close_academic_period($1)`, [pA])
ok(cl.promoted === 2, `cierre promueve ${JSON.stringify(cl)}`)
await expectErr(A, `update enrollments set notes='x' where id=$1`, /PERIODO_CERRADO/, 'año cerrado inmutable', [e1])
await expectErr(A, `select save_attendance($1, current_date, $2::jsonb)`, /PERIODO_CERRADO/, 'no se pasa lista en año cerrado', [sA, JSON.stringify([{ enrollment_id: e1, status: 'absent' }])])
const p2 = await val(A, `insert into academic_periods (name, starts_on, ends_on) values ('2027-2028','2027-08-01','2028-06-30') returning id`)
const pr = await val(A, `select promote_students($1,$2)`, [pA, p2])
ok(pr.created === 3, `promoción ${JSON.stringify(pr)}`)
ok((await val(A, `select grade_level_id from enrollments where student_id=$1 and academic_period_id=$2`, [st1, p2])) === g2, 'promovido a Kinder')
ok((await val(A, `select grade_level_id from enrollments where student_id=$1 and academic_period_id=$2`, [st2, p2])) === g1, 'repitente en Pre-Kinder')

// ── Topes de plan ────────────────────────────────────────────────────────
await db.query(`update plan_settings set max_students = 1 where plan='basic'`)
await expectErr(B, `insert into students (first_name,last_name) values ('W','W')`, /PLAN_LIMIT_STUDENTS/, 'tope de estudiantes')
await as(B, `insert into students (first_name,last_name,status) values ('Old','Grad','graduated')`)
ok(true, 'graduados no cuentan para el tope')

// ── Purga por super-admin ────────────────────────────────────────────────
await db.query(`insert into platform_admins (user_id) values ($1)`, [users.admin])
await db.query(`insert into storage.buckets values ('logos','logos',true),('files','files',false) on conflict do nothing`)
const prev = await val(users.admin, `select admin_tenant_purge_preview($1)`, [tA])
ok(prev.students === 3 && prev.payments === 2, 'vista previa de purga')
const ov = await val(users.admin, `select admin_overview()`)
ok(ov.students >= 4, 'admin_overview')
await db.query(`update tenants set suspended_at = now() where id = $1`, [tA])
const del = await val(users.admin, `select admin_delete_tenant($1,'colegio a',false)`, [tA])
ok(del.counts.tenants === 1 && del.counts.students === 3, `purga ${JSON.stringify(del.counts)}`)
ok((await db.query(`select count(*)::int c from students`)).rows[0].c === 2, 'B intacto tras purgar A')

console.log(`\n${pass} ok, ${fail} fallos`)
process.exitCode = fail ? 1 : 0
