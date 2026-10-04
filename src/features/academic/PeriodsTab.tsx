import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRightLeft,
  CalendarRange,
  CheckCircle2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  useActivatePeriod,
  useClosePeriod,
  useDeleteGradingTerm,
  useDeletePeriod,
  useGradingTerms,
  usePeriods,
  usePromoteStudents,
  useSaveGradingTerm,
  useSavePeriod,
} from '@/hooks/academic'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { PERIOD_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateShort, num } from '@/lib/format'
import type { AcademicPeriod, GradingTerm } from '@/types/db'
import { Notice, PERIOD_TONE } from './shared'

/**
 * Años escolares y sus cortes de evaluación.
 *
 * El ciclo de vida es el que sostiene el historial: preparar → activar →
 * cerrar → promover. Cerrar es IRREVERSIBLE a propósito (la base congela el
 * año), así que aquí la confirmación es fuerte y explica qué hay que hacer
 * antes (marcar retirados y repitentes en Inscripciones).
 */
export function PeriodsTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const { data, isLoading, isError, error, refetch } = usePeriods()
  const activate = useActivatePeriod()
  const remove = useDeletePeriod()

  const [form, setForm] = useState<{ open: boolean; period: AcademicPeriod | null }>({ open: false, period: null })
  const [closing, setClosing] = useState<AcademicPeriod | null>(null)
  const [promoting, setPromoting] = useState<AcademicPeriod | null>(null)

  const periods = data ?? []

  if (isLoading) return <PageLoader label="Cargando años escolares…" />
  if (isError) {
    return (
      <Card className="space-y-3 p-8 text-center">
        <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los años escolares.')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </Card>
    )
  }

  const doActivate = async (p: AcademicPeriod) => {
    try {
      await activate.mutateAsync(p.id)
      toast.success(`${p.name} es ahora el año en curso`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo activar el año'))
    }
  }

  const doDelete = async (p: AcademicPeriod) => {
    if (!window.confirm(`¿Eliminar el año "${p.name}"? Solo se puede si todavía no tiene secciones ni inscripciones.`)) return
    try {
      await remove.mutateAsync(p.id)
      toast.success('Año eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar el año'))
    }
  }

  const actionsFor = (p: AcademicPeriod): ActionItem[] => {
    const items: ActionItem[] = [
      {
        label: 'Editar nombre y fechas',
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => setForm({ open: true, period: p }),
        disabled: p.status === 'closed',
        hint: p.status === 'closed' ? 'Un año cerrado ya no cambia' : undefined,
      },
    ]
    if (p.status === 'planning') {
      items.push({
        label: 'Activar como año en curso',
        icon: <CheckCircle2 className="h-4 w-4" />,
        tone: 'success',
        onClick: () => void doActivate(p),
        hint: 'Solo puede haber uno en curso',
      })
    }
    if (p.status !== 'closed') {
      items.push({
        label: 'Cerrar año',
        icon: <Lock className="h-4 w-4" />,
        onClick: () => setClosing(p),
        hint: 'Promueve y congela el historial',
      })
    } else {
      items.push({
        label: 'Reinscribir en otro año',
        icon: <ArrowRightLeft className="h-4 w-4" />,
        onClick: () => setPromoting(p),
        hint: 'Promovidos al grado siguiente, repitentes al mismo',
      })
    }
    items.push({
      label: 'Eliminar',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger',
      onClick: () => void doDelete(p),
      disabled: p.status === 'closed',
      hint: 'Solo si está vacío',
    })
    return items
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setForm({ open: true, period: null })}>
            <Plus className="h-4 w-4" /> Nuevo año escolar
          </Button>
        </div>
      )}

      {periods.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="Todavía no hay años escolares"
          description="Es el primer paso: crea el año (por ejemplo 2026-2027) y actívalo. Después vienen los grados y las secciones."
          action={
            canEdit ? (
              <Button onClick={() => setForm({ open: true, period: null })}>
                <Plus className="h-4 w-4" /> Crear el primero
              </Button>
            ) : undefined
          }
        />
      ) : (
        periods.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-slate-800">{p.name}</h3>
                  <Badge tone={PERIOD_TONE[p.status]}>{PERIOD_STATUS_LABEL[p.status]}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">
                  {fmtDate(p.starts_on)} — {fmtDate(p.ends_on)}
                </p>
              </div>
              {canEdit && <ActionMenu title={p.name} label={`Opciones de ${p.name}`} items={actionsFor(p)} />}
            </div>
            <TermsList period={p} canEdit={canEdit} />
          </Card>
        ))
      )}

      <PeriodFormModal
        open={form.open}
        period={form.period}
        onClose={() => setForm({ open: false, period: null })}
      />
      <ClosePeriodModal period={closing} onClose={() => setClosing(null)} />
      <PromoteModal from={promoting} periods={periods} onClose={() => setPromoting(null)} />
    </div>
  )
}

