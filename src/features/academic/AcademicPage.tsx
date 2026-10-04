import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { useCurrentPeriod, useGradeLevels, useSections, useTeachers } from '@/hooks/academic'
import { usePermissions } from '@/lib/permissions'
import { cn } from '@/lib/cn'
import { PeriodsTab } from './PeriodsTab'
import { GradesTab } from './GradesTab'
import { SectionsTab } from './SectionsTab'
import { TeachersTab } from './TeachersTab'
import { Notice } from './shared'

/**
 * Estructura del colegio: lo que se configura una vez al año antes de inscribir
 * a nadie. La pestaña va en la URL (`?vista=`) para que recargar o compartir el
 * enlace no devuelva siempre a la primera.
 */
type Tab = 'years' | 'grades' | 'sections' | 'teachers'

const TABS: { value: Tab; label: string }[] = [
  { value: 'years', label: 'Años' },
  { value: 'grades', label: 'Grados' },
  { value: 'sections', label: 'Secciones' },
  { value: 'teachers', label: 'Docentes' },
]

export function AcademicPage() {
  const { can } = usePermissions()
  const canEdit = can('manageAcademics')
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t.value === params.get('vista'))?.value ?? 'years'
  const setTab = (t: Tab) => setParams({ vista: t }, { replace: true })

  return (
    <div>
      <PageHeader
        title="Estructura del colegio"
        description="Años escolares, grados, secciones y docentes."
      />

      {canEdit ? (
        <FirstSteps onGo={setTab} />
      ) : (
        <Notice tone="lock" className="mb-4">
          Solo la Dirección puede cambiar la estructura. Aquí la ves en modo consulta.
        </Notice>
      )}

      <Segmented label="Sección de la estructura" value={tab} onChange={setTab} options={TABS} className="mb-4" />

      {tab === 'years' && <PeriodsTab canEdit={canEdit} />}
      {tab === 'grades' && <GradesTab canEdit={canEdit} />}
      {tab === 'sections' && <SectionsTab canEdit={canEdit} />}
      {tab === 'teachers' && <TeachersTab canEdit={canEdit} />}
    </div>
  )
}

/**
 * Primeros pasos. Un colegio pequeño entra sin saber por dónde empezar; la
 * tarjeta le marca el orden (año → grados → secciones → docentes) y desaparece
 * sola cuando todo está hecho.
 */
function FirstSteps({ onGo }: { onGo: (t: Tab) => void }) {
  const { periods, current, isLoading } = useCurrentPeriod()
  const grades = useGradeLevels()
  const sections = useSections(current?.id)
  const teachers = useTeachers()

  if (isLoading || grades.isLoading || teachers.isLoading) return null

  const steps: { tab: Tab; label: string; done: boolean }[] = [
    { tab: 'years', label: 'Crea y activa el año escolar', done: periods.some((p) => p.status === 'active') },
    { tab: 'grades', label: 'Registra los grados', done: (grades.data ?? []).length > 0 },
    { tab: 'sections', label: 'Crea las secciones del año', done: (sections.data ?? []).length > 0 },
    { tab: 'teachers', label: 'Registra a los docentes', done: (teachers.data ?? []).length > 0 },
  ]
  if (steps.every((s) => s.done)) return null

  return (
    <Card className="mb-4 p-4">
      <p className="text-sm font-semibold text-slate-800">Primeros pasos</p>
      <p className="mt-0.5 text-sm text-slate-500">
        Con esto listo ya puedes inscribir estudiantes y pasar lista.
      </p>
      <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.tab}>
            <button
              type="button"
              onClick={() => onGo(s.tab)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                s.done
                  ? 'border-emerald-100 bg-emerald-50/60 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" />
              )}
              <span className="min-w-0 truncate">
                {i + 1}. {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}
