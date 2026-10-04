import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRightLeft,
  ClipboardList,
  LogOut,
  Plus,
  RotateCcw,
  Repeat,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useCurrentPeriod, useGradeLevels, useSections, sectionLabel } from '@/hooks/academic'
import {
  useAssignSection,
  useDeleteEnrollment,
  useEnrollments,
  useUpdateEnrollment,
  type EnrollmentRow,
} from '@/hooks/enrollments'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { ENROLLMENT_STATUS_LABEL, PERIOD_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, num } from '@/lib/format'
import type { EnrollmentStatus } from '@/types/db'
import { EnrollStudentModal } from './EnrollStudentModal'
import { ENROLLMENT_TONE, Notice, orNull, todayISO } from './shared'

/**
 * Inscripciones de un año: quién está, en qué grado y en qué sección.
 *
 * Es la pantalla de agosto (inscribir y repartir en secciones) y la de junio
 * (marcar retirados y repitentes antes de cerrar el año). Filtrado, búsqueda y
 * paginación en el cliente, como el molde: un año de un colegio cabe en memoria.
 */

const PAGE_SIZE = 20
/** Filtro de sección: un id, todas, o las inscripciones todavía sin sección. */
const ALL = 'all'
const NONE = 'none'

export function EnrollmentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { periods, current, isLoading: loadingPeriods } = useCurrentPeriod()
  const [periodId, setPeriodId] = useState('')
  useEffect(() => {
    if (!periodId && current) setPeriodId(current.id)
  }, [current, periodId])
  const period = periods.find((p) => p.id === periodId) ?? null
  const closed = period?.status === 'closed'

  const { data, isLoading, isError, error, refetch, isFetching } = useEnrollments(period?.id)
  const { data: sections } = useSections(period?.id)
  const { data: grades } = useGradeLevels()
  const update = useUpdateEnrollment()
  const remove = useDeleteEnrollment()

  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState(ALL)
  const [sectionFilter, setSectionFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | typeof ALL>('enrolled')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [assigning, setAssigning] = useState<EnrollmentRow[] | null>(null)
  const [withdrawing, setWithdrawing] = useState<EnrollmentRow | null>(null)

  const rows = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((e) => {
      if (statusFilter !== ALL && e.status !== statusFilter) return false
      if (gradeFilter !== ALL && e.grade_level_id !== gradeFilter) return false
      if (sectionFilter === NONE && e.section_id) return false
      if (sectionFilter !== ALL && sectionFilter !== NONE && e.section_id !== sectionFilter) return false
      if (!q) return true
      return `${e.student?.first_name ?? ''} ${e.student?.last_name ?? ''} ${e.student?.code ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [rows, search, statusFilter, gradeFilter, sectionFilter])

  // Al cambiar los filtros o el año, la selección y la página dejan de tener
  // sentido: una selección invisible acabaría movida a otra sección sin verla.
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [search, statusFilter, gradeFilter, sectionFilter, periodId])

  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)
  const unassigned = rows.filter((e) => e.status === 'enrolled' && !e.section_id).length
  const enrolled = rows.filter((e) => e.status === 'enrolled').length

  const sectionOptions = (sections ?? []).filter((s) => gradeFilter === ALL || s.grade_level_id === gradeFilter)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOnPage = slice.length > 0 && slice.every((e) => selected.has(e.id))
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const e of slice) {
        if (allOnPage) next.delete(e.id)
        else next.add(e.id)
      }
      return next
    })

  const openBulkAssign = () => {
    const picked = rows.filter((e) => selected.has(e.id))
    // Una sección es de UN grado: mezclar grados en el lote solo serviría para
    // que la base rechazara la mitad.
    if (new Set(picked.map((e) => e.grade_level_id)).size > 1) {
      toast.error('Elige estudiantes de un mismo grado para asignarles sección')
      return
    }
    setAssigning(picked)
  }

  const setStatus = async (e: EnrollmentRow, status: EnrollmentStatus) => {
    try {
      await update.mutateAsync({
        id: e.id,
        status,
        // Volver a "inscrito" deshace un retiro: se limpian sus datos.
        ...(status === 'enrolled' ? { ended_on: null, end_reason: null } : {}),
      })
      toast.success(`${studentName(e)}: ${ENROLLMENT_STATUS_LABEL[status].toLowerCase()}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  const destroy = async (e: EnrollmentRow) => {
    if (
      !window.confirm(
        `¿Borrar la inscripción de ${studentName(e)}? Úsalo solo si fue un error: con asistencia, notas o cargos la base no lo permite (márcalo como retirado).`,
      )
    )
      return
    try {
      await remove.mutateAsync(e.id)
      toast.success('Inscripción borrada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo borrar la inscripción'))
    }
  }

  const actionsFor = (e: EnrollmentRow): ActionItem[] => {
    const items: ActionItem[] = [
      {
        label: 'Ver ficha del estudiante',
        icon: <UserRound className="h-4 w-4" />,
        onClick: () => navigate(`/estudiantes/${e.student_id}`),
      },
    ]
    if (closed) return items
    if (e.status === 'enrolled') {
      items.push(
        {
          label: e.section_id ? 'Cambiar de sección' : 'Asignar sección',
          icon: <ArrowRightLeft className="h-4 w-4" />,
          onClick: () => setAssigning([e]),
        },
        {
          label: 'Marcar que repite',
          icon: <Repeat className="h-4 w-4" />,
          onClick: () => void setStatus(e, 'retained'),
          hint: 'Al cerrar el año no pasará de grado',
        },
        {
          label: 'Retirar',
          icon: <LogOut className="h-4 w-4" />,
          tone: 'danger',
          onClick: () => setWithdrawing(e),
          hint: 'Dejó el colegio; su historial se conserva',
        },
      )
    } else {
      items.push({
        label: 'Volver a inscrito',
        icon: <RotateCcw className="h-4 w-4" />,
        tone: 'success',
        onClick: () => void setStatus(e, 'enrolled'),
      })
    }
    items.push({
      label: 'Borrar inscripción',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger',
      onClick: () => void destroy(e),
      hint: 'Solo si se hizo por error',
    })
    return items
  }

  if (loadingPeriods) return <PageLoader label="Cargando…" />

  return (
    <div>
      <PageHeader
        title="Inscripciones"
        description={
          period
            ? `${num(enrolled)} inscritos en ${period.name}` + (unassigned > 0 ? ` · ${num(unassigned)} sin sección` : '')
            : 'Inscribe a los estudiantes en el año escolar'
        }
        action={
          period && !closed ? (
            <Button onClick={() => setEnrollOpen(true)}>
              <Plus className="h-4 w-4" /> Inscribir
            </Button>
          ) : undefined
        }
      />

      {periods.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Todavía no hay años escolares"
          description="Para inscribir hace falta un año escolar con sus grados. Créalos en Estructura."
          action={
            <Link to="/academico">
              <Button variant="outline">Ir a Estructura</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* ── Filtros ─────────────────────────────────────────────────── */}
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Año escolar">
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {PERIOD_STATUS_LABEL[p.status]}
                  </option>
                ))}
              </Select>
              <Select
                value={gradeFilter}
                onChange={(e) => {
                  setGradeFilter(e.target.value)
                  setSectionFilter(ALL)
                }}
                aria-label="Grado"
              >
                <option value={ALL}>Todos los grados</option>
                {(grades ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              <Select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} aria-label="Sección">
                <option value={ALL}>Todas las secciones</option>
                <option value={NONE}>Sin sección</option>
                {sectionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as EnrollmentStatus | typeof ALL)}
                aria-label="Estado"
              >
                <option value={ALL}>Todos los estados</option>
                {(Object.keys(ENROLLMENT_STATUS_LABEL) as EnrollmentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ENROLLMENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                className="pl-9"
                placeholder="Buscar por nombre o matrícula…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {closed && (
            <Notice tone="lock" className="mb-4">
              {period?.name} está cerrado: sus inscripciones son historial y ya no se modifican.
            </Notice>
          )}
          {!closed && unassigned > 0 && sectionFilter !== NONE && (
            <Notice tone="warn" className="mb-4">
              Hay {num(unassigned)} inscritos sin sección: no aparecerán al pasar lista.{' '}
              <button type="button" className="font-semibold underline" onClick={() => setSectionFilter(NONE)}>
                Verlos
              </button>
            </Notice>
          )}

          {/* ── Barra de selección ──────────────────────────────────────── */}
          {selected.size > 0 && (
            <div className="sticky top-16 z-10 mb-3 flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 shadow-sm">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-brand-800">
                {num(selected.size)} seleccionados
              </p>
              <Button size="sm" onClick={openBulkAssign}>
                <ArrowRightLeft className="h-4 w-4" /> Asignar sección
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Quitar selección"
                className="rounded-lg p-1.5 text-brand-500 hover:bg-brand-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <Card>
            {isLoading ? (
              <PageLoader label="Cargando inscripciones…" />
            ) : isError ? (
              <div className="space-y-3 p-8 text-center">
                <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar las inscripciones.')}</p>
                <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
                  Reintentar
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={<ClipboardList className="h-6 w-6" />}
                title={rows.length === 0 ? 'Nadie inscrito en este año' : 'Sin resultados'}
                description={
                  rows.length === 0
                    ? 'Inscribe a los estudiantes y asígnales su sección para poder pasar lista.'
                    : 'Prueba con otra búsqueda o cambia los filtros.'
                }
                action={
                  rows.length === 0 && !closed ? (
                    <Button onClick={() => setEnrollOpen(true)}>
                      <Plus className="h-4 w-4" /> Inscribir al primero
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* ── Tabla (desde lg) ─────────────────────────────────── */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                        {!closed && (
                          <th className="w-10 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={allOnPage}
                              onChange={togglePage}
                              aria-label="Seleccionar toda la página"
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </th>
                        )}
                        <th className="px-4 py-3 font-medium">Estudiante</th>
                        <th className="px-4 py-3 font-medium">Grado</th>
                        <th className="px-4 py-3 font-medium">Sección</th>
                        <th className="px-4 py-3 font-medium">Estado</th>
                        <th className="px-4 py-3 font-medium">Inscrito</th>
                        <th className="px-4 py-3 text-right font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {slice.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/60">
                          {!closed && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(e.id)}
                                onChange={() => toggle(e.id)}
                                aria-label={`Seleccionar a ${studentName(e)}`}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <Link
                              to={`/estudiantes/${e.student_id}`}
                              className="font-medium text-slate-800 hover:text-brand-600"
                            >
                              {studentName(e)}
                            </Link>
                            <p className="text-xs text-slate-400">{e.student?.code}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{e.grade_level?.name ?? '—'}</td>
                          <td className="px-4 py-3">
                            {e.section ? (
                              <span className="text-slate-700">{e.section.name}</span>
                            ) : (
                              <Badge tone="amber">Sin sección</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={ENROLLMENT_TONE[e.status]}>{ENROLLMENT_STATUS_LABEL[e.status]}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDateShort(e.enrolled_on)}</td>
                          <td className="px-4 py-3 text-right">
                            <ActionMenu title={studentName(e)} label={`Opciones de ${studentName(e)}`} items={actionsFor(e)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Tarjetas (teléfono y tableta) ─────────────────────── */}
                <DataList>
                  {slice.map((e) => (
                    <DataRow
                      key={e.id}
                      leading={
                        !closed ? (
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggle(e.id)}
                            aria-label={`Seleccionar a ${studentName(e)}`}
                            className="mt-1 h-5 w-5 rounded border-slate-300"
                          />
                        ) : undefined
                      }
                      title={studentName(e)}
                      titleExtra={e.student?.code}
                      tone={e.status === 'withdrawn' ? 'muted' : undefined}
                      onClick={() => navigate(`/estudiantes/${e.student_id}`)}
                      badges={
                        <>
                          <Badge tone={ENROLLMENT_TONE[e.status]}>{ENROLLMENT_STATUS_LABEL[e.status]}</Badge>
                          {!e.section_id && e.status === 'enrolled' && <Badge tone="amber">Sin sección</Badge>}
                        </>
                      }
                      actions={
                        <ActionMenu title={studentName(e)} label={`Opciones de ${studentName(e)}`} items={actionsFor(e)} />
                      }
                    >
                      <DataFields>
                        <DataField label="Grado">{e.grade_level?.name ?? '—'}</DataField>
                        <DataField label="Sección">{e.section?.name ?? '—'}</DataField>
                      </DataFields>
                    </DataRow>
                  ))}
                </DataList>

                <Pagination
                  page={safePage}
                  pageSize={PAGE_SIZE}
                  total={filtered.length}
                  onPage={setPage}
                  label="inscripciones"
                />
              </>
            )}
          </Card>
        </>
      )}

      <EnrollStudentModal open={enrollOpen} onClose={() => setEnrollOpen(false)} />
      <AssignSectionModal
        rows={assigning}
        onClose={() => setAssigning(null)}
        onDone={() => setSelected(new Set())}
        periodId={period?.id}
      />
      <WithdrawModal enrollment={withdrawing} onClose={() => setWithdrawing(null)} />
    </div>
  )
}

function studentName(e: EnrollmentRow): string {
  return e.student ? `${e.student.last_name}, ${e.student.first_name}` : 'Estudiante'
}

/**
 * Asignar (o cambiar) la sección de una o varias inscripciones del MISMO grado.
 * Solo se ofrecen secciones de ese grado y año: la base rechazaría cualquier
 * otra por la FK compuesta.
 */
function AssignSectionModal({
  rows,
  periodId,
  onClose,
  onDone,
}: {
  rows: EnrollmentRow[] | null
  periodId: string | undefined
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const assign = useAssignSection()
  const { data: sections } = useSections(periodId)
  const { data: enrollments } = useEnrollments(periodId)
  const [sectionId, setSectionId] = useState('')

  useEffect(() => {
    setSectionId(rows && rows.length === 1 ? (rows[0].section_id ?? '') : '')
  }, [rows])

  if (!rows) return null
  const gradeId = rows[0]?.grade_level_id
  const options = (sections ?? []).filter((s) => s.grade_level_id === gradeId)
  const occupied = (id: string) =>
    (enrollments ?? []).filter((e) => e.section_id === id && e.status === 'enrolled').length

  const run = async () => {
    try {
      await assign.mutateAsync({ ids: rows.map((r) => r.id), section_id: sectionId || null })
      toast.success(
        rows.length === 1
          ? `${studentName(rows[0])}: sección actualizada`
          : `${num(rows.length)} estudiantes actualizados`,
      )
      onDone()
      onClose()
    } catch (err) {
      // SECCION_LLENA llega con el nombre y el cupo; la base rechazó el lote
      // completo, así que no quedó un reparto a medias.
      toast.error(errorMessage(err, 'No se pudo asignar la sección'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rows.length === 1 ? `Sección de ${studentName(rows[0])}` : `Asignar sección a ${num(rows.length)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void run()} loading={assign.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Grado: <span className="font-medium text-slate-800">{rows[0]?.grade_level?.name}</span>
        </p>
        {options.length === 0 ? (
          <Notice tone="warn">Este grado no tiene secciones en el año. Créalas en Estructura → Secciones.</Notice>
        ) : (
          <Field label="Sección">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Sin sección</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {sectionLabel(s)} · {num(occupied(s.id))}
                  {s.capacity != null ? ` de ${num(s.capacity)}` : ''} ocupados
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  )
}

/** Retiro: se conserva el historial; solo cambia el estado con fecha y motivo. */
function WithdrawModal({ enrollment, onClose }: { enrollment: EnrollmentRow | null; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateEnrollment()
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')

  useEffect(() => {
    setDate(todayISO())
    setReason('')
  }, [enrollment])

  if (!enrollment) return null

  const run = async () => {
    try {
      await update.mutateAsync({
        id: enrollment.id,
        status: 'withdrawn',
        ended_on: date || todayISO(),
        end_reason: orNull(reason),
      })
      toast.success(`${studentName(enrollment)} retirado`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo retirar'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Retirar a ${studentName(enrollment)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void run()} loading={update.isPending}>
            Retirar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Deja de aparecer en la lista de clase y libera su lugar en la sección. Su asistencia, sus notas y su cuenta
          se conservan.
        </p>
        <Field label="Fecha de retiro">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Motivo" hint="Opcional">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Mudanza" />
        </Field>
      </div>
    </Modal>
  )
}
