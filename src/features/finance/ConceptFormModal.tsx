import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useSaveFeeConcept } from '@/hooks/finance'
import { FEE_KIND_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import type { FeeConcept, FeeKind } from '@/types/db'

const KINDS = Object.keys(FEE_KIND_LABEL) as FeeKind[]

const schema = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre'),
  kind: z.enum(KINDS as [FeeKind, ...FeeKind[]]),
  // Cero vale: un concepto sin monto fijo (excursiones) se escribe al cobrar.
  default_amount: z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Escribe un monto válido'),
  is_recurring: z.boolean(),
  active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const BLANK: FormValues = { name: '', kind: 'tuition', default_amount: '', is_recurring: true, active: true }

/** Alta y edición de un concepto de cobro (Inscripción, Mensualidad, Materiales…). */
export function ConceptFormModal({
  open,
  onClose,
  concept,
}: {
  open: boolean
  onClose: () => void
  concept: FeeConcept | null
}) {
  const toast = useToast()
  const save = useSaveFeeConcept()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: BLANK })

  useEffect(() => {
    if (!open) return
    reset(
      concept
        ? {
            name: concept.name,
            kind: concept.kind,
            default_amount: String(concept.default_amount ?? 0),
            is_recurring: concept.is_recurring,
            active: concept.active,
          }
        : BLANK,
    )
  }, [open, concept, reset])

  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: concept?.id,
        name: v.name,
        kind: v.kind,
        default_amount: v.default_amount === '' ? 0 : Number(v.default_amount),
        is_recurring: v.is_recurring,
        active: v.active,
      })
      toast.success(concept ? 'Concepto actualizado' : 'Concepto creado')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el concepto'))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={concept ? 'Editar concepto' : 'Nuevo concepto'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="concept-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="concept-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nombre" required error={errors.name?.message}>
          <Input placeholder="Ej. Mensualidad" {...register('name')} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select
              {...register('kind')}
              onChange={(e) => {
                const kind = e.target.value as FeeKind
                setValue('kind', kind)
                // Sugerencia, no regla: la mensualidad casi siempre es mensual.
                setValue('is_recurring', kind === 'tuition' || kind === 'transport')
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {FEE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monto habitual" hint="Se puede cambiar al cobrar" error={errors.default_amount?.message}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" {...register('default_amount')} />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" {...register('is_recurring')} />
          <span>
            <span className="font-medium text-slate-800">Se cobra cada mes</span>
            <span className="block text-xs text-slate-500">
              Cada cargo indica el mes que cubre y nunca se duplica para el mismo estudiante.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" {...register('active')} />
          <span>
            <span className="font-medium text-slate-800">Activo</span>
            <span className="block text-xs text-slate-500">Un concepto inactivo deja de ofrecerse al crear cargos.</span>
          </span>
        </label>
      </form>
    </Modal>
  )
}
