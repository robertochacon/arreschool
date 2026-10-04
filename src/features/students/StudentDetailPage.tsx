import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, HeartPulse, Pencil, Trash2 } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState, PageLoader, Spinner } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useDeleteStudent, useStudent, useUploadStudentPhoto } from '@/hooks/students'
import { useCurrentPeriod } from '@/hooks/academic'
import { useStudentEnrollments } from '@/hooks/enrollments'
import { StudentAccountTab } from '@/features/finance/StudentAccountTab'
import { STUDENT_STATUS_LABEL } from '@/lib/constants'
import { usePermissions } from '@/lib/permissions'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { StudentFormModal } from './StudentFormModal'
import { StudentFamilyTab } from './StudentFamilyTab'
import { StudentDocumentsTab } from './StudentDocumentsTab'
import { StudentHistoryTab } from './StudentHistoryTab'
import { STUDENT_STATUS_TONE, StudentAvatar, ageLabel, studentName } from './shared'
import type { Student } from '@/types/db'

type Tab = 'summary' | 'family' | 'documents' | 'history' | 'account'

const GENDER_LABEL: Record<NonNullable<Student['gender']>, string> = {
  F: 'Femenino',
  M: 'Masculino',
  X: 'Otro',
}

/** Fotos: tope de cliente para no subir 12 MB de cámara por datos móviles. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/**
 * Ficha del estudiante: todo lo suyo en una pantalla, por pestañas. La pestaña
 * "Cuenta" solo existe para quien maneja finanzas (la base, además, no le
 * devolvería cargos a nadie más).
 */
export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = usePermissions()
  const { data: student, isLoading, isError, error } = useStudent(id)
  const { current } = useCurrentPeriod()
  const { data: enrollments } = useStudentEnrollments(id)
  const uploadPhoto = useUploadStudentPhoto()
  const remove = useDeleteStudent()

  const [tab, setTab] = useState<Tab>('summary')
  const [editOpen, setEditOpen] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const canManage = can('manageStudents')
  const canFinance = can('handleFinance')

  const tabs = useMemo(() => {
    const t: { value: Tab; label: string }[] = [
      { value: 'summary', label: 'Resumen' },
      { value: 'family', label: 'Familia' },
      { value: 'documents', label: 'Documentos' },
      { value: 'history', label: 'Historial' },
    ]
    if (canFinance) t.push({ value: 'account', label: 'Cuenta' })
    return t
  }, [canFinance])

  const currentEnrollment = (enrollments ?? []).find((e) => e.academic_period_id === current?.id)

  if (isLoading) return <PageLoader label="Cargando ficha…" />
  if (isError || !student) {
    return (
      <Card>
        <EmptyState
          title="No encontramos a este estudiante"
          description={isError ? errorMessage(error) : 'Puede que se haya eliminado o que el enlace sea de otro colegio.'}
          action={
            <Link to="/estudiantes">
              <Button variant="outline">Volver a estudiantes</Button>
            </Link>
          }
        />
      </Card>
    )
  }

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('La foto pasa de 5 MB. Prueba con otra o recórtala.')
      return
    }
    try {
      await uploadPhoto.mutateAsync({ student, file })
      toast.success('Foto actualizada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  const destroy = async () => {
    if (
      !window.confirm(
        `¿Eliminar a ${studentName(student)}? Solo se puede si no tiene historial; si ya estuvo inscrito, márcalo como retirado.`,
      )
    )
      return
    try {
      await remove.mutateAsync(student.id)
      toast.success('Estudiante eliminado')
      navigate('/estudiantes', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const age = ageLabel(student.birth_date)

  return (
    <div className="space-y-4">
      <Link to="/estudiantes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Estudiantes
      </Link>

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <StudentAvatar student={student} size="lg" />
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={uploadPhoto.isPending}
                  aria-label="Cambiar foto"
                  title="Cambiar foto"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                >
                  {uploadPhoto.isPending ? <Spinner size="sm" className="text-white" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPhoto(e.target.files?.[0])}
                />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{studentName(student)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="tabular-nums">{student.code}</span>
              {age && ` · ${age}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={STUDENT_STATUS_TONE[student.status]}>{STUDENT_STATUS_LABEL[student.status]}</Badge>
              {currentEnrollment ? (
                <Badge tone="brand">
                  {currentEnrollment.grade_level?.name}
                  {currentEnrollment.section ? ` ${currentEnrollment.section.name}` : ' · sin sección'}
                </Badge>
              ) : (
                current && <Badge tone="slate">No inscrito en {current.name}</Badge>
              )}
            </div>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="hidden shrink-0 sm:inline-flex">
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
        </div>

        {/* Lo médico, a la vista en cuanto se abre la ficha. */}
        {(student.allergies || student.medical_notes) && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              {student.allergies && (
                <p>
                  <span className="font-semibold">Alergias:</span> {student.allergies}
                </p>
              )}
              {student.medical_notes && (
                <p>
                  <span className="font-semibold">Salud:</span> {student.medical_notes}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Segmented label="Secciones de la ficha" value={tab} onChange={setTab} options={tabs} />

      {tab === 'summary' && (
        <Card>
          <CardHeader
            title="Datos del estudiante"
            action={
              canManage ? (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Info label="Fecha de nacimiento">
                {student.birth_date ? `${fmtDate(student.birth_date)}${age ? ` (${age})` : ''}` : '—'}
              </Info>
              <Info label="Sexo">{student.gender ? GENDER_LABEL[student.gender] : '—'}</Info>
              <Info label="Documento">{student.document_id ?? '—'}</Info>
              <Info label="Nacionalidad">{student.nationality ?? '—'}</Info>
              <Info label="Tipo de sangre">{student.blood_type ?? '—'}</Info>
              <Info label="Fecha de ingreso">{fmtDate(student.admission_date)}</Info>
              <Info label="Dirección" wide>
                {student.address ?? '—'}
              </Info>
              <Info label="Alergias" wide>
                {student.allergies ?? 'Ninguna registrada'}
              </Info>
              <Info label="Notas médicas" wide>
                {student.medical_notes ?? '—'}
              </Info>
              {student.notes && (
                <Info label="Notas internas" wide>
                  {student.notes}
                </Info>
              )}
            </dl>
            {canManage && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <Button variant="ghost" size="sm" onClick={() => void destroy()} loading={remove.isPending} className="text-red-600">
                  <Trash2 className="h-4 w-4" /> Eliminar estudiante
                </Button>
                <p className="mt-1 text-xs text-slate-400">
                  Solo para altas hechas por error. Si ya estuvo inscrito, cambia su estado a «Retirado».
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'family' && <StudentFamilyTab studentId={student.id} canManage={canManage} />}
      {tab === 'documents' && <StudentDocumentsTab student={student} canManage={canManage} />}
      {tab === 'history' && <StudentHistoryTab studentId={student.id} canManage={canManage} />}
      {tab === 'account' && canFinance && <StudentAccountTab studentId={student.id} />}

      <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} student={student} />
    </div>
  )
}

function Info({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-700">{children}</dd>
    </div>
  )
}
