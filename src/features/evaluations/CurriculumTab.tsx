import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpen, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useGradeLevels } from '@/hooks/academic'
import {
  useCompetencies,
  useDeleteCompetency,
  useDeleteIndicator,
  useSaveCompetency,
  useSaveIndicator,
  type CompetencyRow,
} from '@/hooks/evaluations'
import { usePermissions } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { ACHIEVEMENT_LABEL, ACHIEVEMENT_SHORT } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { LEVEL_BADGE, LEVEL_ORDER } from './scope'
import type { Indicator } from '@/types/db'

/** '' en el filtro = todos; 'all' en el formulario = competencia transversal (grade_level_id null). */
const ALL_GRADES = 'all'

/**
 * Currículo del colegio: competencias por grado y sus indicadores de logro.
 *
 * Es configuración de Dirección (la base solo deja escribir a owner/admin);
 * el resto del equipo la consulta aquí para saber qué se evalúa. Una
 * competencia ya evaluada no se puede borrar (FK restrict): se desactiva, y
 * así los boletines viejos siguen teniendo de dónde salir.
 */
export function CurriculumTab() {
  const { can } = usePermissions()
  const canEdit = can('manageAcademics')
  const toast = useToast()
  const competencies = useCompetencies()
  const grades = useGradeLevels()
  const removeCompetency = useDeleteCompetency()
  const removeIndicator = useDeleteIndicator()
  const saveIndicator = useSaveIndicator()
  const saveCompetency = useSaveCompetency()

  const [gradeFilter, setGradeFilter] = useState('')
  const [editing, setEditing] = useState<CompetencyRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [indicatorFor, setIndicatorFor] = useState<{ competency: CompetencyRow; indicator: Indicator | null } | null>(
    null,
  )

  const gradeName = useMemo(() => new Map((grades.data ?? []).map((g) => [g.id, g.name])), [grades.data])

  const list = useMemo(() => {
    const all = competencies.data ?? []
    if (!gradeFilter) return all
    // Al filtrar por un grado se incluyen las transversales: también se evalúan en él.
    return all.filter((c) => c.grade_level_id === null || c.grade_level_id === gradeFilter)
  }, [competencies.data, gradeFilter])

  const areas = useMemo(() => {
    const map = new Map<string, CompetencyRow[]>()
    for (const c of list) map.set(c.area, [...(map.get(c.area) ?? []), c])
    return [...map.entries()]
  }, [list])

  const destroyCompetency = async (c: CompetencyRow) => {
    if (!window.confirm(`¿Eliminar "${c.name}" con sus indicadores? Si ya se evaluó, desactívala en su lugar.`)) return
    try {
      await removeCompetency.mutateAsync(c.id)
      toast.success('Competencia eliminada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const toggleCompetency = async (c: CompetencyRow) => {
    try {
      await saveCompetency.mutateAsync({
        id: c.id,
        grade_level_id: c.grade_level_id,
        area: c.area,
        name: c.name,
        description: c.description,
        sort_order: c.sort_order,
        active: !c.active,
      })
      toast.success(c.active ? 'Competencia desactivada' : 'Competencia activada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar'))
    }
  }

  const destroyIndicator = async (i: Indicator) => {
    if (!window.confirm('¿Eliminar este indicador? Si ya se evaluó, desactívalo en su lugar.')) return
    try {
      await removeIndicator.mutateAsync(i.id)
      toast.success('Indicador eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const toggleIndicator = async (i: Indicator) => {
    try {
      await saveIndicator.mutateAsync({ id: i.id, active: !i.active })
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar'))
    }
  }

  if (competencies.isLoading || grades.isLoading) return <PageLoader label="Cargando competencias…" />
  if (competencies.isError) {
    return (
      <Card className="p-8 text-center text-sm text-red-600">
        {errorMessage(competencies.error, 'No se pudieron cargar las competencias.')}
      </Card>
    )
  }

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Grado" className="sm:w-64">
          <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="">Todos los grados</option>
            {(grades.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Nueva competencia
          </Button>
        )}
      </div>

      {(competencies.data ?? []).length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="Todavía no hay competencias"
          description={
            'En inicial cada competencia se evalúa con indicadores de logro y una escala cualitativa: ' +
            LEVEL_ORDER.map((l) => `${ACHIEVEMENT_SHORT[l]} = ${ACHIEVEMENT_LABEL[l]}`).join(', ') +
            '. Crea las del currículo de cada grado para empezar a evaluar.'
          }
          action={
            canEdit ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Crear la primera
              </Button>
            ) : undefined
          }
        />
      ) : list.length === 0 ? (
        <EmptyState title="Este grado no tiene competencias" description="Prueba con otro grado o crea una nueva." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Escala:
            {LEVEL_ORDER.map((l) => (
              <Badge key={l} tone={LEVEL_BADGE[l]}>
                {ACHIEVEMENT_SHORT[l]} · {ACHIEVEMENT_LABEL[l]}
              </Badge>
            ))}
          </div>
          {areas.map(([area, items]) => (
            <section key={area}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">{area}</h3>
              <div className="space-y-3">
                {items.map((c) => (
                  <Card key={c.id} className={c.active ? undefined : 'opacity-70'}>
                    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone="slate">
                            {c.grade_level_id ? gradeName.get(c.grade_level_id) ?? 'Grado' : 'Todos los grados'}
                          </Badge>
                          {!c.active && (
                            <Badge tone="amber">
                              <EyeOff className="h-3.5 w-3.5" /> Inactiva
                            </Badge>
                          )}
                        </div>
                        {c.description && <p className="mt-1 text-sm text-slate-500">{c.description}</p>}
                      </div>
                      {canEdit && (
                        <ActionMenu
                          title={c.name}
                          label={`Opciones de ${c.name}`}
                          items={[
                            {
                              label: 'Añadir indicador',
                              icon: <Plus className="h-4 w-4" />,
                              onClick: () => setIndicatorFor({ competency: c, indicator: null }),
                            },
                            {
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => {
                                setEditing(c)
                                setFormOpen(true)
                              },
                            },
                            {
                              label: c.active ? 'Desactivar' : 'Activar',
                              icon: <EyeOff className="h-4 w-4" />,
                              onClick: () => void toggleCompetency(c),
                              hint: c.active ? 'Deja de evaluarse; lo ya evaluado se conserva' : undefined,
                            },
                            {
                              label: 'Eliminar',
                              icon: <Trash2 className="h-4 w-4" />,
                              tone: 'danger',
                              onClick: () => void destroyCompetency(c),
                              hint: 'Solo si nunca se evaluó',
                            },
                          ]}
                        />
                      )}
                    </div>
                    {c.indicators.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-500">Sin indicadores todavía.</p>
                    ) : (
                      <ol className="divide-y divide-slate-50">
                        {c.indicators.map((ind, n) => (
                          <li key={ind.id} className="flex items-start gap-3 px-4 py-2.5">
                            <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">
                              {n + 1}.
                            </span>
                            <p className={cn('flex-1 text-sm', ind.active ? 'text-slate-700' : 'text-slate-400 line-through')}>
                              {ind.description}
                            </p>
                            {canEdit && (
                              <ActionMenu
                                className="-my-1.5"
                                title={ind.description}
                                label="Opciones del indicador"
                                items={[
                                  {
                                    label: 'Editar',
                                    icon: <Pencil className="h-4 w-4" />,
                                    onClick: () => setIndicatorFor({ competency: c, indicator: ind }),
                                  },
                                  {
                                    label: ind.active ? 'Desactivar' : 'Activar',
                                    icon: <EyeOff className="h-4 w-4" />,
                                    onClick: () => void toggleIndicator(ind),
                                  },
                                  {
                                    label: 'Eliminar',
                                    icon: <Trash2 className="h-4 w-4" />,
                                    tone: 'danger',
                                    onClick: () => void destroyIndicator(ind),
                                    hint: 'Solo si nunca se evaluó',
                                  },
                                ]}
                              />
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <CompetencyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        competency={editing}
        defaultGrade={gradeFilter}
        nextOrder={(competencies.data?.length ?? 0) + 1}
      />
      <IndicatorFormModal target={indicatorFor} onClose={() => setIndicatorFor(null)} />
    </>
  )
}

// ── Formulario de competencia ───────────────────────────────────────────────

const schema = z.object({
  grade_level_id: z.string(),
  area: z.string().trim().min(2, 'Escribe el área (ej. Comunicación)'),
  name: z.string().trim().min(2, 'Escribe la competencia'),
  description: z.string().trim().max(500, 'Máximo 500 caracteres'),
  sort_order: z
    .string()
    .trim()
    .refine((v) => Number.isInteger(Number(v)), 'Escribe un número entero'),
  active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function CompetencyFormModal({
  open,
  onClose,
  competency,
  defaultGrade,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  competency: CompetencyRow | null
  defaultGrade: string
  nextOrder: number
}) {
  const toast = useToast()
  const grades = useGradeLevels()
  const save = useSaveCompetency()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Se rellena al ABRIR: el diálogo vive siempre montado y conservaría lo anterior.
  useEffect(() => {
    if (!open) return
    reset(
      competency
        ? {
            grade_level_id: competency.grade_level_id ?? ALL_GRADES,
            area: competency.area,
            name: competency.name,
            description: competency.description ?? '',
            sort_order: String(competency.sort_order),
            active: competency.active,
          }
        : {
            grade_level_id: defaultGrade || ALL_GRADES,
            area: '',
            name: '',
            description: '',
            sort_order: String(nextOrder),
            active: true,
          },
    )
  }, [open, competency, defaultGrade, nextOrder, reset])

  const submit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: competency?.id,
        grade_level_id: v.grade_level_id === ALL_GRADES ? null : v.grade_level_id,
        area: v.area,
        name: v.name,
        description: v.description || null,
        sort_order: Number(v.sort_order),
        active: v.active,
      })
      toast.success(competency ? 'Competencia actualizada' : 'Competencia creada')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar la competencia'))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={competency ? 'Editar competencia' : 'Nueva competencia'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="competency-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="competency-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Grado" hint="«Todos los grados» para competencias transversales.">
          <Select {...register('grade_level_id')}>
            <option value={ALL_GRADES}>Todos los grados</option>
            {(grades.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Área" required error={errors.area?.message}>
          <Input placeholder="Ej. Comunicación" {...register('area')} />
        </Field>
        <Field label="Competencia" required error={errors.name?.message}>
          <Input placeholder="Ej. Expresión oral" {...register('name')} />
        </Field>
        <Field label="Descripción" hint="Opcional" error={errors.description?.message}>
          <Textarea rows={2} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Orden" error={errors.sort_order?.message}>
            <Input inputMode="numeric" {...register('sort_order')} />
          </Field>
          <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('active')} />
            Activa
          </label>
        </div>
      </form>
    </Modal>
  )
}

// ── Formulario de indicador ─────────────────────────────────────────────────

function IndicatorFormModal({
  target,
  onClose,
}: {
  target: { competency: CompetencyRow; indicator: Indicator | null } | null
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveIndicator()
  const [description, setDescription] = useState('')
  const [order, setOrder] = useState('1')

  useEffect(() => {
    if (!target) return
    setDescription(target.indicator?.description ?? '')
    setOrder(String(target.indicator?.sort_order ?? target.competency.indicators.length + 1))
  }, [target])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!target) return
    if (description.trim().length < 3) {
      toast.error('Escribe el indicador')
      return
    }
    try {
      await save.mutateAsync({
        id: target.indicator?.id,
        competency_id: target.competency.id,
        description: description.trim(),
        sort_order: Number.isInteger(Number(order)) ? Number(order) : 1,
        active: target.indicator?.active ?? true,
      })
      toast.success(target.indicator ? 'Indicador actualizado' : 'Indicador añadido')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el indicador'))
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target?.indicator ? 'Editar indicador' : `Nuevo indicador · ${target?.competency.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="indicator-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="indicator-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field label="Indicador de logro" required>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Se expresa con claridad al contar una experiencia"
          />
        </Field>
        <Field label="Orden">
          <Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className="w-28" />
        </Field>
      </form>
    </Modal>
  )
}
