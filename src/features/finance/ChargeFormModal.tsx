import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useCreateCharge, useFeeConcepts, useUpdateCharge, type ChargeRow } from '@/hooks/finance'
import { errorMessage } from '@/lib/errors'
import { money } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { StudentPicker, monthToBilling, parseAmount } from './financeUi'

/*
 * El monto se valida como TEXTO y se convierte al enviar (mismo motivo que en el
 * molde del starter: con `z.coerce` el tipo de entrada y el de salida dejan de
 * coincidir y el resolver se pelea con `useForm`).
 */
const schema = z.object({
  fee_concept_id: z.string(),
  description: z.string().trim().min(2, 'Escribe una descripción'),
  amount: z
    .string()
    .trim()
    .refine((v) => parseAmount(v) !== null, 'Escribe un monto mayor que cero'),
  due_date: z.string(),
  /** 'YYYY-MM' del <input type="month">; vacío = no es una mensualidad. */
  billing_month: z.string(),
})

type FormValues = z.infer<typeof schema>

const BLANK: FormValues = { fee_concept_id: '', description: '', amount: '', due_date: '', billing_month: '' }

/**
 * Alta y corrección de un cargo SUELTO (uniforme de una niña, una excursión).
 * Lo masivo (la mensualidad de todos) va por `GenerateChargesModal`.
 *
 * Al editar solo se tocan descripción, monto y vencimiento: es lo único que la
 * base deja cambiar desde el cliente (privilegios por columna), y además no
 * deja bajar el monto por debajo de lo ya pagado.
 */
export function ChargeFormModal({
  open,
  onClose,
  charge,
  studentId,
}: {
  open: boolean
  onClose: () => void
  /** `null` = crear. */
  charge: ChargeRow | null
  /** Estudiante fijo (desde su cuenta). Sin él, se elige en el diálogo. */
  studentId?: string
}) {
  const toast = useToast()
  const { tenant } = useAuth()
  const { data: concepts } = useFeeConcepts()
  const create = useCreateCharge()
  const update = useUpdateCharge()
  const [student, setStudent] = useState<string | null>(studentId ?? null)
  const [studentError, setStudentError] = useState<string | null>(null)
  const isEdit = Boolean(charge)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: BLANK })

  // Se rellena al ABRIR: el diálogo vive montado y conservaría lo de la vez anterior.
  useEffect(() => {
    if (!open) return
    setStudent(studentId ?? charge?.student_id ?? null)
    setStudentError(null)
    reset(
      charge
        ? {
            fee_concept_id: charge.fee_concept_id ?? '',
            description: charge.description,
            amount: String(charge.amount),
            due_date: charge.due_date ?? '',
            billing_month: charge.billing_month?.slice(0, 7) ?? '',
          }
        : BLANK,
    )
  }, [open, charge, studentId, reset])

  const conceptId = watch('fee_concept_id')
  const concept = concepts?.find((c) => c.id === conceptId)

  // Elegir un concepto precarga su monto y su nombre: es lo que hace que crear
  // un cargo sea "elegir y guardar" en vez de escribirlo todo cada vez.
  const pickConcept = (id: string) => {
    setValue('fee_concept_id', id)
    const c = concepts?.find((x) => x.id === id)
    if (!c) return
    setValue('description', c.name, { shouldValidate: true })
    if (c.default_amount > 0) setValue('amount', String(c.default_amount), { shouldValidate: true })
  }

  const submit = handleSubmit(async (v) => {
    const amount = parseAmount(v.amount)!
    try {
      if (charge) {
        await update.mutateAsync({
          id: charge.id,
          description: v.description,
          amount,
          due_date: v.due_date || null,
        })
        toast.success('Cargo actualizado')
      } else {
        if (!student) {
          setStudentError('Elige el estudiante')
          return
        }
        await create.mutateAsync({
          student_id: student,
          enrollment_id: null,
          fee_concept_id: v.fee_concept_id || null,
          description: v.description,
          amount,
          due_date: v.due_date || null,
          // El mes solo cuenta para conceptos recurrentes: es la llave que
          // impide cobrar dos veces la misma mensualidad.
          billing_month: concept?.is_recurring ? monthToBilling(v.billing_month) : null,
        })
        toast.success(`Cargo creado por ${money(amount, tenant?.currency)}`)
      }
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el cargo'))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Corregir cargo' : 'Nuevo cargo'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="charge-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Guardar cambios' : 'Crear cargo'}
          </Button>
        </>
      }
    >
      <form id="charge-form" onSubmit={submit} className="space-y-4" noValidate>
        {!isEdit && !studentId && (
          <Field label="Estudiante" required error={studentError ?? undefined}>
            <StudentPicker
              value={student}
              onChange={(id) => {
                setStudent(id)
                setStudentError(null)
              }}
            />
          </Field>
        )}

        {!isEdit && (
          <Field label="Concepto" hint="Opcional: precarga el monto y la descripción">
            <Select value={conceptId} onChange={(e) => pickConcept(e.target.value)}>
              <option value="">Sin concepto</option>
              {(concepts ?? [])
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        <Field label="Descripción" required error={errors.description?.message}>
          <Input placeholder="Ej. Uniforme de educación física" {...register('description')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Monto" required error={errors.amount?.message}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" {...register('amount')} />
          </Field>
          <Field label="Vence" hint="Opcional">
            <Input type="date" {...register('due_date')} />
          </Field>
        </div>

        {!isEdit && concept?.is_recurring && (
          <Field label="Mes que cubre" hint="Evita cobrar dos veces la misma mensualidad">
            <Input type="month" {...register('billing_month')} />
          </Field>
        )}

        {isEdit && charge && charge.amount_paid > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este cargo ya tiene {money(charge.amount_paid, tenant?.currency)} pagados: el monto no
            puede quedar por debajo de eso.
          </p>
        )}
      </form>
    </Modal>
  )
}
