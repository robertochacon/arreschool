import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/toast'
import { useCreateGuardian, useUpdateGuardian, type GuardianInput } from '@/hooks/students'
import { errorMessage } from '@/lib/errors'
import type { Guardian } from '@/types/db'

const schema = z.object({
  first_name: z.string().trim().min(1, 'Escribe el nombre'),
  last_name: z.string().trim().min(1, 'Escribe el apellido'),
  document_id: z.string().trim(),
  phone: z.string().trim(),
  phone_alt: z.string().trim(),
  // Vacío o un correo: el `or(literal(''))` evita exigir correo a quien no tiene.
  email: z.string().trim().email('Correo no válido').or(z.literal('')),
  occupation: z.string().trim(),
  workplace: z.string().trim(),
  address: z.string().trim(),
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
})

type FormValues = z.infer<typeof schema>

const BLANK: FormValues = {
  first_name: '',
  last_name: '',
  document_id: '',
  phone: '',
  phone_alt: '',
  email: '',
  occupation: '',
  workplace: '',
  address: '',
  notes: '',
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

/**
 * Alta y edición de un padre, madre o tutor. Lo usan la pantalla de Familias y
 * la ficha del estudiante (al vincular a alguien nuevo), por eso devuelve la
 * ficha creada en `onSaved`.
 */
export function GuardianFormModal({
  open,
  onClose,
  guardian,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** `null` = alta. */
  guardian: Guardian | null
  onSaved?: (guardian: Guardian) => void
}) {
  const toast = useToast()
  const create = useCreateGuardian()
  const update = useUpdateGuardian()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: BLANK })

  useEffect(() => {
    if (!open) return
    reset(
      guardian
        ? {
            first_name: guardian.first_name,
            last_name: guardian.last_name,
            document_id: guardian.document_id ?? '',
            phone: guardian.phone ?? '',
            phone_alt: guardian.phone_alt ?? '',
            email: guardian.email ?? '',
            occupation: guardian.occupation ?? '',
            workplace: guardian.workplace ?? '',
            address: guardian.address ?? '',
            notes: guardian.notes ?? '',
          }
        : BLANK,
    )
  }, [open, guardian, reset])

  const submit = handleSubmit(async (v) => {
    const input: GuardianInput = {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      document_id: orNull(v.document_id),
      phone: orNull(v.phone),
      phone_alt: orNull(v.phone_alt),
      email: orNull(v.email),
      occupation: orNull(v.occupation),
      workplace: orNull(v.workplace),
      address: orNull(v.address),
      notes: orNull(v.notes),
    }
    try {
      if (guardian) {
        await update.mutateAsync({ id: guardian.id, ...input })
        toast.success('Datos del familiar guardados')
        onClose()
        onSaved?.({ ...guardian, ...input })
      } else {
        const created = await create.mutateAsync(input)
        toast.success(`${created.first_name} ${created.last_name} registrado`)
        onClose()
        onSaved?.(created)
      }
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el familiar'))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={guardian ? 'Editar familiar' : 'Nuevo familiar'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="guardian-form" type="submit" loading={isSubmitting}>
            {guardian ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="guardian-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombres" required error={errors.first_name?.message}>
            <Input autoComplete="off" {...register('first_name')} />
          </Field>
          <Field label="Apellidos" required error={errors.last_name?.message}>
            <Input autoComplete="off" {...register('last_name')} />
          </Field>
          <Field label="Teléfono" hint="Con WhatsApp, si tiene">
            <Input type="tel" inputMode="tel" {...register('phone')} />
          </Field>
          <Field label="Otro teléfono" hint="Opcional">
            <Input type="tel" inputMode="tel" {...register('phone_alt')} />
          </Field>
          <Field label="Correo" hint="Opcional" error={errors.email?.message}>
            <Input type="email" inputMode="email" autoComplete="off" {...register('email')} />
          </Field>
          <Field label="Cédula / documento" hint="Opcional">
            <Input {...register('document_id')} />
          </Field>
          <Field label="Ocupación" hint="Opcional">
            <Input {...register('occupation')} />
          </Field>
          <Field label="Lugar de trabajo" hint="Opcional">
            <Input {...register('workplace')} />
          </Field>
        </div>
        <Field label="Dirección" hint="Opcional">
          <Input {...register('address')} />
        </Field>
        <Field label="Notas" hint="Opcional" error={errors.notes?.message}>
          <Textarea rows={2} {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