// ── Cortes de un año ─────────────────────────────────────────────────────────

function TermsList({ period, canEdit }: { period: AcademicPeriod; canEdit: boolean }) {
  const toast = useToast()
  const { data, isLoading } = useGradingTerms(period.id)
  const save = useSaveGradingTerm()
  const remove = useDeleteGradingTerm()
  const [form, setForm] = useState<{ open: boolean; term: GradingTerm | null }>({ open: false, term: null })

  const terms = data ?? []
  const editable = canEdit && period.status !== 'closed'

  const toggleClosed = async (t: GradingTerm) => {
    try {
      await save.mutateAsync({ id: t.id, is_closed: !t.is_closed })
      toast.success(t.is_closed ? `${t.name} reabierto` : `${t.name} cerrado: sus evaluaciones quedan congeladas`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el corte'))
    }
  }

  const destroy = async (t: GradingTerm) => {
    if (!window.confirm(`¿Eliminar el corte "${t.name}"? Solo se puede si no tiene evaluaciones ni boletines.`)) return
    try {
      await remove.mutateAsync(t.id)
      toast.success('Corte eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar el corte'))
    }
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cortes de evaluación</p>
        {editable && (
          <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, term: null })}>
            <Plus className="h-4 w-4" /> Corte
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : terms.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin cortes todavía. Los boletines se generan por corte (por ejemplo, tres trimestres).
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="truncate">{t.name}</span>
                  {t.is_closed && (
                    <Badge tone="slate">
                      <Lock className="h-3 w-3" /> Cerrado
                    </Badge>
                  )}
                </p>
                {(t.starts_on || t.ends_on) && (
                  <p className="text-xs text-slate-400">
                    {fmtDateShort(t.starts_on)} — {fmtDateShort(t.ends_on)}
                  </p>
                )}
              </div>
              {editable && (
                <ActionMenu
                  title={t.name}
                  label={`Opciones de ${t.name}`}
                  items={[
                    {
                      label: 'Editar',
                      icon: <Pencil className="h-4 w-4" />,
                      onClick: () => setForm({ open: true, term: t }),
                    },
                    t.is_closed
                      ? {
                          label: 'Reabrir corte',
                          icon: <LockOpen className="h-4 w-4" />,
                          onClick: () => void toggleClosed(t),
                          hint: 'Permite volver a calificar',
                        }
                      : {
                          label: 'Cerrar corte',
                          icon: <Lock className="h-4 w-4" />,
                          onClick: () => void toggleClosed(t),
                          hint: 'Congela las evaluaciones de este corte',
                        },
                    {
                      label: 'Eliminar',
                      icon: <Trash2 className="h-4 w-4" />,
                      tone: 'danger',
                      onClick: () => void destroy(t),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <TermFormModal
        open={form.open}
        term={form.term}
        period={period}
        nextOrder={terms.length + 1}
        onClose={() => setForm({ open: false, term: null })}
      />
    </div>
  )
}

// ── Formularios ──────────────────────────────────────────────────────────────

function PeriodFormModal({
  open,
  period,
  onClose,
}: {
  open: boolean
  period: AcademicPeriod | null
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSavePeriod()
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Se rellena al ABRIR: el diálogo vive siempre montado y conservaría lo de la
  // vez anterior. Para un año nuevo se propone el calendario dominicano típico
  // (agosto → junio) a partir del año en curso.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (period) {
      setName(period.name)
      setStartsOn(period.starts_on)
      setEndsOn(period.ends_on)
    } else {
      const y = new Date().getFullYear()
      setName(`${y}-${y + 1}`)
      setStartsOn(`${y}-08-01`)
      setEndsOn(`${y + 1}-06-30`)
    }
  }, [open, period])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Escribe un nombre, por ejemplo 2026-2027')
    if (!startsOn || !endsOn) return setError('Indica las dos fechas')
    // Comparación de cadenas: 'YYYY-MM-DD' ordena igual que la fecha.
    if (endsOn <= startsOn) return setError('El año tiene que terminar después de empezar')
    try {
      await save.mutateAsync({ id: period?.id, name: name.trim(), starts_on: startsOn, ends_on: endsOn })
      toast.success(period ? 'Año actualizado' : 'Año creado. Actívalo cuando empiece el curso.')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el año'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={period ? 'Editar año escolar' : 'Nuevo año escolar'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="period-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="period-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nombre" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-2027" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Empieza" required>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Termina" required>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

function TermFormModal({
  open,
  term,
  period,
  nextOrder,
  onClose,
}: {
  open: boolean
  term: GradingTerm | null
  period: AcademicPeriod
  nextOrder: number
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveGradingTerm()
  const [name, setName] = useState('')
  const [order, setOrder] = useState('1')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(term?.name ?? `Corte ${nextOrder}`)
    setOrder(String(term?.sort_order ?? nextOrder))
    setStartsOn(term?.starts_on ?? '')
    setEndsOn(term?.ends_on ?? '')
  }, [open, term, nextOrder])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Escribe un nombre, por ejemplo Primer trimestre')
    if (startsOn && endsOn && endsOn < startsOn) return setError('El corte no puede terminar antes de empezar')
    try {
      await save.mutateAsync({
        id: term?.id,
        academic_period_id: period.id,
        name: name.trim(),
        sort_order: Number(order) || 1,
        // Las fechas son opcionales: sin ellas, el boletín cuenta la asistencia
        // de todo el año.
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      })
      toast.success(term ? 'Corte actualizado' : 'Corte creado')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el corte'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={term ? 'Editar corte' : `Nuevo corte · ${period.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="term-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="term-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-[1fr_6rem] gap-4">
          <Field label="Nombre" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Primer trimestre" />
          </Field>
          <Field label="Orden">
            <Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Desde" hint="Opcional">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Hasta" hint="Opcional">
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Las fechas definen qué asistencia cuenta en el boletín de este corte.
        </p>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

// ── Cierre y promoción ───────────────────────────────────────────────────────

/**
 * Confirmación FUERTE: hay que escribir el nombre del año. Un clic de más aquí
 * congela un año entero y no hay botón de deshacer (la base no lo permite).
 */
function ClosePeriodModal({ period, onClose }: { period: AcademicPeriod | null; onClose: () => void }) {
  const toast = useToast()
  const close = useClosePeriod()
  const [typed, setTyped] = useState('')

  useEffect(() => setTyped(''), [period])

  if (!period) return null
  const matches = typed.trim().toLowerCase() === period.name.trim().toLowerCase()

  const confirm = async () => {
    try {
      const r = await close.mutateAsync(period.id)
      toast.success(
        `${period.name} cerrado: ${num(r.promoted)} promovidos y ${num(r.completed)} completaron el último grado.`,
      )
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cerrar el año'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cerrar ${period.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!matches} loading={close.isPending} onClick={() => void confirm()}>
            Cerrar el año
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        <Notice tone="warn">
          <p className="font-semibold">Esto no se puede deshacer.</p>
          <p className="mt-1">
            Al cerrar, cada estudiante inscrito pasa a <strong>Promovido</strong> (o <strong>Completó</strong> si
            está en el último grado) y el año queda congelado: ya no se podrá cambiar asistencia, evaluaciones
            ni inscripciones de ese año.
          </p>
        </Notice>
        <div>
          <p className="font-medium text-slate-700">Antes de cerrar, revisa en Inscripciones:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Marca como <strong>Repite</strong> a quien no pasa de grado.</li>
            <li>Marca como <strong>Retirado</strong> a quien dejó el colegio.</li>
            <li>Genera y publica los boletines del último corte.</li>
          </ul>
        </div>
        <Field label={`Escribe "${period.name}" para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Modal>
  )
}

function PromoteModal({
  from,
  periods,
  onClose,
}: {
  from: AcademicPeriod | null
  periods: AcademicPeriod[]
  onClose: () => void
}) {
  const toast = useToast()
  const promote = usePromoteStudents()
  const targets = periods.filter((p) => p.status !== 'closed' && p.id !== from?.id)
  const [to, setTo] = useState('')

  // Al abrir, el primer año abierto como destino (normalmente el que se acaba
  // de crear).
  useEffect(() => {
    setTo(periods.find((p) => p.status !== 'closed' && p.id !== from?.id)?.id ?? '')
  }, [from, periods])

  if (!from) return null

  const run = async () => {
    try {
      const r = await promote.mutateAsync({ from: from.id, to })
      toast.success(
        `${num(r.created)} estudiantes inscritos en el año nuevo` +
          (r.skipped > 0 ? ` (${num(r.skipped)} ya estaban inscritos)` : ''),
      )
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo reinscribir'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reinscribir desde ${from.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!to} loading={promote.isPending} onClick={() => void run()}>
            Reinscribir
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          Los <strong>promovidos</strong> se inscriben en el grado siguiente y los que <strong>repiten</strong>, en el
          mismo. Quedan sin sección: la asignas después en Inscripciones. Quien ya esté inscrito en el año destino se
          salta.
        </p>
        {targets.length === 0 ? (
          <Notice tone="warn">Primero crea el año nuevo (pestaña Años) para poder reinscribir en él.</Notice>
        ) : (
          <Field label="Año destino">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {PERIOD_STATUS_LABEL[p.status]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  )
}
