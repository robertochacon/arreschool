import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HeartPulse } from 'lucide-react'
import { format } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useCreateStudent, useUpdateStudent, type StudentInput } from '@/hooks/students'
import { STUDENT_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import type { Student, StudentStatus } from '@/types/db'

/*
 * Las fechas se validan como TEXTO 'YYYY-MM-DD' (lo que devuelve un <input
 * type="date">) y se mandan tal cual: la columna es `date` y convertirlas a
 * `Date` en el navegador es justo donde se cuela el desfase de zona horaria.
 */
const schema = z.object({
  code: z.string().trim().max(30, 'Máximo 30 caracteres'),
  first_name: z.string().trim().min(1, 'Escribe el nombre'),
  last_name: z.string().trim().min(1, 'Escribe el apellido'),
  birth_date: z.string(),
  gender: z.enum(['', 'F', 'M', 'X']),
  document_id: z.string().trim(),
  nationality: z.string().trim(),
  address: z.string().trim(),
  blood_type: z.string().trim().max(5, 'Ej. O+'),
  allergies: z.string().trim().max(500, 'Máximo 500 caracteres'),
  medical_notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
  status: z.enum(['active', 'inactive', 'graduated', 'withdrawn']),
  admission_date: z.string().min(1, 'Indica la fecha de ingreso'),
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
})

type FormValues = z.infer<typeof schema>

const blank = (): FormValues => ({
  code: '',
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: '',
  document_id: '',
  nationality: '',
  address: '',
  blood_type: '',
  allergies: '',
  medical_notes: '',
  status: 'active',
  // Hoy en la zona del dispositivo, no en UTC (toISOString restaría un día por
  // la noche en América).
  admission_date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
})

/** '' → null: la base guarda "sin dato" como NULL, no como cadena vacía. */
const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

/**
 * Alta y edición de un estudiante. Es el ÚNICO formulario de la ficha
 * personal: la lista y la ficha abren este mismo diálogo.
 */
export function StudentFormModal({
  open,
  onClose,
  student,
  onCreated,
  onPlanLimit,
}: {
  open: boolean
  onClose: () => void
  /** `null` = alta. */
  student: Student | null
  onCreated?: (student: Student) => void
  /** El alta chocó con el tope de estudiantes del plan (PLAN_LIMIT_STUDENTS). */
  onPlanLimit?: (message: string) => void
}) {
  const toast = useToast()
  const create = useCreateStudent()
  const update = useUpdateStudent()
  const isEdit = Boolean(student)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank() })

  // Se rellena al ABRIR: el diálogo vive montado y conservaría lo anterior.
  useEffect(() => {
    if (!open) return
    reset(
      student
        ? {
            code: student.code ?? '',
            first_name: student.first_name,
            last_name: student.last_name,
            birth_date: student.birth_date ?? '',
            gender: student.gender ?? '',
            document_id: student.document_id ?? '',
            nationality: student.nationality ?? '',
            address: student.address ?? '',
            blood_type: student.blood_type ?? '',
            allergies: student.allergies ?? '',
            medical_notes: student.medical_notes ?? '',
            status: student.status,
            admission_date: student.admission_date,
            notes: student.notes ?? '',
          }
        : blank(),
    )
  }, [open, student, reset])

  const submit = handleSubmit(async (v) => {
    const input: StudentInput = {
      code: orNull(v.code),
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      birth_date: v.birth_date || null,
      gender: v.gender === '' ? null : v.gender,
      document_id: orNull(v.document_id),
      nationality: orNull(v.nationality),
      address: orNull(v.address),
      blood_type: orNull(v.blood_type),
      allergies: orNull(v.allergies),
      medical_notes: orNull(v.medical_notes),
      status: v.status as StudentStatus,
      admission_date: v.admission_date,
      notes: orNull(v.notes),
    }
    try {
      if (student) {
        // La matrícula no se puede vaciar en una edición: vacío = "no la toques".
        await update.mutateAsync({ id: student.id, ...input, code: input.code ?? student.code })
        toast.success('Datos guardados')
        onClose()
      } else {
        const created = await create.mutateAsync(input)
        toast.success(`${created.first_name} registrado con la matrícula ${created.code}`)
        onClose()
        onCreated?.(created)
      }
    } catch (err) {
      const message = errorMessage(err, 'No se pudo guardar el estudiante')
      toast.error(message)
      // Se mira el mensaje CRUDO: errorMessage ya le quitó el prefijo técnico.
      const raw = (err as { message?: string } | null)?.message ?? ''
      if (raw.includes('PLAN_LIMIT_STUDENTS')) {
        onPlanLimit?.(message)
        onClose()
      }
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Editar estudiante' : 'Nuevo estudiante'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="student-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombres" required error={errors.first_name?.message}>
            <Input autoComplete="off" {...register('first_name')} />
          </Field>
          <Field label="Apellidos" required error={errors.last_name?.message}>
            <Input autoComplete="off" {...register('last_name')} />
          </Field>
          <Field label="Fecha de nacimiento" error={errors.birth_date?.message}>
            <Input type="date" {...register('birth_date')} />
          </Field>
          <Field label="Sexo" error={errors.gender?.message}>
            <Select {...register('gender')}>
              <option value="">Sin indicar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro</option>
            </Select>
          </Field>
          <Field label="Matrícula" hint="Vacío = se asigna sola (EST-000001…)" error={errors.code?.message}>
            <Input placeholder="Automática" {...register('code')} />
          </Field>
          <Field label="Documento (NUI / cédula)" hint="Opcional" error={errors.document_id?.message}>
            <Input {...register('document_id')} />
          </Field>
          <Field label="Fecha de ingreso" required error={errors.admission_date?.message}>
            <Input type="date" {...register('admission_date')} />
          </Field>
          <Field label="Estado" error={errors.status?.message}>
            <Select {...register('status')}>
              {(Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STUDENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nacionalidad" hint="Opcional">
            <Input {...register('nationality')} />
          </Field>
          <Field label="Tipo de sangre" hint="Opcional" error={errors.blood_type?.message}>
            <Input placeholder="Ej. O+" {...register('blood_type')} />
          </Field>
        </div>

        <Field label="Dirección" hint="Opcional">
          <Input {...register('address')} />
        </Field>

        {/* Lo médico va en un bloque aparte y en ámbar: es lo que la docente
            tiene que ver antes de la merienda, no un campo más del formulario. */}
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <HeartPulse className="h-4 w-4" /> Salud
          </p>
          <Field label="Alergias" hint="Alimentos, medicamentos, picaduras…" error={errors.allergies?.message}>
            <Textarea rows={2} placeholder="Ninguna conocida" {...register('allergies')} />
          </Field>
          <Field label="Notas médicas" hint="Condiciones, medicación, indicaciones" error={errors.medical_notes?.message}>
            <Textarea rows={2} {...register('medical_notes')} />
          </Field>
        </div>

        <Field label="Notas internas" hint="Opcional" error={errors.notes?.message}>
          <Textarea rows={2} {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
