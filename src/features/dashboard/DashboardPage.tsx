import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CakeSlice,
  CalendarCheck,
  CheckCircle2,
  Circle,
  ClipboardList,
  GraduationCap,
  HandCoins,
  Megaphone,
  Star,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/lib/permissions'
import { useDashboard } from '@/hooks/dashboard'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { PageLoader } from '@/components/ui/misc'
import { PaymentModal } from '@/features/finance/PaymentModal'
import { fmtDate, money, num } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { DashboardSummary } from '@/types/db'

/**
 * Inicio: el colegio en una sola pantalla.
 *
 * Todo sale de `dashboard_summary()` —una sola vuelta de red con las cifras ya
 * agregadas en la base—, así que abre igual de rápido con 20 niños que con 600.
 * Las cifras de dinero llegan en null para quien no maneja finanzas: lo decide
 * la base, y aquí simplemente no se pintan esas tarjetas.
 *
 * Mientras el colegio no haya completado su configuración (año, grados,
 * secciones, docentes, estudiantes, inscripciones) se enseña la guía de
 * "Primeros pasos" arriba: un colegio pequeño tiene que poder arrancar sin que
 * nadie le explique por dónde empezar.
 */
export function DashboardPage() {
  const { profile, tenant, plan } = useAuth()
  const { can, isTeacher } = usePermissions()
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard()
  const [paying, setPaying] = useState(false)

  if (isLoading) return <PageLoader label="Cargando el resumen del colegio…" />

  if (isError || !data) {
    return (
      <div>
        <PageHeader title="Inicio" />
        <Card>
          <CardBody className="space-y-3 text-center">
            <p className="text-sm text-red-600">{errorMessage(error, 'No se pudo cargar el resumen.')}</p>
            <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
              Reintentar
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Solo el primer nombre: en la cabecera de un teléfono, "María de los Ángeles
  // Pérez" empuja el saludo a tres líneas.
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]
  const currency = tenant?.currency
  const today = data.attendance_today
  const fin = data.finance
  const canSetup = can('manageAcademics') || can('manageStudents')

  return (
    <div className="space-y-5">
      <PageHeader
        title={firstName ? `¡Hola, ${firstName}!` : 'Inicio'}
        description={
          data.current_period
            ? `${tenant?.name ?? 'Tu colegio'} · año escolar ${data.current_period.name}`
            : `${tenant?.name ?? 'Tu colegio'} · sin año escolar en curso`
        }
      />

      {canSetup && <FirstSteps data={data} />}

      {/* ── Accesos rápidos ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction to="/asistencia" icon={CalendarCheck} label="Pasar lista" />
        {can('handleFinance') && <QuickAction onClick={() => setPaying(true)} icon={HandCoins} label="Cobrar" />}
        {can('manageStudents') && <QuickAction to="/estudiantes?nuevo=1" icon={UserPlus} label="Nuevo estudiante" />}
        {isTeacher && <QuickAction to="/evaluaciones" icon={Star} label="Evaluar" />}
        <QuickAction to="/comunicados" icon={Megaphone} label="Comunicados" />
      </div>

      {/* ── Colegio ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Estudiantes activos"
          value={num(data.students_active)}
          icon={<GraduationCap className="h-5 w-5" />}
          hint={plan.maxStudents == null ? 'Sin límite en tu plan' : `de ${num(plan.maxStudents)} de tu plan`}
        />
        <StatCard
          label="Inscritos"
          value={num(data.enrolled)}
          icon={<ClipboardList className="h-5 w-5" />}
          tone={data.unassigned > 0 ? 'amber' : 'green'}
          hint={data.unassigned > 0 ? `${num(data.unassigned)} sin sección` : `En ${num(data.sections)} secciones`}
        />
        <StatCard
          label="Asistencia hoy"
          value={today.recorded ? `${num(today.present + today.late)} / ${num(today.recorded)}` : '—'}
          icon={<CalendarCheck className="h-5 w-5" />}
          tone="brand"
          hint={
            data.attendance_rate_30d === null
              ? 'Aún no se ha pasado lista'
              : `${data.attendance_rate_30d}% en los últimos 30 días`
          }
        />
        <StatCard
          label="Cumpleaños del mes"
          value={num(data.birthdays_month)}
          icon={<CakeSlice className="h-5 w-5" />}
          tone="accent"
          hint={today.absent > 0 ? `${num(today.absent)} ausentes hoy` : undefined}
        />
      </div>

      {/* ── Dinero (solo quien maneja finanzas) ─────────────────────────── */}
      {fin && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Por cobrar" value={money(fin.receivable, currency)} icon={<Wallet className="h-5 w-5" />} tone="amber" />
          <StatCard
            label="Vencido"
            value={money(fin.overdue, currency)}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="red"
            hint={fin.students_overdue > 0 ? `${num(fin.students_overdue)} estudiantes en mora` : 'Todo al día'}
          />
          <StatCard label="Cobrado este mes" value={money(fin.collected_month, currency)} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
          <StatCard
            label="Cobrado hoy"
            value={money(fin.collected_today, currency)}
            icon={<HandCoins className="h-5 w-5" />}
            tone="green"
            hint={`${num(fin.payments_today)} pagos`}
          />
        </div>
      )}

      {/* ── Matrícula por grado ─────────────────────────────────────────── */}
      {data.by_grade.length > 0 && (
        <Card>
          <CardHeader
            title="Matrícula por grado"
            subtitle={data.current_period ? `Año ${data.current_period.name}` : undefined}
            action={
              can('manageStudents') ? (
                <Link to="/inscripciones" className="text-sm font-medium text-brand-600 hover:underline">
                  Inscripciones
                </Link>
              ) : undefined
            }
          />
          <ul className="space-y-4 p-5">
            {data.by_grade.map((g) => {
              const cap = g.capacity ?? 0
              const pct = cap > 0 ? Math.min(100, Math.round((100 * g.enrolled) / cap)) : null
              return (
                <li key={g.grade_level_id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-700">{g.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {num(g.enrolled)}
                      {cap > 0 && ` / ${num(cap)}`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn('h-full rounded-full', pct !== null && pct >= 100 ? 'bg-red-500' : 'bg-brand-500')}
                      // Sin capacidad definida la barra va llena a medias de
                      // propósito: no hay un 100% contra el que medir.
                      style={{ width: `${pct ?? (g.enrolled > 0 ? 50 : 0)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {data.current_period && (
        <p className="text-center text-xs text-slate-400">
          Año escolar del {fmtDate(data.current_period.starts_on)} al {fmtDate(data.current_period.ends_on)}
        </p>
      )}

      {can('handleFinance') && <PaymentModal open={paying} onClose={() => setPaying(false)} />}
    </div>
  )
}

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function QuickAction({
  to,
  onClick,
  icon: Icon,
  label,
}: {
  to?: string
  onClick?: () => void
  icon: LucideIcon
  label: string
}) {
  const cls =
    'flex h-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/40'
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(cls, 'text-left')}>
      {inner}
    </button>
  )
}

/**
 * Guía de arranque. Cada paso se marca solo, a partir de las cifras del panel:
 * no hay una casilla que alguien tenga que acordarse de tildar. Desaparece
 * cuando el colegio ya tiene estudiantes inscritos en un año activo.
 */
function FirstSteps({ data }: { data: DashboardSummary }) {
  const steps: { done: boolean; label: string; hint: string; to: string }[] = [
    { done: Boolean(data.current_period), label: 'Crea y activa el año escolar', hint: 'Ej. 2026-2027', to: '/academico' },
    { done: data.by_grade.length > 0, label: 'Crea los grados', hint: 'Maternal, Pre-Kinder, Kinder…', to: '/academico' },
    { done: data.sections > 0, label: 'Crea las secciones del año', hint: 'Kinder A, Kinder B…', to: '/academico' },
    { done: data.teachers_active > 0, label: 'Registra a las docentes', hint: 'Y asígnalas a sus secciones', to: '/academico' },
    { done: data.students_total > 0, label: 'Registra a los estudiantes', hint: 'Con sus padres o tutores', to: '/estudiantes' },
    { done: data.enrolled > 0, label: 'Inscríbelos en el año', hint: 'Y asígnales sección', to: '/inscripciones' },
  ]
  const pending = steps.filter((s) => !s.done).length
  if (pending === 0) return null

  return (
    <Card>
      <CardHeader
        title="Primeros pasos en ArreSchool"
        subtitle={`Te faltan ${pending} de ${steps.length} pasos para tener el colegio listo`}
      />
      <ol className="divide-y divide-slate-100">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className={cn('flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50', s.done && 'opacity-60')}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium text-slate-800', s.done && 'line-through')}>
                  {i + 1}. {s.label}
                </p>
                <p className="truncate text-xs text-slate-500">{s.hint}</p>
              </div>
              {!s.done && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
