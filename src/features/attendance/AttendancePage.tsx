import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseISO, isWeekend } from 'date-fns'
import { CalendarCheck, CheckCheck, CloudUpload, MessageSquare, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/lib/permissions'
import { sectionLabel, useCurrentPeriod, useMySections } from '@/hooks/academic'
import { useSectionRoster, type EnrollmentRow } from '@/hooks/enrollments'
import { useAttendance, useSaveAttendance, type AttendanceRow } from '@/hooks/attendance'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_SHORT } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtWeekday, num } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { AttendanceStatus } from '@/types/db'
import { Notice, orNull, todayISO } from '@/features/academic/shared'

/**
 * Pasar lista. Es la pantalla que una docente abre cada mañana con el teléfono
 * en la mano y el wifi del aula fallando, así que:
 *
 *   • Los cambios se acumulan en un BORRADOR local y se mandan juntos con
 *     "Guardar": tocar 25 botones no son 25 viajes de red.
 *   • Guardar usa la cola offline (`useSaveAttendance` → `@/lib/offline`): sin
 *     señal la lista queda en el teléfono, se ve marcada y sube sola al volver.
 *     Por eso `mutate` y no `mutateAsync`: sin red la promesa no resolvería.
 *   • Los botones miden ≥44px y caben cuatro por fila a 360px.
 */

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

/** Color de cada estado cuando está marcado. Record completo: un estado nuevo sin color no compila. */
const STATUS_ON: Record<AttendanceStatus, string> = {
  present: 'border-emerald-500 bg-emerald-500 text-white',
  absent: 'border-red-500 bg-red-500 text-white',
  late: 'border-amber-400 bg-amber-400 text-amber-950',
  excused: 'border-sky-500 bg-sky-500 text-white',
}

const SUMMARY_TONE: Record<AttendanceStatus, string> = {
  present: 'text-emerald-600',
  absent: 'text-red-600',
  late: 'text-amber-600',
  excused: 'text-sky-600',
}

/** Cambio pendiente de una fila: estado (null = borrar la marca) y nota. */
interface Draft {
  status: AttendanceStatus | null
  note: string
}

/** Recuerda la última sección en ESTE teléfono: la docente casi siempre abre la misma. */
const LAST_SECTION_KEY = 'arreschool-attendance-section'

function readLastSection(): string {
  try {
    return localStorage.getItem(LAST_SECTION_KEY) ?? ''
  } catch {
    return ''
  }
}

