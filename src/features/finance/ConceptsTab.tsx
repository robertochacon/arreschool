import { useState } from 'react'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDeleteFeeConcept, useFeeConcepts } from '@/hooks/finance'
import { usePermissions } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { FEE_KIND_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { money } from '@/lib/format'
import type { FeeConcept } from '@/types/db'
import { ConceptFormModal } from './ConceptFormModal'
import { IconBtn, LoadError } from './financeUi'

/**
 * Conceptos de cobro: el catálogo del que salen los cargos. Un concepto ya
 * usado no se puede borrar (la base lo frena): se desactiva, y así los cargos
 * viejos conservan su nombre.
 */
export function ConceptsTab() {
  const { tenant } = useAuth()
  const { can } = usePermissions()
  const toast = useToast()
  const { data, isLoading, isError, error, refetch, isFetching } = useFeeConcepts()
  const remove = useDeleteFeeConcept()
  const [editing, setEditing] = useState<FeeConcept | null>(null)
  const [open, setOpen] = useState(false)
  const manage = can('manageFinance')

  const edit = (c: FeeConcept | null) => {
    setEditing(c)
    setOpen(true)
  }

  const destroy = async (c: FeeConcept) => {
    if (!window.confirm(`¿Eliminar el concepto "${c.name}"?`)) return
    try {
      await remove.mutateAsync(c.id)
      toast.success('Concepto eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  return (
    <div className="space-y-4">
      {manage && (
        <Button onClick={() => edit(null)}>
          <Plus className="h-4 w-4" /> Nuevo concepto
        </Button>
      )}

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando conceptos…" />
        ) : isError ? (
          <LoadError error={error} onRetry={() => refetch()} retrying={isFetching} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-6 w-6" />}
            title="Todavía no hay conceptos"
            description="Empieza por Inscripción y Mensualidad: con ellos se generan los cargos de todo el año."
            action={
              manage ? (
                <Button onClick={() => edit(null)}>
                  <Plus className="h-4 w-4" /> Crear el primero
                </Button>
              ) : undefined
            }
            className="m-4"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 text-right font-medium">Monto habitual</th>
                    <th className="px-4 py-3 font-medium">Frecuencia</th>
                    {manage && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((c) => (
                    <tr key={c.id} className={c.active ? 'hover:bg-slate-50/60' : 'text-slate-400'}>
                      <td className="px-4 py-3 font-medium">
                        {c.name} {!c.active && <Badge tone="slate">Inactivo</Badge>}
                      </td>
                      <td className="px-4 py-3">{FEE_KIND_LABEL[c.kind]}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.default_amount > 0 ? money(c.default_amount, tenant?.currency) : 'Variable'}
                      </td>
                      <td className="px-4 py-3">{c.is_recurring ? 'Mensual' : 'Una vez'}</td>
                      {manage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Editar" onClick={() => edit(c)}>
                              <Pencil className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn title="Eliminar" tone="red" onClick={() => void destroy(c)}>
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DataList>
              {data.map((c) => (
                <DataRow
                  key={c.id}
                  title={c.name}
                  tone={c.active ? undefined : 'muted'}
                  onClick={manage ? () => edit(c) : undefined}
                  badges={
                    <>
                      <Badge tone="brand">{FEE_KIND_LABEL[c.kind]}</Badge>
                      {!c.active && <Badge tone="slate">Inactivo</Badge>}
                    </>
                  }
                  actions={
                    manage ? (
                      <ActionMenu
                        title={c.name}
                        items={[
                          { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => edit(c) },
                          {
                            label: 'Eliminar',
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: 'danger',
                            hint: 'Si ya tiene cargos, desactívalo en su lugar',
                            onClick: () => void destroy(c),
                          },
                        ]}
                      />
                    ) : undefined
                  }
                >
                  <DataFields>
                    <DataField label="Monto">
                      {c.default_amount > 0 ? money(c.default_amount, tenant?.currency) : 'Variable'}
                    </DataField>
                    <DataField label="Frecuencia">{c.is_recurring ? 'Mensual' : 'Una vez'}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>
          </>
        )}
      </Card>

      <ConceptFormModal open={open} onClose={() => setOpen(false)} concept={editing} />
    </div>
  )
}
