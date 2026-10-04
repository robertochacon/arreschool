import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useStudents } from '@/hooks/students'
import { useCurrentPeriod } from '@/hooks/academic'
import { useEnrollments, type EnrollmentRow } from '@/hooks/enrollments'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { Avatar, EmptyState, PageLoader } from '@/components/ui/misc'
import { STUDENT_STATUS_LABEL } from '@/lib/constants'
import { usePermissions } from '@/lib/permissions'
import { errorMessage } from '@/lib/errors'
import { num } from '@/lib/format'
import { StudentFormModal } from './StudentFormModal'
import { STUDENT_STATUS_TONE, ageLabel, studentName } from './shared'
import type { StudentStatus } from '@/types/db'

/**
 * Listado de estudiantes. Sigue el molde del starter: filtro y paginación en el
 * cliente (cabe en memoria y funciona con la lista cacheada sin señal), tabla
 * en escritorio y tarjetas en el teléfono.
 *
 * El grado y la sección NO son del estudiante sino de su inscripción del año en
 * curso: se cruzan aquí con `useEnrollments` en vez de duplicarlos en la ficha.
 */

const PAGE_SIZE = 15

type StatusFilter = 'all' | StudentStatus

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'all', label: 'Todos' },
  { value: 'inactive', label: STUDENT_STATUS_LABEL.inactive },
  { value: 'graduated', label: 'Egresados' },
  { value: 'withdrawn', label: 'Retirados' },
]

export function StudentsPage() {
  const { plan } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useStudents()
  const { current } = useCurrentPeriod()
  const { data: enrollments } = useEnrollments(current?.id)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(false)
  const [limitNotice, setLimitNotice] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  const canManage = can('manageStudents')
  const students = useMemo(() => data ?? [], [data])
  const activeCount = useMemo(() => students.filter((s) => s.status === 'active').length, [students])

  /** Inscripción del año en curso por estudiante. */
  const enrollmentOf = useMemo(() => {
    const map = new Map<string, EnrollmentRow>()
    for (const e of enrollments ?? []) map.set(e.student_id, e)
    return map
  }, [enrollments])

  // `/estudiantes?nuevo=1` abre el alta (el panel enlaza así). El parámetro se
  // consume y se limpia para que recargar no reabra el diálogo.
  useEffect(() => {
    if (!params.has('nuevo')) return
    if (canManage) setOpen(true)
    setParams({}, { replace: true })
  }, [params, setParams, canManage])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (status !== 'all' && s.status !== status) return false
      if (!q) return true
      const enr = enrollmentOf.get(s.id)
      return (
        studentName(s).toLowerCase().includes(q) ||
        `${s.last_name} ${s.first_name}`.toLowerCase().includes(q) ||
        (s.code ?? '').toLowerCase().includes(q) ||
        (s.document_id ?? '').toLowerCase().includes(q) ||
        (enr?.grade_level?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [students, search, status, enrollmentOf])

  useEffect(() => setPage(0), [search, status])

  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)

  const placement = (id: string) => {
    const e = enrollmentOf.get(id)
    if (!e) return null
    return `${e.grade_level?.name ?? ''}${e.section ? ` ${e.section.name}` : ' · sin sección'}`
  }

  return (
    <div>
      <PageHeader
        title="Estudiantes"
        description={
          plan.maxStudents == null
            ? `${num(activeCount)} activos`
            : `${num(activeCount)} de ${num(plan.maxStudents)} activos de tu plan`
        }
        action={
          canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Nuevo estudiante
            </Button>
          ) : undefined
        }
      />

      {/* Tope de plan: lo levanta el ERROR de la base, que es quien sabe el
          número real del plan vigente. Se queda hasta cerrarlo porque la salida
          no está en esta pantalla sino en el plan. */}
      {limitNotice && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Llegaste al tope de tu plan</p>
            <p className="mt-0.5">{limitNotice}</p>
            <Link to="/configuracion" className="mt-2 inline-block">
              <Button size="sm" variant="outline">
                Ver planes
              </Button>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setLimitNotice(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-lg p-1 text-amber-500 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, matrícula, documento o grado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            type="search"
          />
        </div>
        <Segmented label="Filtrar por estado" value={status} onChange={setStatus} options={FILTERS} />
      </div>

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando estudiantes…" />
        ) : isError ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los estudiantes.')}</p>
            <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
              Reintentar
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-6 w-6" />}
            title={students.length === 0 ? 'Todavía no hay estudiantes' : 'Sin resultados'}
            description={
              students.length === 0
                ? 'Registra al primero; después podrás vincular a su familia e inscribirlo en un grado.'
                : 'Prueba con otra búsqueda o cambia el filtro de estado.'
            }
            action={
              students.length === 0 ? (
                canManage ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Registrar el primero
                  </Button>
                ) : undefined
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setStatus('all')
                  }}
                >
                  Limpiar filtros
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium">Matrícula</th>
                    <th className="px-4 py-3 font-medium">Edad</th>
                    <th className="px-4 py-3 font-medium">{current ? `Grado ${current.name}` : 'Grado'}</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slice.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/estudiantes/${s.id}`)}
                      className="cursor-pointer hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={studentName(s)} size="sm" />
                          <div className="min-w-0">
                            <Link
                              to={`/estudiantes/${s.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-slate-800 hover:text-brand-600"
                            >
                              {s.last_name}, {s.first_name}
                            </Link>
                            {s.allergies && (
                              <p className="max-w-xs truncate text-xs text-amber-700">Alergias: {s.allergies}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{s.code}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{ageLabel(s.birth_date) ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {placement(s.id) ?? <span className="text-slate-400">No inscrito</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STUDENT_STATUS_TONE[s.status]}>{STUDENT_STATUS_LABEL[s.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DataList>
              {slice.map((s) => (
                <DataRow
                  key={s.id}
                  leading={<Avatar name={studentName(s)} size="sm" />}
                  title={`${s.last_name}, ${s.first_name}`}
                  titleExtra={s.code}
                  onClick={() => navigate(`/estudiantes/${s.id}`)}
                  tone={s.status === 'active' ? undefined : 'muted'}
                  badges={
                    <>
                      <Badge tone={STUDENT_STATUS_TONE[s.status]}>{STUDENT_STATUS_LABEL[s.status]}</Badge>
                      {s.allergies && <Badge tone="amber">Alergias</Badge>}
                    </>
                  }
                >
                  <DataFields>
                    <DataField label="Grado">{placement(s.id) ?? 'No inscrito'}</DataField>
                    <DataField label="Edad">{ageLabel(s.birth_date) ?? '—'}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>

            <Pagination
              page={safePage}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPage={setPage}
              label="estudiantes"
            />
          </>
        )}
      </Card>

      <StudentFormModal
        open={open}
        onClose={() => setOpen(false)}
        student={null}
        onCreated={(s) => navigate(`/estudiantes/${s.id}`)}
        onPlanLimit={setLimitNotice}
      />
    </div>
  )
}
