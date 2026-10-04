import type {
  AchievementLevel,
  AnnouncementAudience,
  AttendanceStatus,
  ChargeStatus,
  DocumentKind,
  EducationLevel,
  EnrollmentStatus,
  FeeKind,
  GuardianRelationship,
  MemberRole,
  ObservationCategory,
  PaymentMethod,
  PeriodStatus,
  PlanCode,
  SectionTeacherRole,
  StaffStatus,
  StudentStatus,
} from '@/types/db'
import { money } from '@/lib/format'
import { IS_HASH_ROUTER } from '@/lib/router'

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'ArreSchool'
export const APP_TAGLINE = 'Tu colegio, en orden'

/**
 * URL pública del sitio desplegado, SIN barra final.
 *
 * `||` y no `??` a propósito: en CI la variable existe pero puede llegar vacía
 * (''), y `??` solo cubre `undefined`/`null` — la app acabaría generando enlaces
 * a "/#/algo" sin dominio. Con `||`, una cadena vacía también cae al respaldo.
 */
export const PUBLIC_URL =
  (import.meta.env.VITE_PUBLIC_URL || '').replace(/\/$/, '') ||
  `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')

/**
 * Correo de contacto que publican las páginas legales. Es el canal por el que se
 * ejercen los derechos sobre los datos (acceso, corrección, borrado), así que
 * tiene que ser una dirección que alguien lea de verdad.
 */
export const LEGAL_CONTACT_EMAIL = 'hola@arreschool.com'

// ── Planes ──────────────────────────────────────────────────────────────────

export interface PlanInfo {
  code: PlanCode
  name: string
  /** Precio mensual anunciado, en la moneda local. */
  price: number
  /** El mismo precio en dólares, para el cobro internacional. */
  priceUsd: number
  /** Tope de estudiantes ACTIVOS. `null` = ilimitado. */
  maxStudents: number | null
  /** Tope de miembros del equipo. `null` = ilimitado. */
  maxMembers: number | null
  features: string[]
  /** Si se ofrece hoy. Un plan retirado queda en `false` y deja de aparecer. */
  isOffered: boolean
  /** El que la landing resalta como "Recomendado". */
  isFeatured: boolean
  /** Orden en que se muestran. */
  sortOrder: number
}

/** Unidad del precio. Un solo sitio donde cambiar "al mes" por lo que toque. */
export const PLAN_PRICE_UNIT = 'al mes'

/**
 * VALORES DE RESPALDO, no la fuente de verdad.
 *
 * Los precios, los topes y las viñetas viven en la tabla `plan_settings`, que el
 * super-admin edita desde /admin y de la que beben los triggers de la base y la
 * UI (ver `src/hooks/plans.ts`). Esto es lo que se pinta mientras esa consulta
 * carga, o si la app abre sin conexión: sirve para que ningún plan aparezca sin
 * nombre ni precio. Manténlo alineado con la siembra de la migración 0018 (que reescribe la de 0009).
 */
export const PLANS: Record<PlanCode, PlanInfo> = {
  basic: {
    code: 'basic',
    name: 'Gratis',
    price: 0,
    priceUsd: 0,
    maxStudents: 30,
    maxMembers: 2,
    isOffered: true,
    isFeatured: false,
    sortOrder: 1,
    features: [
      'Hasta 30 estudiantes activos',
      '2 usuarios (Dirección + Secretaría)',
      'Estudiantes, familias, asistencia y evaluaciones',
      'Cargos, pagos y recibos',
      'Soporte por correo',
    ],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    price: 1500,
    priceUsd: 25,
    maxStudents: null,
    maxMembers: null,
    isOffered: true,
    isFeatured: true,
    sortOrder: 2,
    features: [
      'Estudiantes ilimitados',
      'Usuarios ilimitados con roles (docentes, secretaría, finanzas)',
      'Boletines y reportes completos',
      'Historial académico de todos los años',
      'Soporte prioritario',
    ],
  },
}

/** Orden de respaldo. Con la tabla cargada manda `planOrderFrom()`. */
export const PLAN_ORDER: PlanCode[] = ['basic', 'pro']

/**
 * Planes que se ofrecen hoy, en orden.
 *
 * Recorre TODOS los planes recibidos y no una lista fija: si partiera de
 * PLAN_ORDER, marcar un plan como visible en /admin no serviría de nada, porque
 * nunca estaría en esa lista. Si el filtro deja el resultado vacío (tabla mal
 * configurada) se cae a PLAN_ORDER: mejor enseñar los de siempre que una
 * pantalla de precios en blanco.
 */
export function planOrderFrom(plans: Record<PlanCode, PlanInfo>): PlanCode[] {
  const offered = (Object.keys(plans) as PlanCode[])
    .filter((c) => plans[c]?.isOffered !== false)
    .sort((a, b) => (plans[a]?.sortOrder ?? 99) - (plans[b]?.sortOrder ?? 99))
  return offered.length ? offered : PLAN_ORDER
}

/** Etiqueta de precio: "Gratis" o "RD$1,500 al mes". */
export function planPriceLabel(plan: PlanInfo): string {
  return plan.price === 0 ? 'Gratis' : `${money(plan.price)} ${PLAN_PRICE_UNIT}`
}

// ── Etiquetas del dominio escolar ───────────────────────────────────────────
// Un `Record` completo por enum (no un objeto suelto): añadir un valor en la base
// sin traducirlo aquí rompe la compilación en vez de pintar "undefined".

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Dirección (dueño)',
  admin: 'Administración',
  secretary: 'Secretaría',
  teacher: 'Docente',
  accountant: 'Finanzas',
}

/** Qué puede hacer cada rol, en una línea, para el selector de invitaciones. */
export const ROLE_HINT: Record<MemberRole, string> = {
  owner: 'Todo, incluido el plan y el equipo',
  admin: 'Todo lo operativo del colegio',
  secretary: 'Estudiantes, familias, inscripciones, asistencia y caja',
  teacher: 'Asistencia y evaluaciones de sus secciones',
  accountant: 'Conceptos, cargos, pagos y anulaciones',
}

export const EDUCATION_LEVEL_LABEL: Record<EducationLevel, string> = {
  initial: 'Inicial',
  primary: 'Primaria',
  secondary: 'Secundaria',
}

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  planning: 'En preparación',
  active: 'En curso',
  closed: 'Cerrado',
}

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  graduated: 'Egresado',
  withdrawn: 'Retirado',
}

export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
}

export const RELATIONSHIP_LABEL: Record<GuardianRelationship, string> = {
  mother: 'Madre',
  father: 'Padre',
  grandparent: 'Abuelo/a',
  sibling: 'Hermano/a',
  uncle_aunt: 'Tío/a',
  tutor: 'Tutor/a legal',
  other: 'Otro',
}

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: 'Inscrito',
  withdrawn: 'Retirado',
  completed: 'Completó',
  promoted: 'Promovido',
  retained: 'Repite',
}

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Ausente',
  late: 'Tardanza',
  excused: 'Excusa',
}

/** Letra corta para la rejilla de asistencia en el teléfono. */
export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  late: 'T',
  excused: 'E',
}

export const ACHIEVEMENT_LABEL: Record<AchievementLevel, string> = {
  achieved: 'Logrado',
  in_progress: 'En proceso',
  started: 'Iniciado',
}

/** Abreviatura que usan los boletines de inicial (L / EP / I). */
export const ACHIEVEMENT_SHORT: Record<AchievementLevel, string> = {
  achieved: 'L',
  in_progress: 'EP',
  started: 'I',
}

export const OBSERVATION_CATEGORY_LABEL: Record<ObservationCategory, string> = {
  academic: 'Académica',
  behavior: 'Conducta',
  health: 'Salud',
  family: 'Familia',
  general: 'General',
}

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  birth_certificate: 'Acta de nacimiento',
  id_document: 'Documento de identidad',
  medical: 'Certificado médico',
  vaccination: 'Tarjeta de vacunas',
  photo: 'Foto',
  previous_school: 'Récord de otro colegio',
  other: 'Otro',
}

export const FEE_KIND_LABEL: Record<FeeKind, string> = {
  enrollment: 'Inscripción',
  tuition: 'Mensualidad',
  materials: 'Materiales',
  uniform: 'Uniforme',
  transport: 'Transporte',
  activity: 'Actividad',
  other: 'Otro',
}

export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  pending: 'Pendiente',
  partial: 'Abonado',
  paid: 'Pagado',
  void: 'Anulado',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
}

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: 'Todo el colegio',
  grade_level: 'Un grado',
  section: 'Una sección',
}

export const SECTION_TEACHER_ROLE_LABEL: Record<SectionTeacherRole, string> = {
  lead: 'Titular',
  assistant: 'Auxiliar',
  subject: 'Por materia',
}

// ── Rutas públicas ──────────────────────────────────────────────────────────

/** Rutas de las páginas legales. Un solo sitio donde cambiarlas. */
export const LEGAL_PATHS = {
  privacy: '/privacidad',
  terms: '/terminos',
} as const

/**
 * Lista CERRADA de rutas que se aceptan como URL "limpia" (sin fragmento).
 * La consume `src/lib/cleanPaths.ts`; allí está el porqué. Que sea cerrada es
 * la parte de seguridad: nada que venga de la URL decide a dónde se navega.
 */
export const CLEAN_PATHS: readonly string[] = [...Object.values(LEGAL_PATHS)]

/**
 * URL ABSOLUTA de una ruta de la app: para enlaces que abren en otra pestaña,
 * para pegarla en el formulario de un tercero y para compartirla por mensaje.
 *
 * No usa `routeHref()` porque aquí el prefijo del despliegue ya viene dentro de
 * PUBLIC_URL; añadirlo otra vez duplicaría el segmento.
 */
export function appUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return IS_HASH_ROUTER ? `${PUBLIC_URL}/#${p}` : `${PUBLIC_URL}${p}`
}

/** URL absoluta de una página legal. */
export function legalUrl(page: keyof typeof LEGAL_PATHS): string {
  return appUrl(LEGAL_PATHS[page])
}
