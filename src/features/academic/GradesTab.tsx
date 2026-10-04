import { useEffect, useState, type FormEvent } from 'react'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useDeleteGradeLevel, useGradeLevels, useSaveGradeLevel } from '@/hooks/academic'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { EDUCATION_LEVEL_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import type { EducationLevel, GradeLevel } from '@/types/db'
import { Notice } from './shared'

/**
 * Grados del colegio. No dependen del año: "Kinder" es el mismo grado todos los
 * años, y su `sort_order` es lo que usa el cierre de año para saber a qué grado
 * pasa un estudiante promovido. Por eso el orden se explica en pantalla.
 */
export function GradesTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const { data, isLoading, isError, error, refetch } = useGradeLevels()
  const save = useSaveGradeLevel()
  const remove = useDeleteGradeLevel()
  const [form, setForm] = useState<{ open: boolean; grade: GradeLevel | null }>({ open: false, grade: null })

  const grades = data ?? []

  const toggleActive = async (g: GradeLevel) => {
    try {
      await save.mutateAsync({
        id: g.id,
        name: g.name,
        education_level: g.education_level,
        sort_order: g.sort_order,
        active: !g.active,
      })
      toast.success(g.active ? `${g.name} desactivado` : `${g.name} activado`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el grado'))
    }
  }

  const destroy = async (g: GradeLevel) => {
    if (!window.confirm(`¿Eliminar el grado "${g.name}"? Solo se puede si nunca se usó.`)) return
    try {
      await remove.mutateAsync(g.id)
      toast.success('Grado eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar el grado'))
    }
  }

  const actionsFor = (g: GradeLevel) => [
    { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setForm({ open: true, grade: g }) },
    {
      label: g.active ? 'Desactivar' : 'Activar',
      icon: <Layers className="h-4 w-4" />,
      onClick: () => void toggleActive(g),
      hint: g.active ? 'Deja de ofrecerse y no recibe promovidos' : undefined,
    },
    {
      label: 'Eliminar',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger' as const,
      onClick: () => void destroy(g),
      hint: 'Solo si nunca se usó',
    },
  ]

  if (isLoading) return <PageLoader label="Cargando grados…" />
  if (isError) {
    return (
      <Card className="space-y-3 p-8 text-center">
        <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los grados.')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Notice className="sm:max-w-xl">
          El <strong>orden</strong> define la promoción: al cerrar el año, quien aprueba pasa al grado con el
          siguiente número de orden.
        </Notice>
        {canEdit && (
          <Button onClick={() => setForm({ open: true, grade: null })}>
            <Plus className="h-4 w-4" /> Nuevo grado
          </Button>
        )}
      </div>

      <Card>
        {grades.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Layers className="h-6 w-6" />}
            title="Todavía no hay grados"
            description="Crea los grados que ofrece el colegio, por ejemplo Maternal, Pre-Kinder, Kinder y Preprimario."
            action={
              canEdit ? (
                <Button onClick={() => setForm({ open: true, grade: null })}>
                  <Plus className="h-4 w-4" /> Crear el primero
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Orden</th>
                    <th className="px-4 py-3 font-medium">Grado</th>
                    <th className="px-4 py-3 font-medium">Nivel</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {grades.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 tabular-nums text-slate-500">{g.sort_order}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{g.name}</td>
                      <td className="px-4 py-3 text-slate-600">{EDUCATION_LEVEL_LABEL[g.education_level]}</td>
                      <td className="px-4 py-3">
                        <Badge tone={g.active ? 'green' : 'slate'}>{g.active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <ActionMenu title={g.name} label={`Opciones de ${g.name}`} items={actionsFor(g)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataList>
              {grades.map((g) => (
                <DataRow
                  key={g.id}
                  title={g.name}
                  tone={g.active ? undefined : 'muted'}
                  badges={
                    <>
                      <Badge tone="brand">{EDUCATION_LEVEL_LABEL[g.education_level]}</Badge>
                      {!g.active && <Badge tone="slate">Inactivo</Badge>}
                    </>
                  }
                  actions={
                    canEdit ? (
                      <ActionMenu title={g.name} label={`Opciones de ${g.name}`} items={actionsFor(g)} />
                    ) : undefined
                  }
                >
                  <DataFields>
                    <DataField label="Orden">{g.sort_order}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>
          </>
        )}
      </Card>

      <GradeFormModal
        open={form.open}
        grade={form.grade}
        nextOrder={(grades[grades.length - 1]?.sort_order ?? 0) + 1}
        onClose={() => setForm({ open: false, grade: null })}
      />
    </div>
  )
}

function GradeFormModal({
  open,
  grade,
  nextOrder,
  onClose,
}: {
  open: boolean
  grade: GradeLevel | null
  nextOrder: number
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveGradeLevel()
  const [name, setName] = useState('')
  const [level, setLevel] = useState<EducationLevel>('initial')
  const [order, setOrder] = useState('1')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(grade?.name ?? '')
    setLevel(grade?.education_level ?? 'initial')
    setOrder(String(grade?.sort_order ?? nextOrder))
  }, [open, grade, nextOrder])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Escribe el nombre del grado')
    const n = Number(order)
    if (!Number.isInteger(n) || n < 0) return setError('El orden es un número entero')
    try {
      await save.mutateAsync({
        id: grade?.id,
        name: name.trim(),
        education_level: level,
        sort_order: n,
        active: grade?.active ?? true,
      })
      toast.success(grade ? 'Grado actualizado' : 'Grado creado')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el grado'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={grade ? 'Editar grado' : 'Nuevo grado'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="grade-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="grade-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nombre" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pre-Kinder" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nivel educativo">
            <Select value={level} onChange={(e) => setLevel(e.target.value as EducationLevel)}>
              {(Object.keys(EDUCATION_LEVEL_LABEL) as EducationLevel[]).map((l) => (
                <option key={l} value={l}>
                  {EDUCATION_LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Orden" hint="1 = el primer grado">
            <Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
