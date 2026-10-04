import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, ClipboardList, FileText, Plus } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useStudentEnrollments, type StudentEnrollmentRow } from '@/hooks/enrollments'
import { useEnrollmentAttendance } from '@/hooks/attendance'
import { useStudentReportCards, type StudentReportCardRow } from '@/hooks/evaluations'
import { useCurrentPeriod } from '@/hooks/academic'
import { EnrollStudentModal } from '@/features/academic/EnrollStudentModal'
import {
  ATTENDANCE_STATUS_LABEL,
  ENROLLMENT_STATUS_LABEL,
  PERIOD_STATUS_LABEL,
} from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateShort, num } from '@/lib/format'
import type { AttendanceStatus, EnrollmentStatus } from '@/types/db'

const ENROLLMENT_TONE: Record<EnrollmentStatus, 'green' | 'brand' | 'slate' | 'amber' | 'red'> = {
  enrolled: 'green',
  promoted: 'brand',
  completed: 'slate',
  retained: 'amber',
  withdrawn: 'red',
}

const ATTENDANCE_TONE: Record<AttendanceStatus, 'green' | 'red' | 'amber' | 'slate'> = {
  present: 'green',
  absent: 'red',
  late: 'amber',
  excused: 'slate',
}

/**
 * Pestaña "Historial": una línea por año escolar (su inscripción), con los
 * boletines de cada año y la asistencia del más reciente.
 *
 * Todo cuelga de la inscripción, no del estudiante: por eso un cambio de
 * sección o de año nunca reescribe lo que se ve de años anteriores.
 */
export function StudentHistoryTab({ studentId, canManage }: { studentId: string; canManage: boolean }) {
  const { data, isLoading, isError, error } = useStudentEnrollments(studentId)
  const { data: cards } = useStudentReportCards(studentId)
  const { current } = useCurrentPeriod()
  const [enrollOpen, setEnrollOpen] = useState(false)

  const enrollments = useMemo(() => data ?? [], [data])
  const latest = enrollments[0]

  /** Boletines agrupados por inscripción (un año), ordenados por corte. */
  const cardsByEnrollment = useMemo(() => {
    const map = new Map<string, StudentReportCardRow[]>()
    for (const c of cards ?? []) {
      const key = c.enrollment?.id
      if (!key) continue
      map.set(key, [...(map.get(key) ?? []), c])
    }
    for (const list of map.values()) list.sort((a, b) => (a.term?.sort_order ?? 0) - (b.term?.sort_order ?? 0))
    return map
  }, [cards])

  // Se ofrece inscribir solo si el año en curso admite inscripciones y el
  // estudiante todavía no está en él (la base lo impediría con un duplicado).
  const canEnroll =
    canManage &&
    current != null &&
    current.status !== 'closed' &&
    !enrollments.some((e) => e.academic_period_id === current.id)

  if (isLoading) return <PageLoader label="Cargando historial…" />
  if (isError) return <p className="p-6 text-center text-sm text-red-600">{errorMessage(error)}</p>

  return (
    <div className="space-y-4">
      {canEnroll && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-brand-800">
            No está inscrito en <span className="font-semibold">{current?.name}</span>.
          </p>
          <Button size="sm" onClick={() => setEnrollOpen(true)}>
            <Plus className="h-4 w-4" /> Inscribir
          </Button>
        </div>
      )}

      <Card>
        <CardHeader title="Años escolares" subtitle="Grado, sección y cómo terminó cada año" />
        {enrollments.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Todavía sin inscripciones"
            description="Inscríbelo en un año escolar para asignarle grado y sección."
            className="m-4"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {enrollments.map((e) => (
              <EnrollmentLine key={e.id} enrollment={e} cards={cardsByEnrollment.get(e.id) ?? []} />
            ))}
          </ul>
        )}
      </Card>

      {latest && <AttendanceCard enrollment={latest} />}

      <EnrollStudentModal open={enrollOpen} onClose={() => setEnrollOpen(false)} studentId={studentId} />
    </div>
  )
}

function EnrollmentLine({ enrollment: e, cards }: { enrollment: StudentEnrollmentRow; cards: StudentReportCardRow[] }) {
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">{e.period?.name ?? 'Año escolar'}</p>
          <p className="text-sm text-slate-600">
            {e.grade_level?.name ?? '—'}
            {e.section ? ` · Sección ${e.section.name}` : ' · sin sección'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={ENROLLMENT_TONE[e.status]}>{ENROLLMENT_STATUS_LABEL[e.status]}</Badge>
          {e.period && e.period.status !== 'active' && (
            <Badge tone="slate">{PERIOD_STATUS_LABEL[e.period.status]}</Badge>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Inscrito el {fmtDate(e.enrolled_on)}
        {e.ended_on && ` · terminó el ${fmtDate(e.ended_on)}`}
        {e.end_reason && ` · ${e.end_reason}`}
      </p>
      {cards.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <Link
              key={c.id}
              to={`/evaluaciones/boletin/${c.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              <FileText className="h-3.5 w-3.5" />
              Boletín {c.term?.name ?? ''}
              {c.status === 'draft' && <span className="text-amber-600">(borrador)</span>}
            </Link>
          ))}
        </div>
      )}
    </li>
  )
}

/** Resumen de asistencia de la inscripción más reciente. */
function AttendanceCard({ enrollment }: { enrollment: StudentEnrollmentRow }) {
  const { data, isLoading } = useEnrollmentAttendance(enrollment.id)
  const rate =
    data && data.total > 0 ? Math.round((100 * (data.present + data.late)) / data.total) : null

  return (
    <Card>
      <CardHeader
        title="Asistencia"
        subtitle={`${enrollment.period?.name ?? ''} · ${rate == null ? 'sin registros' : `${rate}% de asistencia`}`}
      />
      <CardBody>
        {isLoading || !data ? (
          <PageLoader label="Cargando asistencia…" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Presente" value={num(data.present)} tone="green" />
              <StatCard label="Ausente" value={num(data.absent)} tone="red" />
              <StatCard label="Tardanza" value={num(data.late)} tone="amber" />
              <StatCard label="Excusa" value={num(data.excused)} tone="slate" />
            </div>
            {data.recent.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <CalendarCheck className="h-3.5 w-3.5" /> Últimas faltas y tardanzas
                </p>
                <ul className="space-y-1.5">
                  {data.recent.map((r) => (
                    <li key={r.date} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums text-slate-500">{fmtDateShort(r.date)}</span>
                      <Badge tone={ATTENDANCE_TONE[r.status]}>{ATTENDANCE_STATUS_LABEL[r.status]}</Badge>
                      {r.note && <span className="min-w-0 truncate text-slate-600">{r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
