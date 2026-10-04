import { useMemo, useState } from 'react'
import { ClipboardCheck, Users } from 'lucide-react'
import { useSectionRoster } from '@/hooks/enrollments'
import { competenciesForGrade, useCompetencies, useSectionAssessments } from '@/hooks/evaluations'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { GradingSheetModal } from './GradingSheetModal'
import { rosterName, type EvaluationScope } from './scope'

/**
 * Calificar: la lista de clase con el avance de cada estudiante en el corte.
 *
 * El avance se cuenta sobre los indicadores ACTIVOS de las competencias del
 * grado: "12/15" le dice a la docente a quién le falta algo sin abrir hoja por
 * hoja. Un indicador evaluado que luego se desactivó no infla el número.
 */
export function GradeTab({ scope }: { scope: EvaluationScope }) {
  const section = scope.section!
  const term = scope.term!
  const roster = useSectionRoster(section.id)
  const assessments = useSectionAssessments(section.id, term.id)
  const competencies = useCompetencies()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const forGrade = useMemo(
    () => competenciesForGrade(competencies.data ?? [], section.grade_level_id),
    [competencies.data, section.grade_level_id],
  )
  const activeIds = useMemo(
    () => new Set(forGrade.flatMap((c) => c.indicators.filter((i) => i.active).map((i) => i.id))),
    [forGrade],
  )
  const total = activeIds.size

  const doneBy = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of assessments.data ?? []) {
      if (!activeIds.has(a.indicator_id)) continue
      map.set(a.enrollment_id, (map.get(a.enrollment_id) ?? 0) + 1)
    }
    return map
  }, [assessments.data, activeIds])

  const students = roster.data ?? []

  if (roster.isLoading || assessments.isLoading || competencies.isLoading) {
    return <PageLoader label="Cargando la lista de clase…" />
  }
  const error = roster.error ?? assessments.error ?? competencies.error
  if (error) {
    return (
      <Card className="p-8 text-center text-sm text-red-600">
        {errorMessage(error, 'No se pudo cargar la evaluación.')}
      </Card>
    )
  }
  if (students.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Esta sección no tiene estudiantes"
        description="Asigna estudiantes a la sección desde Inscripciones."
      />
    )
  }
  if (total === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-6 w-6" />}
        title="No hay indicadores para este grado"
        description="Configura las competencias e indicadores del grado en la pestaña Competencias."
      />
    )
  }

  const complete = students.filter((e) => (doneBy.get(e.id) ?? 0) >= total).length

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{complete}</span> de {students.length} estudiantes
            con todo evaluado · {total} indicadores
          </p>
          <Button size="sm" onClick={() => setOpenIndex(0)}>
            <ClipboardCheck className="h-4 w-4" /> {scope.locked ? 'Ver hojas' : 'Calificar en orden'}
          </Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {students.map((e, i) => {
            const done = doneBy.get(e.id) ?? 0
            const pct = Math.min(100, Math.round((done / total) * 100))
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{rosterName(e.student)}</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {done >= total ? (
                    <Badge tone="green">Completo</Badge>
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {done}/{total}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <GradingSheetModal
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
        roster={students}
        index={openIndex ?? 0}
        onIndex={setOpenIndex}
        term={term}
        competencies={forGrade}
        assessments={assessments.data ?? []}
        readOnly={scope.locked}
        numeric={section.grade_level?.education_level !== 'initial'}
      />
    </>
  )
}
