import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useCurrentPeriod, useGradeLevels, useSections } from '@/hooks/academic'
import { useEnrollStudent, useEnrollments, useStudentEnrollments } from '@/hooks/enrollments'
import { useStudents } from '@/hooks/students'
import { PERIOD_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { GradeLevel } from '@/types/db'
import { Notice, todayISO } from './shared'

/**
 * Inscribir a un estudiante en un año escolar.
 *
 * Es el ÚNICO diálogo de inscripción: lo abren la ficha del estudiante (con
 * `studentId` ya elegido) y la pantalla de Inscripciones (con buscador). La
 * base valida lo importante —una inscripción por año, sección del mismo año y
 * grado, capacidad, año no cerrado— y aquí solo se evita ofrecer lo que va a
 * fallar.
 */
export function EnrollStudentModal({
  open,
  onClose,
  studentId,
  onEnrolled,
}: {
  open: boolean
  onClose: () => void
  /** Estudiante ya elegido (desde su ficha). Sin él, el diálogo deja buscarlo. */
  studentId?: string
  onEnrolled?: (enrollmentId: string) => void
}) {
  const toast = useToast()
  const enroll = useEnrollStudent()
  const { periods, current } = useCurrentPeriod()
  const openPeriods = useMemo(() => periods.filter((p) => p.status !== 'closed'), [periods])
  const { data: grades } = useGradeLevels()
  const { data: students } = useStudents()

  const [periodId, setPeriodId] = useState('')
  const [pickedStudent, setPickedStudent] = useState('')
  const [search, setSearch] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [enrolledOn, setEnrolledOn] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)

  const chosenStudent = studentId ?? pickedStudent
  const { data: sections } = useSections(periodId || undefined)
  const { data: periodEnrollments } = useEnrollments(periodId || undefined)
  const { data: history } = useStudentEnrollments(chosenStudent || undefined)

  // Al ABRIR se reinicia todo: el diálogo vive montado en la pantalla que lo
  // usa y conservaría lo de la inscripción anterior.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSearch('')
    setPickedStudent('')
    setGradeId('')
    setSectionId('')
    setEnrolledOn(todayISO())
    const preferred = current && current.status !== 'closed' ? current : openPeriods[0]
    setPeriodId(preferred?.id ?? '')
    // Solo al abrir: re-ejecutarlo cuando llegan los años borraría lo elegido.
  }, [open])

  // Si el año preferido llega después de abrir (consulta lenta), se aplica.
  useEffect(() => {
    if (open && !periodId) {
      const preferred = current && current.status !== 'closed' ? current : openPeriods[0]
      if (preferred) setPeriodId(preferred.id)
    }
  }, [open, periodId, current, openPeriods])

  const enrolledIds = useMemo(
    () => new Set((periodEnrollments ?? []).map((e) => e.student_id)),
    [periodEnrollments],
  )
  const alreadyEnrolled = Boolean(chosenStudent && enrolledIds.has(chosenStudent))

  /**
   * Grado sugerido a partir del historial: si el año pasado fue promovido, el
   * siguiente; si repite, el mismo. Ahorra el paso más propenso a error en la
   * reinscripción.
   */
  useEffect(() => {
    if (!open || gradeId || !history || !grades) return
    const last = history.find((h) => h.academic_period_id !== periodId)
    if (!last) return
    const lastGrade = grades.find((g) => g.id === last.grade_level_id)
    if (!lastGrade) return
    if (last.status === 'retained') setGradeId(lastGrade.id)
    else if (last.status === 'promoted' || last.status === 'completed') {
      const next = nextGrade(grades, lastGrade)
      if (next) setGradeId(next.id)
    }
  }, [open, history, grades, gradeId, periodId])

  const candidates = useMemo(() => {
    if (studentId) return []
    const q = search.trim().toLowerCase()
    return (students ?? [])
      .filter((s) => s.status === 'active' && !enrolledIds.has(s.id))
      .filter((s) => !q || `${s.first_name} ${s.last_name} ${s.code}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [students, enrolledIds, search, studentId])

  const student = (students ?? []).find((s) => s.id === chosenStudent)
  const gradeSections = (sections ?? []).filter((s) => s.grade_level_id === gradeId)
  const activeGrades = (grades ?? []).filter((g) => g.active)

  const submit = async () => {
    setError(null)
    if (!chosenStudent) return setError('Elige el estudiante')
    if (!periodId) return setError('Elige el año escolar')
    if (!gradeId) return setError('Elige el grado')
    try {
      const e = await enroll.mutateAsync({
        student_id: chosenStudent,
        academic_period_id: periodId,
        grade_level_id: gradeId,
        section_id: sectionId || null,
        enrolled_on: enrolledOn || todayISO(),
      })
      toast.success(
        `${student ? `${student.first_name} ${student.last_name}` : 'Estudiante'} inscrito` +
          (sectionId ? '' : '. Asígnale una sección cuando la tengas.'),
      )
      onEnrolled?.(e.id)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo inscribir'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inscribir estudiante"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            loading={enroll.isPending}
            disabled={alreadyEnrolled || openPeriods.length === 0}
          >
            Inscribir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {openPeriods.length === 0 && (
          <Notice tone="warn">No hay ningún año escolar abierto. Créalo en Estructura → Años.</Notice>
        )}

        <Field label="Año escolar" required>
          <Select
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value)
              setSectionId('')
            }}
          >
            {openPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {PERIOD_STATUS_LABEL[p.status]}
              </option>
            ))}
          </Select>
        </Field>

        {studentId ? (
          student && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold">
                {student.first_name} {student.last_name}
              </span>{' '}
              <span className="text-slate-400">· {student.code}</span>
            </p>
          )
        ) : (
          <Field label="Estudiante" required hint="Solo aparecen activos que aún no están inscritos en ese año">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                className="pl-9"
                placeholder="Nombre o matrícula…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPickedStudent('')
                  setGradeId('')
                }}
              />
            </div>
            <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {candidates.length === 0 ? (
                <li className="px-3 py-3 text-sm text-slate-400">Sin coincidencias</li>
              ) : (
                candidates.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedStudent(s.id)
                        setGradeId('')
                        setSectionId('')
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm',
                        pickedStudent === s.id ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50',
                      )}
                    >
                      <span className="truncate font-medium">
                        {s.last_name}, {s.first_name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{s.code}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Field>
        )}

        {alreadyEnrolled && (
          <Notice tone="warn">Este estudiante ya está inscrito en ese año. Búscalo en Inscripciones para cambiarlo.</Notice>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grado" required>
            <Select
              value={gradeId}
              onChange={(e) => {
                setGradeId(e.target.value)
                setSectionId('')
              }}
            >
              <option value="">Elige…</option>
              {activeGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sección" hint="Opcional: se puede asignar después">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!gradeId}>
              <option value="">Sin sección por ahora</option>
              {gradeSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.grade_level?.name} {s.name}
                  {s.capacity != null ? ` (cupo ${s.capacity})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Fecha de inscripción">
          <Input type="date" value={enrolledOn} onChange={(e) => setEnrolledOn(e.target.value)} />
        </Field>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

/** El grado activo con el siguiente `sort_order` (misma regla que el cierre de año en la base). */
function nextGrade(grades: GradeLevel[], from: GradeLevel): GradeLevel | undefined {
  return grades
    .filter((g) => g.active && g.sort_order > from.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)[0]
}
