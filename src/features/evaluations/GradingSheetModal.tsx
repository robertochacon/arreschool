import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useSaveAssessments, type AssessmentMark, type CompetencyRow } from '@/hooks/evaluations'
import type { EnrollmentRow } from '@/hooks/enrollments'
import { ACHIEVEMENT_LABEL, ACHIEVEMENT_SHORT } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { ObservationsPanel } from './ObservationsPanel'
import { LEVEL_ACTIVE, LEVEL_ORDER, rosterName } from './scope'
import type { AchievementLevel, Assessment, GradingTerm } from '@/types/db'

/** Marca en edición. `score` como texto: viene de un <input> (ver ItemFormModal del starter). */
interface Mark {
  level: AchievementLevel | null
  score: string
  comment: string
}

type Pane = 'grade' | 'notes'

const EMPTY_MARK: Mark = { level: null, score: '', comment: '' }

/**
 * Hoja de evaluación de UN estudiante en un corte, con paso al siguiente.
 *
 * La docente califica a 20-25 niños seguidos: la hoja se queda abierta y
 * "Guardar y siguiente" encadena la lista de clase. El cuerpo se monta con
 * `key` por estudiante para que el estado local arranque limpio con sus marcas
 * y nunca se arrastre lo del niño anterior.
 */
export function GradingSheetModal({
  open,
  onClose,
  roster,
  index,
  onIndex,
  term,
  competencies,
  assessments,
  readOnly,
  numeric,
}: {
  open: boolean
  onClose: () => void
  roster: EnrollmentRow[]
  index: number
  onIndex: (i: number) => void
  term: GradingTerm
  /** Ya filtradas para el grado de la sección. */
  competencies: CompetencyRow[]
  /** Todas las de la sección en este corte. */
  assessments: Assessment[]
  readOnly: boolean
  /** Primaria/secundaria: además del nivel, nota de 0 a 100. */
  numeric: boolean
}) {
  const enrollment = roster[index]
  if (!open || !enrollment) return null
  return (
    <Sheet
      key={enrollment.id}
      onClose={onClose}
      roster={roster}
      index={index}
      onIndex={onIndex}
      term={term}
      competencies={competencies}
      assessments={assessments}
      readOnly={readOnly}
      numeric={numeric}
    />
  )
}

