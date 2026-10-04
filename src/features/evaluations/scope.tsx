import { useState, type ReactNode } from 'react'
import { CalendarRange, Lock, School } from 'lucide-react'
import { useCurrentPeriod, useGradingTerms, useMySections, sectionLabel, type SectionRow } from '@/hooks/academic'
import { usePermissions } from '@/lib/permissions'
import { Field } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import type { AcademicPeriod, AchievementLevel, GradingTerm } from '@/types/db'

/**
 * Lo que comparten Calificar y Boletines: año en curso, sección y corte.
 *
 * Vive en la página (no en cada pestaña) para que la elección sobreviva al
 * cambiar de pestaña: quien acaba de calificar Kinder A del primer trimestre
 * va a generar justo esos boletines, y volver a elegirlo todo es un tropiezo.
 */
export interface EvaluationScope {
  period: AcademicPeriod | null
  sections: SectionRow[]
  terms: GradingTerm[]
  section: SectionRow | null
  term: GradingTerm | null
  setSectionId: (id: string) => void
  setTermId: (id: string) => void
  loading: boolean
  /** Año cerrado o corte cerrado: se ve, pero no se escribe (la base lo impide igual). */
  locked: boolean
}

export function useEvaluationScope(): EvaluationScope {
  const { can } = usePermissions()
  // Dirección y Secretaría ven todas las secciones; una docente, solo las suyas
  // (mismo criterio que `auth_teaches_section()` en la base).
  const seeAll = can('manageAcademics') || can('manageStudents')
  const periodQ = useCurrentPeriod()
  const period = periodQ.current
  const sectionsQ = useMySections(period?.id, seeAll)
  const termsQ = useGradingTerms(period?.id)
  const [sectionId, setSectionId] = useState('')
  const [termId, setTermId] = useState('')

  const sections = sectionsQ.sections
  const terms = termsQ.data ?? []
  const section = sections.find((s) => s.id === sectionId) ?? sections[0] ?? null
  // Por defecto, el primer corte ABIERTO: es en el que se está calificando.
  const term = terms.find((t) => t.id === termId) ?? terms.find((t) => !t.is_closed) ?? terms[0] ?? null

  return {
    period,
    sections,
    terms,
    section,
    term,
    setSectionId,
    setTermId,
    loading: periodQ.isLoading || (Boolean(period) && (sectionsQ.isLoading || termsQ.isLoading)),
    locked: Boolean(term?.is_closed) || period?.status === 'closed',
  }
}

/** Selectores de sección y corte, en dos columnas desde `sm`. */
export function ScopePicker({ scope }: { scope: EvaluationScope }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Sección">
        <Select value={scope.section?.id ?? ''} onChange={(e) => scope.setSectionId(e.target.value)}>
          {scope.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {sectionLabel(s)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Corte de evaluación">
        <Select value={scope.term?.id ?? ''} onChange={(e) => scope.setTermId(e.target.value)}>
          {scope.terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_closed ? ' (cerrado)' : ''}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

/**
 * Pinta los hijos solo cuando hay año, sección y corte. Cada vacío dice QUÉ
 * falta y quién lo resuelve: una docente sin secciones no puede hacer nada
 * desde aquí, y mandarla a configurar algo que su rol no le deja sería peor.
 */
export function ScopeGate({ scope, children }: { scope: EvaluationScope; children: ReactNode }) {
  if (scope.loading) return <PageLoader />
  if (!scope.period) {
    return (
      <EmptyState
        icon={<CalendarRange className="h-6 w-6" />}
        title="Todavía no hay un año escolar"
        description="La Dirección crea y activa el año escolar en Académico → Estructura."
      />
    )
  }
  if (scope.sections.length === 0) {
    return (
      <EmptyState
        icon={<School className="h-6 w-6" />}
        title="No tienes secciones para evaluar"
        description="Cuando la Dirección te asigne a una sección de este año, aparecerá aquí."
      />
    )
  }
  if (scope.terms.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange className="h-6 w-6" />}
        title="Este año no tiene cortes de evaluación"
        description="La Dirección define los cortes (trimestres) del año en Académico → Estructura."
      />
    )
  }
  return (
    <>
      <ScopePicker scope={scope} />
      {scope.locked && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {scope.period.status === 'closed'
            ? 'Este año escolar está cerrado: sus evaluaciones son historia y solo se pueden consultar.'
            : 'Este corte está cerrado: se puede consultar, pero no cambiar. La Dirección puede reabrirlo.'}
        </p>
      )}
      {children}
    </>
  )
}

/**
 * Colores de cada nivel. Un `Record` completo: añadir un nivel al enum sin
 * decidir su color rompe la compilación en vez de pintarlo gris.
 */
export const LEVEL_ACTIVE: Record<AchievementLevel, string> = {
  achieved: 'border-emerald-600 bg-emerald-600 text-white',
  in_progress: 'border-amber-500 bg-amber-500 text-white',
  started: 'border-sky-600 bg-sky-600 text-white',
}

export const LEVEL_BADGE: Record<AchievementLevel, 'green' | 'amber' | 'brand'> = {
  achieved: 'green',
  in_progress: 'amber',
  started: 'brand',
}

export const LEVEL_ORDER: AchievementLevel[] = ['achieved', 'in_progress', 'started']

/** Nombre "Apellido, Nombre" para listas de clase, que se ordenan por apellido. */
export function rosterName(s: { first_name: string; last_name: string } | null | undefined) {
  return s ? `${s.last_name}, ${s.first_name}` : 'Estudiante'
}
