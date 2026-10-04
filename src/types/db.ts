// Tipos del dominio: espejo a mano del esquema de supabase/migrations.
//
// Se escriben a mano (y no con `npm run types:gen`) porque la mitad de lo que
// consume la app no son tablas sino el JSON que devuelven las RPC
// `security definer`, que el generador no sabe describir. Los nombres de campo
// van en snake_case, IGUAL que en la base: así una fila cruda de PostgREST o el
// jsonb de una RPC encajan sin traducir nada por el medio, que es donde se
// cuelan los errores silenciosos.
//
// Regla: si cambias una columna o el `jsonb_build_object` de una RPC, cambia
// también su interfaz aquí en el mismo commit.

// ── Enums (espejo de los `create type` de 0001) ─────────────────────────────
/** owner/admin del starter + los roles del colegio (0012). */
export type MemberRole = 'owner' | 'admin' | 'secretary' | 'teacher' | 'accountant'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'
export type PlanCode = 'basic' | 'pro'
export type PlanRequestStatus = 'pending' | 'approved' | 'rejected'

// ── Tablas del núcleo ───────────────────────────────────────────────────────

/** El negocio / espacio de trabajo. Todo lo demás cuelga de aquí. */
export interface Tenant {
  id: string
  name: string
  logo_url: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  currency: string
  locale: string
  /** RNC / registro oficial. Sale en recibos y boletines. */
  legal_id: string | null
  /** Firma del boletín. */
  principal_name: string | null
  /** Texto al pie del recibo (cuenta bancaria, política de pagos…). */
  receipt_footer: string | null
  /** Suspensión comercial: mientras esté puesta, el colegio queda en solo lectura. */
  suspended_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Un usuario de auth y el negocio al que pertenece.
 * `tenant_id` en null significa "todavía sin negocio": o le falta el onboarding,
 * o es una cuenta de plataforma (super-admin), que por diseño no tiene negocio.
 */
export interface Profile {
  id: string
  tenant_id: string | null
  full_name: string | null
  avatar_url: string | null
  role: MemberRole
  created_at: string
}

/** Una por negocio (`tenant_id` es unique). El cliente solo la LEE. */
export interface Subscription {
  id: string
  tenant_id: string
  plan: PlanCode
  status: SubscriptionStatus
  started_at: string
  trial_ends_at: string | null
  current_period_end: string | null
  updated_at: string
}

export interface Notification {
  id: string
  tenant_id: string
  title: string
  body: string | null
  read: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  tenant_id: string
  user_id: string | null
  action: string
  entity: string | null
  entity_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

// ── Super-admin de plataforma (cross-tenant) ────────────────────────────────
// Estas formas NO son tablas: son el jsonb que devuelven las RPC `admin_*`.

/** `admin_overview()` — cifras globales de la plataforma. */
export interface AdminOverview {
  tenants: number
  members: number
  students: number
  active_students: number
  /** Suma de pagos válidos de todos los colegios. */
  collected_total: number
  platform_admins: number
  /**
   * Agregados como objeto {plan: n} y no como columnas fijas: si mañana el enum
   * `plan_code` crece, la UI no se queda ciega. De ahí el `Partial`: un plan sin
   * suscripciones no aparece en el objeto.
   */
  by_plan: Partial<Record<PlanCode, number>>
  by_status: Partial<Record<SubscriptionStatus, number>>
}

/** `admin_list_tenants()` — una fila por negocio, con su plan y su dueño. */
export interface AdminTenantRow {
  id: string
  name: string
  created_at: string
  whatsapp: string | null
  currency: string
  suspended: boolean
  /** null si el negocio se quedó sin fila en `subscriptions` (dato inconsistente). */
  plan: PlanCode | null
  sub_status: SubscriptionStatus | null
  trial_ends_at: string | null
  owner_name: string | null
  owner_email: string | null
  members: number
  students: number
  active_students: number
  collected_total: number
}

/** `admin_list_members(p_tenant)` — miembros de un negocio + estado de su cuenta. */
export interface AdminMember {
  id: string
  full_name: string | null
  role: MemberRole
  created_at: string
  email: string | null
  /** `auth.users.banned_until` en el futuro: la cuenta no puede iniciar sesión. */
  banned: boolean
}

/** `admin_list_platform_admins()`. */
export interface PlatformAdminRow {
  user_id: string
  email: string | null
  note: string | null
  created_at: string
}

/** `admin_tenant_summary(p_tenant)` — el dashboard de un negocio, visto desde fuera. */
export interface AdminTenantSummary {
  students_total: number
  students_active: number
  /** Inscritos en el año activo. */
  enrolled: number
  teachers: number
  guardians: number
  sections: number
  collected_total: number
  collected_this_month: number
  members: number
  /** Estudiantes creados desde el lunes. */
  created_this_week: number
  pending_invites: number
}

// ── Solicitudes de cambio de plan ───────────────────────────────────────────

/** Vista de la dueña: su propia solicitud (lectura directa de `plan_requests`). */
export interface MyPlanRequest {
  id: string
  requested_plan: PlanCode
  status: PlanRequestStatus
  created_at: string
}

/** Vista del super-admin: todas las solicitudes, con el negocio que las pidió. */
export interface AdminPlanRequestRow {
  id: string
  tenant_id: string
  tenant_name: string
  requested_plan: PlanCode
  current_plan: PlanCode | null
  status: PlanRequestStatus
  note: string | null
  created_at: string
  resolved_at: string | null
  whatsapp: string | null
  owner_name: string | null
  owner_email: string | null
}

// ── Eliminar un negocio (borrado en cascada) ────────────────────────────────

/** `admin_tenant_purge_preview()` — lo que se va a borrar, para enseñarlo ANTES de confirmar. */
export interface AdminTenantPurgePreview {
  tenant_id: string
  name: string
  suspended: boolean
  created_at: string
  owner_email: string | null
  members: number
  students: number
  active_students: number
  guardians: number
  enrollments: number
  payments: number
  collected_total: number
  notifications: number
  audit_logs: number
  invites: number
  plan_requests: number
  /** `null` = no se pudo contar (sin privilegio sobre Storage), que NO es "cero". */
  files: number | null
}

/**
 * `admin_delete_tenant()` + lo que añade el cliente tras vaciar Storage.
 * Los archivos NO se borran por SQL (dejaría el blob huérfano en el bucket): la
 * RPC devuelve sus rutas y la app las elimina con la API, así que las cifras de
 * archivos se completan en el navegador.
 */
export interface AdminTenantPurgeResult {
  tenant_id: string
  name: string
  /** Filas borradas por tabla. `files: -1` = el servidor no pudo leer Storage. */
  counts: Record<string, number>
  files: { bucket: string; path: string }[]
  /** Archivos que la propia app borró del bucket (no viene del servidor). */
  files_removed: number
  files_failed: number
  /** Archivos que siguen en el bucket tras el intento; `null` si no se pudo listar. */
  files_pending: number | null
  /** `true` = no hay cuenta fiable de archivos, así que la UI no debe cantar victoria. */
  files_unknown: boolean
}

/** `admin_list_tenant_purges()` — bitácora: un negocio que ya se eliminó. */
export interface AdminTenantPurgeRow {
  id: string
  tenant_id: string
  tenant_name: string
  owner_email: string | null
  deleted_by_email: string | null
  deleted_users: boolean
  counts: Record<string, number>
  created_at: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Dominio escolar (migraciones 0012-0017)
// ═══════════════════════════════════════════════════════════════════════════
// Ninguna interfaz de escritura lleva `tenant_id` como dato a enviar: la base lo
// pone (`default auth_tenant_id()`) y rechaza cualquier otro. Aparece en las
// filas porque PostgREST lo devuelve, no porque el cliente lo decida.

// ── Enums (espejo de 0012) ──────────────────────────────────────────────────
export type EducationLevel = 'initial' | 'primary' | 'secondary'
export type PeriodStatus = 'planning' | 'active' | 'closed'
export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'withdrawn'
export type StaffStatus = 'active' | 'inactive'
export type GuardianRelationship =
  | 'mother'
  | 'father'
  | 'grandparent'
  | 'sibling'
  | 'uncle_aunt'
  | 'tutor'
  | 'other'
export type EnrollmentStatus = 'enrolled' | 'withdrawn' | 'completed' | 'promoted' | 'retained'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type AchievementLevel = 'achieved' | 'in_progress' | 'started'
export type ReportCardStatus = 'draft' | 'published'
export type DocumentKind =
  | 'birth_certificate'
  | 'id_document'
  | 'medical'
  | 'vaccination'
  | 'photo'
  | 'previous_school'
  | 'other'
export type FeeKind = 'enrollment' | 'tuition' | 'materials' | 'uniform' | 'transport' | 'activity' | 'other'
export type ChargeStatus = 'pending' | 'partial' | 'paid' | 'void'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'check' | 'other'
export type PaymentStatus = 'valid' | 'void'
export type AnnouncementAudience = 'all' | 'grade_level' | 'section'
export type ObservationCategory = 'academic' | 'behavior' | 'health' | 'family' | 'general'
export type SectionTeacherRole = 'lead' | 'assistant' | 'subject'

// ── Estructura (0013) ───────────────────────────────────────────────────────

/** Año escolar. Solo uno `active` por colegio; `closed` = historia congelada. */
export interface AcademicPeriod {
  id: string
  tenant_id: string
  name: string
  /** 'YYYY-MM-DD' */
  starts_on: string
  ends_on: string
  status: PeriodStatus
  created_at: string
  updated_at: string
}

/** Corte de evaluación dentro del año (trimestre…). */
export interface GradingTerm {
  id: string
  tenant_id: string
  academic_period_id: string
  name: string
  sort_order: number
  starts_on: string | null
  ends_on: string | null
  is_closed: boolean
  created_at: string
  updated_at: string
}

/** Grado (Maternal, Pre-Kinder…). No depende del año; `sort_order` define la promoción. */
export interface GradeLevel {
  id: string
  tenant_id: string
  name: string
  education_level: EducationLevel
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

/** Ficha del docente. `user_id` la enlaza (opcional) a una cuenta con rol `teacher`. */
export interface Teacher {
  id: string
  tenant_id: string
  user_id: string | null
  first_name: string
  last_name: string
  document_id: string | null
  email: string | null
  phone: string | null
  specialty: string | null
  hired_on: string | null
  status: StaffStatus
  notes: string | null
  created_at: string
  updated_at: string
}

/** Un grupo de un grado en un año ("Kinder A" de 2026-2027). */
export interface Section {
  id: string
  tenant_id: string
  academic_period_id: string
  grade_level_id: string
  name: string
  capacity: number | null
  room: string | null
  shift: string | null
  created_at: string
  updated_at: string
}

export interface SectionTeacher {
  id: string
  tenant_id: string
  section_id: string
  teacher_id: string
  role: SectionTeacherRole
  subject: string | null
  created_at: string
}

// ── Estudiantes y familias (0014) ───────────────────────────────────────────

export interface Student {
  id: string
  tenant_id: string
  /** Matrícula. La asigna la base (EST-000001) si se deja vacía. */
  code: string
  first_name: string
  last_name: string
  birth_date: string | null
  gender: 'F' | 'M' | 'X' | null
  document_id: string | null
  nationality: string | null
  address: string | null
  blood_type: string | null
  allergies: string | null
  medical_notes: string | null
  /** Ruta en el bucket privado `files` (<tenant_id>/students/…), no una URL. */
  photo_path: string | null
  status: StudentStatus
  admission_date: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Guardian {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  document_id: string | null
  phone: string | null
  phone_alt: string | null
  email: string | null
  occupation: string | null
  workplace: string | null
  address: string | null
  /** Reservado para ArreSchool Family (portal de familias). */
  user_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StudentGuardian {
  id: string
  tenant_id: string
  student_id: string
  guardian_id: string
  relationship: GuardianRelationship
  is_primary: boolean
  lives_with: boolean
  can_pickup: boolean
  is_emergency_contact: boolean
  is_financial_responsible: boolean
  created_at: string
}

export interface StudentDocument {
  id: string
  tenant_id: string
  student_id: string
  kind: DocumentKind
  title: string
  file_path: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

/** El paso de un estudiante por UN año escolar. El historial es su lista de inscripciones. */
export interface Enrollment {
  id: string
  tenant_id: string
  student_id: string
  academic_period_id: string
  grade_level_id: string
  /** null = inscrito sin sección todavía. */
  section_id: string | null
  status: EnrollmentStatus
  enrolled_on: string
  ended_on: string | null
  end_reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Aula (0015) ─────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string
  tenant_id: string
  enrollment_id: string
  /** Foto de la sección en la que estaba ese día (la pone la base). */
  section_id: string | null
  date: string
  status: AttendanceStatus
  note: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export interface Competency {
  id: string
  tenant_id: string
  /** null = aplica a todos los grados. */
  grade_level_id: string | null
  area: string
  name: string
  description: string | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Indicator {
  id: string
  tenant_id: string
  competency_id: string
  description: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Assessment {
  id: string
  tenant_id: string
  enrollment_id: string
  academic_period_id: string
  grading_term_id: string
  indicator_id: string
  section_id: string | null
  level: AchievementLevel | null
  /** numeric(5,2), 0-100. Para primaria/secundaria. */
  score: number | null
  comment: string | null
  assessed_by: string | null
  created_at: string
  updated_at: string
}

export interface StudentObservation {
  id: string
  tenant_id: string
  enrollment_id: string
  section_id: string | null
  grading_term_id: string | null
  category: ObservationCategory
  body: string
  visible_to_family: boolean
  author_id: string | null
  created_at: string
  updated_at: string
}

/** Foto congelada de un boletín (`build_report_card_snapshot`, 0015). */
export interface ReportCardSnapshot {
  school?: {
    name: string
    logo_url: string | null
    address: string | null
    phone: string | null
    principal_name: string | null
  }
  student?: {
    id: string
    code: string
    first_name: string
    last_name: string
    birth_date: string | null
  }
  period?: { name: string; starts_on: string; ends_on: string }
  term?: { name: string; starts_on: string | null; ends_on: string | null }
  grade?: { name: string; education_level: EducationLevel }
  section?: { name: string } | null
  teachers?: string[]
  competencies?: {
    area: string
    name: string
    indicators: {
      description: string
      level: AchievementLevel | null
      score: number | null
      comment: string | null
    }[]
  }[]
  attendance?: { present: number; absent: number; late: number; excused: number; total: number }
  observations?: { category: ObservationCategory; body: string; created_at: string }[]
  generated_at?: string
}

export interface ReportCard {
  id: string
  tenant_id: string
  enrollment_id: string
  grading_term_id: string
  section_id: string | null
  status: ReportCardStatus
  snapshot: ReportCardSnapshot
  general_comment: string | null
  generated_by: string | null
  published_at: string | null
  published_by: string | null
  created_at: string
  updated_at: string
}

// ── Finanzas (0016) ─────────────────────────────────────────────────────────

export interface FeeConcept {
  id: string
  tenant_id: string
  name: string
  kind: FeeKind
  default_amount: number
  is_recurring: boolean
  active: boolean
  created_at: string
  updated_at: string
}

/** Lo que se debe. `amount_paid` y `status` los calcula la base. */
export interface Charge {
  id: string
  tenant_id: string
  student_id: string
  enrollment_id: string | null
  fee_concept_id: string | null
  description: string
  amount: number
  amount_paid: number
  status: ChargeStatus
  due_date: string | null
  /** Primer día del mes que cubre (mensualidades). */
  billing_month: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Dinero recibido. Inmutable: solo se anula (`void_payment`). */
export interface Payment {
  id: string
  tenant_id: string
  student_id: string
  guardian_id: string | null
  payer_name: string | null
  /** Correlativo por colegio; nunca se reutiliza. */
  receipt_number: number
  amount: number
  method: PaymentMethod
  reference: string | null
  paid_on: string
  notes: string | null
  status: PaymentStatus
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  received_by: string | null
  created_at: string
}

export interface PaymentAllocation {
  id: string
  tenant_id: string
  payment_id: string
  charge_id: string
  student_id: string
  amount: number
  created_at: string
}

/** Vista `student_accounts`: saldo por estudiante (con la RLS de quien consulta). */
export interface StudentAccount {
  tenant_id: string
  student_id: string
  code: string
  first_name: string
  last_name: string
  status: StudentStatus
  total_charged: number
  total_paid: number
  balance: number
  overdue: number
  open_charges: number
  next_due_date: string | null
  /** Saldo a favor: pagos válidos sin aplicar a ningún cargo. */
  credit: number
}

/** `register_payment()` */
export interface RegisterPaymentResult {
  payment_id: string
  receipt_number: number
  allocated: number
  credit: number
}

// ── Comunicados (0017) ──────────────────────────────────────────────────────

export interface Announcement {
  id: string
  tenant_id: string
  title: string
  body: string
  audience: AnnouncementAudience
  grade_level_id: string | null
  section_id: string | null
  pinned: boolean
  published_at: string
  expires_on: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Panel y reportes (0017) ─────────────────────────────────────────────────

/**
 * `dashboard_summary()`. OJO: devuelve `{}` cuando la cuenta no tiene colegio
 * (onboarding pendiente o super-admin); el hook rellena los valores por defecto.
 * `finance` llega en null para quien no maneja finanzas (lo decide la base).
 */
export interface DashboardSummary {
  current_period: { id: string; name: string; starts_on: string; ends_on: string } | null
  students_active: number
  students_total: number
  enrolled: number
  /** Inscritos del año activo todavía sin sección. */
  unassigned: number
  sections: number
  teachers_active: number
  guardians: number
  members: number
  birthdays_month: number
  attendance_today: { present: number; absent: number; late: number; excused: number; recorded: number }
  /** % presentes+tardanzas de los últimos 30 días; null sin registros. */
  attendance_rate_30d: number | null
  by_grade: { grade_level_id: string; name: string; enrolled: number; capacity: number | null }[]
  finance: {
    receivable: number
    overdue: number
    students_overdue: number
    collected_month: number
    collected_today: number
    payments_today: number
  } | null
}

/** Fila de `report_attendance()`. */
export interface AttendanceReportRow {
  enrollment_id: string
  student_id: string
  first_name: string
  last_name: string
  section_name: string
  present: number
  absent: number
  late: number
  excused: number
  total: number
  rate: number | null
}

/** `report_income()`. */
export interface IncomeReport {
  total: number
  count: number
  by_method: { method: PaymentMethod; total: number; count: number }[]
  by_concept: { concept: string; total: number }[]
  unallocated: number
  by_day: { date: string; total: number }[]
}

/** Fila de `report_enrollment()`. */
export interface EnrollmentReportRow {
  grade_level_id: string
  grade_name: string
  section_id: string | null
  section_name: string | null
  capacity: number | null
  enrolled: number
  withdrawn: number
  female: number
  male: number
}

/** `list_team_members()` (solo Dirección): miembros con su correo. */
export interface TeamMemberWithEmail {
  id: string
  full_name: string | null
  role: MemberRole
  email: string | null
  created_at: string
}