function Sheet({
  onClose,
  roster,
  index,
  onIndex,
  term,
  competencies,
  assessments,
  readOnly,
  numeric,
}: Omit<Parameters<typeof GradingSheetModal>[0], 'open'>) {
  const toast = useToast()
  const save = useSaveAssessments()
  const enrollment = roster[index]
  const [pane, setPane] = useState<Pane>('grade')
  const [openComments, setOpenComments] = useState<Set<string>>(new Set())

  // Foto de partida: contra ella se decide qué cambió y si hay algo sin guardar.
  // Se toma UNA vez al montar (hay un `key` por estudiante): si el refetch tras
  // guardar la reescribiera, se perdería lo que se está editando.
  const [initial] = useState(() => {
    const map: Record<string, Mark> = {}
    for (const a of assessments) {
      if (a.enrollment_id !== enrollment.id) continue
      map[a.indicator_id] = {
        level: a.level,
        score: a.score == null ? '' : String(a.score),
        comment: a.comment ?? '',
      }
    }
    return map
  })
  const [marks, setMarks] = useState<Record<string, Mark>>(initial)

  const get = (id: string) => marks[id] ?? EMPTY_MARK
  const set = (id: string, patch: Partial<Mark>) =>
    setMarks((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY_MARK), ...patch } }))

  const changed = useMemo(() => {
    const ids = new Set([...Object.keys(initial), ...Object.keys(marks)])
    return [...ids].filter((id) => {
      const a = initial[id] ?? EMPTY_MARK
      const b = marks[id] ?? EMPTY_MARK
      return a.level !== b.level || a.score.trim() !== b.score.trim() || a.comment.trim() !== b.comment.trim()
    })
  }, [initial, marks])
  const dirty = changed.length > 0

  // Agrupadas por área, en el orden del currículo: es como se lee el boletín.
  const areas = useMemo(() => {
    const out: { area: string; items: CompetencyRow[] }[] = []
    for (const c of competencies) {
      const last = out[out.length - 1]
      if (last && last.area === c.area) last.items.push(c)
      else out.push({ area: c.area, items: [c] })
    }
    return out
  }, [competencies])

  const indicatorIds = competencies.flatMap((c) => c.indicators.filter((i) => i.active).map((i) => i.id))
  const done = indicatorIds.filter((id) => get(id).level || get(id).score.trim()).length

  const persist = async (): Promise<boolean> => {
    if (!dirty) return true
    const payload: AssessmentMark[] = []
    for (const id of changed) {
      const m = marks[id] ?? EMPTY_MARK
      const score = m.score.trim() === '' ? null : Number(m.score)
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
        toast.error('La nota debe estar entre 0 y 100')
        return false
      }
      // Sin nivel ni nota la marca se quita; el comentario solo no basta (la
      // base exige un valor), así que se descarta con ella.
      payload.push({ indicator_id: id, level: m.level, score, comment: m.comment.trim() || null })
    }
    try {
      await save.mutateAsync({ enrollment_id: enrollment.id, term_id: term.id, marks: payload })
      toast.success(`Evaluación de ${enrollment.student?.first_name ?? 'estudiante'} guardada`)
      return true
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar la evaluación'))
      return false
    }
  }

  const go = async (next: number, saveFirst: boolean) => {
    if (saveFirst) {
      if (!(await persist())) return
    } else if (dirty && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) {
      return
    }
    if (next < 0 || next >= roster.length) onClose()
    else onIndex(next)
  }

  const close = () => {
    if (dirty && !readOnly && !window.confirm('Hay cambios sin guardar. ¿Cerrar sin guardarlos?')) return
    onClose()
  }

  const toggleComment = (id: string) =>
    setOpenComments((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const isLast = index === roster.length - 1

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={`${rosterName(enrollment.student)} · ${term.name}`}
      footer={
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label="Estudiante anterior"
            disabled={index === 0}
            onClick={() => void go(index - 1, false)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="mr-auto px-1 text-xs tabular-nums text-slate-500">
            {index + 1} / {roster.length}
          </span>
          {readOnly ? (
            <Button variant="outline" onClick={() => void go(index + 1, false)} disabled={isLast}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void persist()} loading={save.isPending} disabled={!dirty}>
                Guardar
              </Button>
              <Button onClick={() => void go(index + 1, true)} loading={save.isPending}>
                {isLast ? 'Guardar y cerrar' : 'Guardar y seguir'}
              </Button>
            </>
          )}
        </>
      }
    >
      <Segmented
        label="Sección de la hoja"
        value={pane}
        onChange={setPane}
        options={[
          { value: 'grade', label: `Evaluación (${done}/${indicatorIds.length})` },
          { value: 'notes', label: 'Anecdotario' },
        ]}
        className="mb-4"
      />

      {pane === 'notes' ? (
        <ObservationsPanel enrollmentId={enrollment.id} termId={term.id} readOnly={readOnly} />
      ) : competencies.length === 0 ? (
        <EmptyState
          title="Este grado no tiene competencias"
          description="La Dirección las configura en la pestaña Competencias."
        />
      ) : (
        <div className="space-y-6">
          {enrollment.student?.allergies && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              Alergias: {enrollment.student.allergies}
            </p>
          )}
          {areas.map((group) => (
            <section key={group.area}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">{group.area}</h4>
              <div className="space-y-4">
                {group.items.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200">
                    <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                      {c.name}
                    </p>
                    <ul className="divide-y divide-slate-100">
                      {c.indicators
                        .filter((i) => i.active)
                        .map((ind) => {
                          const m = get(ind.id)
                          const showComment = openComments.has(ind.id) || Boolean(m.comment)
                          return (
                            <li key={ind.id} className="space-y-2 px-3 py-3">
                              <p className="text-sm text-slate-700">{ind.description}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                {LEVEL_ORDER.map((lv) => (
                                  <button
                                    key={lv}
                                    type="button"
                                    disabled={readOnly}
                                    title={ACHIEVEMENT_LABEL[lv]}
                                    aria-label={ACHIEVEMENT_LABEL[lv]}
                                    aria-pressed={m.level === lv}
                                    // Tocar el nivel activo lo quita: la forma
                                    // natural de corregir un toque de más.
                                    onClick={() => set(ind.id, { level: m.level === lv ? null : lv })}
                                    className={cn(
                                      'h-11 min-w-[3rem] rounded-xl border px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed',
                                      m.level === lv
                                        ? LEVEL_ACTIVE[lv]
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                    )}
                                  >
                                    {ACHIEVEMENT_SHORT[lv]}
                                  </button>
                                ))}
                                {numeric && (
                                  <Input
                                    aria-label="Nota (0-100)"
                                    placeholder="Nota"
                                    inputMode="decimal"
                                    disabled={readOnly}
                                    value={m.score}
                                    onChange={(e) => set(ind.id, { score: e.target.value })}
                                    className="w-24"
                                  />
                                )}
                                {!readOnly && (
                                  <button
                                    type="button"
                                    aria-label="Comentario del indicador"
                                    onClick={() => toggleComment(ind.id)}
                                    className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              {showComment && (
                                <Input
                                  placeholder="Comentario (opcional)"
                                  disabled={readOnly}
                                  value={m.comment}
                                  onChange={(e) => set(ind.id, { comment: e.target.value })}
                                />
                              )}
                            </li>
                          )
                        })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
