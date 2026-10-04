import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useGradeLevels, sectionLabel, type SectionRow } from '@/hooks/academic'
import { useSaveAnnouncement, type AnnouncementRow } from '@/hooks/announcements'
import { AUDIENCE_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import type { AnnouncementAudience } from '@/types/db'

const schema = z
  .object({
    title: z.string().trim().min(3, 'Escribe un título'),
    body: z.string().trim().min(3, 'Escribe el mensaje').max(5000, 'Máximo 5000 caracteres'),
    audience: z.enum(['all', 'grade_level', 'section']),
    grade_level_id: z.string(),
    section_id: z.string(),
    pinned: z.boolean(),
    /** Vacío = no vence. */
    expires_on: z.string(),
  })
  // Mismo check que la base (announcements_audience): validarlo aquí da el
  // mensaje junto al campo en vez de un error de restricción al guardar.
  .refine((v) => v.audience !== 'grade_level' || v.grade_level_id, {
    path: ['grade_level_id'],
    message: 'Elige el grado',
  })
  .refine((v) => v.audience !== 'section' || v.section_id, {
    path: ['section_id'],
    message: 'Elige la sección',
  })

type FormValues = z.infer<typeof schema>

/**
 * Alta y edición de un comunicado.
 *
 * `audiences` y `sections` llegan ya recortados al rol: una docente solo ve la
 * opción "Una sección" y solo sus secciones. La base lo vuelve a exigir en la
 * política; esto evita ofrecerle algo que fallaría al guardar.
 */
export function AnnouncementFormModal({
  open,
  onClose,
  announcement,
  audiences,
  sections,
}: {
  open: boolean
  onClose: () => void
  /** `null` = nuevo. */
  announcement: AnnouncementRow | null
  audiences: AnnouncementAudience[]
  sections: SectionRow[]
}) {
  const toast = useToast()
  const grades = useGradeLevels()
  const save = useSaveAnnouncement()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Se rellena al ABRIR: el diálogo vive montado y conservaría el anterior.
  useEffect(() => {
    if (!open) return
    reset(
      announcement
        ? {
            title: announcement.title,
            body: announcement.body,
            audience: announcement.audience,
            grade_level_id: announcement.grade_level_id ?? '',
            section_id: announcement.section_id ?? '',
            pinned: announcement.pinned,
            expires_on: announcement.expires_on ?? '',
          }
        : {
            title: '',
            body: '',
            audience: audiences[0] ?? 'all',
            grade_level_id: '',
            section_id: audiences.includes('all') ? '' : (sections[0]?.id ?? ''),
            pinned: false,
            expires_on: '',
          },
    )
  }, [open, announcement, audiences, sections, reset])

  const audience = watch('audience')

  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: announcement?.id,
        title: v.title,
        body: v.body,
        audience: v.audience,
        // Solo la columna que corresponde a la audiencia; la otra en null, o
        // el check de la base rechazaría la fila.
        grade_level_id: v.audience === 'grade_level' ? v.grade_level_id : null,
        section_id: v.audience === 'section' ? v.section_id : null,
        pinned: v.pinned,
        expires_on: v.expires_on || null,
      })
      toast.success(announcement ? 'Comunicado actualizado' : 'Comunicado publicado')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el comunicado'))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={announcement ? 'Editar comunicado' : 'Nuevo comunicado'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="announcement-form" type="submit" loading={isSubmitting}>
            {announcement ? 'Guardar cambios' : 'Publicar'}
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Título" required error={errors.title?.message}>
          <Input placeholder="Ej. Reunión de padres el viernes" {...register('title')} />
        </Field>
        <Field label="Mensaje" required error={errors.body?.message}>
          <Textarea rows={6} {...register('body')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Para">
            <Select {...register('audience')}>
              {audiences.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                </option>
              ))}
            </Select>
          </Field>
          {audience === 'grade_level' && (
            <Field label="Grado" required error={errors.grade_level_id?.message}>
              <Select {...register('grade_level_id')}>
                <option value="">Elige…</option>
                {(grades.data ?? [])
                  .filter((g) => g.active)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {audience === 'section' && (
            <Field label="Sección" required error={errors.section_id?.message}>
              <Select {...register('section_id')}>
                <option value="">Elige…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vence" hint="Opcional: después se muestra como vencido">
            <Input type="date" {...register('expires_on')} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-7">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('pinned')} />
            Fijar arriba
          </label>
        </div>
      </form>
    </Modal>
  )
}
