import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DoorOpen, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import {
  sectionLabel,
  useAssignSectionTeacher,
  useCurrentPeriod,
  useDeleteSection,
  useGradeLevels,
  useRemoveSectionTeacher,
  useSaveSection,
  useSections,
  useTeachers,
  type SectionRow,
} from '@/hooks/academic'
import { useEnrollments } from '@/hooks/enrollments'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { PERIOD_STATUS_LABEL, SECTION_TEACHER_ROLE_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { num } from '@/lib/format'
import type { AcademicPeriod, SectionTeacherRole } from '@/types/db'
import { Notice, orNull } from './shared'

/**
 * Secciones de un año, agrupadas por grado. Cada tarjeta enseña lo que se
 * decide al organizar el año: cuántos caben, cuántos hay y quién da clase.
 */
export function SectionsTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const { periods, current, isLoading: loadingPeriods } = useCurrentPeriod()
  const [periodId, setPeriodId] = useState<string>('')
  // El año elegido arranca en el actual y se respeta si la persona cambia.
  useEffect(() => {
    if (!periodId && current) setPeriodId(current.id)
  }, [current, periodId])
  const period = periods.find((p) => p.id === periodId) ?? null

  const { data: sections, isLoading } = useSections(period?.id)
  const { data: enrollments } = useEnrollments(period?.id)
  const grades = useGradeLevels()
  const removeSection = useDeleteSection()
  const removeTeacher = useRemoveSectionTeacher()

  const [form, setForm] = useState<{ open: boolean; section: SectionRow | null }>({ open: false, section: null })
  const [assigning, setAssigning] = useState<SectionRow | null>(null)

  // Inscritos activos por sección: se cuentan aquí y no en la consulta de
  // secciones porque PostgREST no agrega sin habilitarlo en el servidor.
  const enrolledBySection = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of enrollments ?? []) {
      if (e.status === 'enrolled' && e.section_id) m.set(e.section_id, (m.get(e.section_id) ?? 0) + 1)
    }
    return m
  }, [enrollments])

  const byGrade = useMemo(() => {
    const groups = new Map<string, { name: string; rows: SectionRow[] }>()
    for (const s of sections ?? []) {
      const key = s.grade_level_id
      if (!groups.has(key)) groups.set(key, { name: s.grade_level?.name ?? 'Grado', rows: [] })
      groups.get(key)!.rows.push(s)
    }
    return [...groups.values()]
  }, [sections])

  const editable = canEdit && period?.status !== 'closed'

  const destroy = async (s: SectionRow) => {
    if (!window.confirm(`¿Eliminar la sección ${sectionLabel(s)}? Solo se puede si no tiene estudiantes ni historial.`)) return
    try {
      await removeSection.mutateAsync(s.id)
      toast.success('Sección eliminada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar la sección'))
    }
  }

  const unassign = async (id: string, name: string) => {
    if (!window.confirm(`¿Quitar a ${name} de esta sección?`)) return
    try {
      await removeTeacher.mutateAsync(id)
      toast.success('Docente quitado de la sección')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo quitar al docente'))
    }
  }

  if (loadingPeriods) return <PageLoader label="Cargando…" />
  if (periods.length === 0) {
    return (
      <EmptyState
        icon={<DoorOpen className="h-6 w-6" />}
        title="Primero crea un año escolar"
        description="Las secciones pertenecen a un año (Kinder A de 2026-2027). Créalo en la pestaña Años."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Año escolar" className="sm:w-64">
          <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {PERIOD_STATUS_LABEL[p.status]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex-1" />
        {editable && (
          <Button onClick={() => setForm({ open: true, section: null })} disabled={(grades.data ?? []).length === 0}>
            <Plus className="h-4 w-4" /> Nueva sección
          </Button>
        )}
      </div>

      {period?.status === 'closed' && (
        <Notice tone="lock">Este año está cerrado: sus secciones se conservan como historial y ya no cambian.</Notice>
      )}
      {editable && (grades.data ?? []).length === 0 && (
        <Notice tone="warn">Antes de crear secciones, registra los grados del colegio en la pestaña Grados.</Notice>
      )}

      {isLoading ? (
        <PageLoader label="Cargando secciones…" />
      ) : byGrade.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-6 w-6" />}
          title="Este año no tiene secciones"
          description="Crea una sección por cada grupo (Pre-Kinder A, Kinder A…) e indica cuántos niños caben."
          action={
            editable && (grades.data ?? []).length > 0 ? (
              <Button onClick={() => setForm({ open: true, section: null })}>
                <Plus className="h-4 w-4" /> Crear la primera
              </Button>
            ) : undefined
          }
        />
      ) : (
        byGrade.map((g) => (
          <div key={g.name} className="space-y-2">
            <h3 className="px-1 text-sm font-semibold text-slate-600">{g.name}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {g.rows.map((s) => {
                const enrolled = enrolledBySection.get(s.id) ?? 0
                const full = s.capacity != null && enrolled >= s.capacity
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{sectionLabel(s)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[s.room && `Aula ${s.room}`, s.shift].filter(Boolean).join(' · ') || 'Sin aula ni tanda'}
                        </p>
                      </div>
                      <Badge tone={full ? 'amber' : 'slate'}>
                        {num(enrolled)}
                        {s.capacity != null ? ` / ${num(s.capacity)}` : ''} niños
                      </Badge>
                      {editable && (
                        <ActionMenu
                          title={sectionLabel(s)}
                          label={`Opciones de ${sectionLabel(s)}`}
                          items={[
                            {
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => setForm({ open: true, section: s }),
                            },
                            {
                              label: 'Asignar docente',
                              icon: <UserPlus className="h-4 w-4" />,
                              onClick: () => setAssigning(s),
                            },
                            {
                              label: 'Eliminar',
                              icon: <Trash2 className="h-4 w-4" />,
                              tone: 'danger',
                              onClick: () => void destroy(s),
                              hint: 'Solo si está vacía',
                            },
                          ]}
                        />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                      {s.section_teachers.length === 0 ? (
                        <span className="text-xs text-slate-400">Sin docente asignado</span>
                      ) : (
                        s.section_teachers.map((st) => {
                          const name = st.teacher ? `${st.teacher.first_name} ${st.teacher.last_name}` : 'Docente'
                          return (
                            <span
                              key={st.id}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 text-xs text-slate-700',
                                editable ? 'pr-1' : 'pr-2.5',
                              )}
                            >
                              <span className="font-medium">{name}</span>
                              <span className="text-slate-400">· {SECTION_TEACHER_ROLE_LABEL[st.role]}</span>
                              {editable && (
                                <button
                                  type="button"
                                  onClick={() => void unassign(st.id, name)}
                                  aria-label={`Quitar a ${name}`}
                                  className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          )
                        })
                      )}
                      {editable && (
                        <Button size="sm" variant="ghost" onClick={() => setAssigning(s)}>
                          <UserPlus className="h-4 w-4" /> Docente
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        ))
      )}

      {period && (
        <SectionFormModal
          open={form.open}
          section={form.section}
          period={period}
          onClose={() => setForm({ open: false, section: null })}
        />
      )}
      <AssignTeacherModal section={assigning} onClose={() => setAssigning(null)} />
    </div>
  )
}

function SectionFormModal({
  open,
  section,
  period,
  onClose,
}: {
  open: boolean
  section: SectionRow | null
  period: AcademicPeriod
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveSection()
  const { data: grades } = useGradeLevels()
  const activeGrades = (grades ?? []).filter((g) => g.active || g.id === section?.grade_level_id)

  const [gradeId, setGradeId] = useState('')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [room, setRoom] = useState('')
  const [shift, setShift] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setGradeId(section?.grade_level_id ?? '')
    setName(section?.name ?? 'A')
    setCapacity(section?.capacity != null ? String(section.capacity) : '')
    setRoom(section?.room ?? '')
    setShift(section?.shift ?? '')
  }, [open, section])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!gradeId) return setError('Elige el grado')
    if (!name.trim()) return setError('Escribe el nombre de la sección (A, B, Azul…)')
    const cap = capacity.trim() === '' ? null : Number(capacity)
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) return setError('La capacidad es un número entero mayor que cero')
    try {
      await save.mutateAsync({
        id: section?.id,
        academic_period_id: period.id,
        grade_level_id: gradeId,
        name: name.trim(),
        capacity: cap,
        room: orNull(room),
        shift: orNull(shift),
      })
      toast.success(section ? 'Sección actualizada' : 'Sección creada')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la sección'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={section ? `Editar ${sectionLabel(section)}` : `Nueva sección · ${period.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="section-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="section-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grado" required>
            {/* Con estudiantes inscritos, cambiar el grado lo rechaza la base
                (la FK compuesta de inscripciones): no se ofrece. */}
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)} disabled={Boolean(section)}>
              <option value="">Elige…</option>
              {activeGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sección" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A" />
          </Field>
          <Field label="Capacidad" hint="Vacío = sin límite">
            <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="20" />
          </Field>
          <Field label="Aula" hint="Opcional">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
        </div>
        <Field label="Tanda" hint="Opcional">
          <Select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">Sin indicar</option>
            <option value="Matutina">Matutina</option>
            <option value="Vespertina">Vespertina</option>
            <option value="Jornada extendida">Jornada extendida</option>
          </Select>
        </Field>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

function AssignTeacherModal({ section, onClose }: { section: SectionRow | null; onClose: () => void }) {
  const toast = useToast()
  const assign = useAssignSectionTeacher()
  const { data: teachers } = useTeachers()
  const [teacherId, setTeacherId] = useState('')
  const [role, setRole] = useState<SectionTeacherRole>('lead')
  const [subject, setSubject] = useState('')

  useEffect(() => {
    setTeacherId('')
    // Si la sección todavía no tiene titular, lo normal es estar asignándolo.
    setRole(section && section.section_teachers.some((st) => st.role === 'lead') ? 'assistant' : 'lead')
    setSubject('')
  }, [section])

  if (!section) return null
  const assigned = new Set(section.section_teachers.map((st) => st.teacher_id))
  const available = (teachers ?? []).filter((t) => t.status === 'active' && !assigned.has(t.id))

  const run = async () => {
    try {
      await assign.mutateAsync({
        section_id: section.id,
        teacher_id: teacherId,
        role,
        subject: role === 'subject' ? orNull(subject) : null,
      })
      toast.success('Docente asignado')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo asignar al docente'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Docente para ${sectionLabel(section)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!teacherId} loading={assign.isPending} onClick={() => void run()}>
            Asignar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {available.length === 0 ? (
          <Notice tone="warn">No hay docentes activos libres. Regístralos en la pestaña Docentes.</Notice>
        ) : (
          <Field label="Docente" required>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Elige…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                  {t.user_id ? '' : ' (sin acceso a la app)'}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Función">
          <Select value={role} onChange={(e) => setRole(e.target.value as SectionTeacherRole)}>
            {(Object.keys(SECTION_TEACHER_ROLE_LABEL) as SectionTeacherRole[]).map((r) => (
              <option key={r} value={r}>
                {SECTION_TEACHER_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {role === 'subject' && (
          <Field label="Materia">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. Inglés" />
          </Field>
        )}
        <p className="text-xs text-slate-500">
          Un docente con cuenta enlazada podrá pasar lista y calificar en esta sección.
        </p>
      </div>
    </Modal>
  )
}
