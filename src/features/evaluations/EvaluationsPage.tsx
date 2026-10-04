import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Segmented } from '@/components/ui/Segmented'
import { CurriculumTab } from './CurriculumTab'
import { GradeTab } from './GradeTab'
import { ReportCardsTab } from './ReportCardsTab'
import { ScopeGate, useEvaluationScope } from './scope'

type Tab = 'grade' | 'cards' | 'curriculum'

const TABS: { value: Tab; label: string }[] = [
  { value: 'grade', label: 'Calificar' },
  { value: 'cards', label: 'Boletines' },
  { value: 'curriculum', label: 'Competencias' },
]

const DESCRIPTION: Record<Tab, string> = {
  grade: 'Evalúa los indicadores de logro de cada estudiante en el corte.',
  cards: 'Genera, revisa y publica los boletines de la sección.',
  curriculum: 'Competencias e indicadores que se evalúan en cada grado.',
}

/**
 * Evaluaciones (ArreSchool Teacher): calificar → boletines, más el currículo.
 * La sección y el corte elegidos se comparten entre Calificar y Boletines (ver
 * `useEvaluationScope`), porque es el orden natural del trabajo.
 */
export function EvaluationsPage() {
  const [tab, setTab] = useState<Tab>('grade')
  const scope = useEvaluationScope()

  return (
    <div>
      <PageHeader title="Evaluaciones" description={DESCRIPTION[tab]} />
      <Segmented label="Sección de evaluaciones" value={tab} onChange={setTab} options={TABS} className="mb-4" />
      {tab === 'curriculum' ? (
        <CurriculumTab />
      ) : (
        <ScopeGate scope={scope}>{tab === 'grade' ? <GradeTab scope={scope} /> : <ReportCardsTab scope={scope} />}</ScopeGate>
      )}
    </div>
  )
}