export function AttendancePage() {
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const { current, isLoading: loadingPeriod } = useCurrentPeriod()
  // Dirección y Secretaría ven todas las secciones (cubren ausencias); una
  // docente, solo las suyas. Es el mismo criterio que auth_teaches_section().
  const { sections, isLoading: loadingSections } = useMySections(current?.id, can('manageStudents'))

  const [date, setDate] = useState(todayISO())
  const [sectionId, setSectionId] = useState('')
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [noteOpen, setNoteOpen] = useState<Set<string>>(new Set())

  // Sección inicial: la última usada si sigue disponible; si solo hay una, esa.
  useEffect(() => {
    if (sectionId || sections.length === 0) return
    const last = readLastSection()
    const pick = sections.find((s) => s.id === last) ?? (sections.length === 1 ? sections[0] : null)
    if (pick) setSectionId(pick.id)
  }, [sections, sectionId])

  const section = sections.find((s) => s.id === sectionId) ?? null
  const roster = useSectionRoster(section?.id)
  const records = useAttendance(section?.id, date)
  const save = useSaveAttendance()

  const recordOf = useMemo(() => {
    const m = new Map<string, AttendanceRow>()
    for (const r of records.data ?? []) m.set(r.enrollment_id, r)
    return m
  }, [records.data])

  const dirty = Object.keys(draft).length > 0
  const closed = current?.status === 'closed'

  // Aviso del navegador si se cierra la pestaña con la lista a medias.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /** Cambiar de día o de sección descarta el borrador: se pregunta antes. */
  const confirmDiscard = () =>
    !dirty || window.confirm('Tienes cambios sin guardar en la lista. ¿Descartarlos?')

  const changeSection = (id: string) => {
    if (!confirmDiscard()) return
    setDraft({})
    setNoteOpen(new Set())
    setSectionId(id)
    try {
      localStorage.setItem(LAST_SECTION_KEY, id)
    } catch {
      /* noop: sin almacenamiento solo se pierde la comodidad */
    }
  }

  const changeDate = (value: string) => {
    if (!value || !confirmDiscard()) return
    // Nunca un día futuro: la base también lo rechaza, pero así ni se intenta.
    const today = todayISO()
    setDraft({})
    setNoteOpen(new Set())
    setDate(value > today ? today : value)
  }

  const effective = (e: EnrollmentRow): Draft => {
    const d = draft[e.id]
    if (d) return d
    const r = recordOf.get(e.id)
    return { status: r?.status ?? null, note: r?.note ?? '' }
  }

  const mark = (e: EnrollmentRow, status: AttendanceStatus) => {
    const cur = effective(e)
    // Tocar el estado ya marcado lo desmarca: es como se corrige un toque de más.
    setDraft((p) => ({ ...p, [e.id]: { ...cur, status: cur.status === status ? null : status } }))
  }

  const setNote = (e: EnrollmentRow, note: string) => {
    const cur = effective(e)
    setDraft((p) => ({ ...p, [e.id]: { ...cur, note } }))
  }

  const students = roster.data ?? []

  const markAllPresent = () => {
    setDraft((p) => {
      const next = { ...p }
      for (const e of students) {
        if (!effective(e).status) next[e.id] = { status: 'present', note: effective(e).note }
      }
      return next
    })
  }

  // Sin memo: son 25 filas y `effective` depende del borrador y de las marcas
  // guardadas; recalcular es más barato que equivocarse con las dependencias.
  const counts: Record<AttendanceStatus | 'none', number> = { present: 0, absent: 0, late: 0, excused: 0, none: 0 }
  for (const e of students) counts[effective(e).status ?? 'none']++

  const submit = () => {
    if (!section || !user) return
    const marks = Object.entries(draft)
      // Desmarcar algo que nunca se guardó no tiene nada que borrar.
      .filter(([id, d]) => d.status !== null || recordOf.has(id))
      .map(([id, d]) => ({ enrollment_id: id, status: d.status, note: d.status ? orNull(d.note) : null }))
    if (marks.length === 0) {
      setDraft({})
      return
    }
    save.mutate(
      { created_by: user.id, section_id: section.id, date, marks },
      {
        onSuccess: () => toast.success('Asistencia guardada'),
        onError: (err) => toast.error(errorMessage(err, 'No se pudo guardar la asistencia')),
      },
    )
    // El optimista de la cola ya pintó las marcas: el borrador se vacía al
    // instante, haya red o no.
    setDraft({})
    setNoteOpen(new Set())
    if (!navigator.onLine) {
      toast.info('Sin conexión: la lista quedó guardada en el teléfono y se subirá sola al volver la señal.')
    }
  }

  // ── Estados de la pantalla ────────────────────────────────────────────────
  if (loadingPeriod || loadingSections) return <PageLoader label="Cargando…" />

  const header = (
    <PageHeader
      title="Asistencia"
      description={section ? `${sectionLabel(section)} · ${fmtWeekday(date)} ${fmtDate(date)}` : 'Pasa lista de tu sección'}
    />
  )

  if (!current) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="No hay año escolar en curso"
          description="La Dirección tiene que crear y activar el año escolar en Estructura."
        />
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="No tienes secciones asignadas"
          description="Para pasar lista, la Dirección tiene que asignarte a tu sección en Estructura → Secciones y enlazar tu ficha de docente con tu cuenta."
        />
      </div>
    )
  }

  return (
    <div>
      {header}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Sección">
          <Select value={sectionId} onChange={(e) => changeSection(e.target.value)}>
            <option value="" disabled>
              Elige tu sección…
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Día">
          <Input
            type="date"
            value={date}
            max={todayISO()}
            min={current.starts_on}
            onChange={(e) => changeDate(e.target.value)}
          />
        </Field>
      </div>

      {closed && (
        <Notice tone="lock" className="mb-4">
          {current.name} está cerrado: la asistencia se puede consultar pero ya no cambiar.
        </Notice>
      )}
      {isWeekend(parseISO(date)) && (
        <Notice tone="warn" className="mb-4">
          Es fin de semana. Si fue un día de clase especial, puedes pasar lista igual.
        </Notice>
      )}

      {!section ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="Elige una sección"
          description="Selecciona arriba la sección a la que vas a pasar lista."
        />
      ) : roster.isLoading || records.isLoading ? (
        <PageLoader label="Cargando la lista de clase…" />
      ) : roster.isError ? (
        <Card className="space-y-3 p-8 text-center">
          <p className="text-sm text-red-600">{errorMessage(roster.error, 'No se pudo cargar la lista de clase.')}</p>
          <Button variant="outline" onClick={() => roster.refetch()}>
            Reintentar
          </Button>
        </Card>
      ) : students.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="Esta sección no tiene estudiantes"
          description="Cuando se inscriban estudiantes y se les asigne esta sección, aparecerán aquí."
          action={
            can('manageStudents') ? (
              <Link to="/inscripciones">
                <Button variant="outline">Ir a Inscripciones</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ── Resumen del día ───────────────────────────────────────── */}
          <div className="mb-3 grid grid-cols-5 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-card">
            {STATUSES.map((s) => (
              <div key={s} className="min-w-0">
                <p className={cn('text-lg font-bold tabular-nums', SUMMARY_TONE[s])}>{num(counts[s])}</p>
                <p className="truncate text-[11px] text-slate-500">{ATTENDANCE_STATUS_LABEL[s]}</p>
              </div>
            ))}
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-slate-400">{num(counts.none)}</p>
              <p className="truncate text-[11px] text-slate-500">Sin marcar</p>
            </div>
          </div>

          {!closed && counts.none > 0 && (
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={markAllPresent}>
                <CheckCheck className="h-4 w-4" /> Marcar presentes a los {num(counts.none)} sin marcar
              </Button>
            </div>
          )}

          <Card>
            <ul className="divide-y divide-slate-100">
              {students.map((e) => {
                const cur = effective(e)
                const changed = Boolean(draft[e.id])
                const pending = Boolean(recordOf.get(e.id)?._pendingSync) && !changed
                const name = `${e.student?.last_name ?? ''}, ${e.student?.first_name ?? ''}`
                return (
                  <li key={e.id} className={cn('p-3 sm:p-4', changed && 'bg-brand-50/40')}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {e.student?.allergies && (
                            <Badge tone="red" className="max-w-full">
                              <TriangleAlert className="h-3 w-3 shrink-0" />
                              <span className="truncate">Alergia: {e.student.allergies}</span>
                            </Badge>
                          )}
                          {pending && (
                            <Badge tone="amber">
                              <CloudUpload className="h-3 w-3" /> Guardada en el teléfono
                            </Badge>
                          )}
                          {changed && <Badge tone="brand">Sin guardar</Badge>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div role="group" aria-label={`Asistencia de ${name}`} className="grid flex-1 grid-cols-4 gap-1.5 sm:w-72 sm:flex-none">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={closed}
                              aria-pressed={cur.status === s}
                              aria-label={ATTENDANCE_STATUS_LABEL[s]}
                              title={ATTENDANCE_STATUS_LABEL[s]}
                              onClick={() => mark(e, s)}
                              className={cn(
                                'flex h-11 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors',
                                'disabled:cursor-not-allowed disabled:opacity-60',
                                cur.status === s
                                  ? STATUS_ON[s]
                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                              )}
                            >
                              {ATTENDANCE_STATUS_SHORT[s]}
                              <span className="hidden text-[10px] font-medium sm:block">{ATTENDANCE_STATUS_LABEL[s]}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setNoteOpen((p) => {
                              const n = new Set(p)
                              if (n.has(e.id)) n.delete(e.id)
                              else n.add(e.id)
                              return n
                            })
                          }
                          aria-label={`Nota de ${name}`}
                          title="Nota"
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
                            cur.note ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-400',
                          )}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {noteOpen.has(e.id) && (
                      <Input
                        className="mt-2"
                        placeholder={cur.status ? 'Nota (ej. llegó con fiebre)' : 'Marca primero la asistencia'}
                        disabled={closed || !cur.status}
                        value={cur.note}
                        onChange={(ev) => setNote(e, ev.target.value)}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          <p className="mt-2 px-1 text-xs text-slate-400">
            P = {ATTENDANCE_STATUS_LABEL.present} · A = {ATTENDANCE_STATUS_LABEL.absent} · T ={' '}
            {ATTENDANCE_STATUS_LABEL.late} · E = {ATTENDANCE_STATUS_LABEL.excused}. Toca de nuevo para desmarcar.
          </p>

          {/* Barra de guardar pegada abajo, por encima de la navegación del
              teléfono (`bottom-20`): con 25 niños la lista es larga y el botón
              no puede quedarse arriba fuera de vista. */}
          {!closed && (
            <div className="sticky bottom-20 z-10 mt-4 lg:bottom-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-card-hover backdrop-blur">
                <p className="min-w-0 flex-1 text-sm text-slate-600">
                  {dirty ? `${num(Object.keys(draft).length)} cambios sin guardar` : 'Todo guardado'}
                </p>
                {dirty && (
                  <Button variant="ghost" onClick={() => setDraft({})}>
                    Descartar
                  </Button>
                )}
                <Button onClick={submit} disabled={!dirty}>
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
