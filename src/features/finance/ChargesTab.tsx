import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, FilePlus2, HandCoins, Layers, Pencil, Search, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useCharges, useDeleteCharge, useVoidCharge, type ChargeFilters, type ChargeRow } from '@/hooks/finance'
import { usePermissions } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { CHARGE_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, money } from '@/lib/format'
import { ChargeFormModal } from './ChargeFormModal'
import { GenerateChargesModal } from './GenerateChargesModal'
import { PaymentModal } from './PaymentModal'
import { CHARGE_STATUS_TONE, IconBtn, LoadError, VoidReasonModal, monthToBilling, studentName } from './financeUi'

const PAGE_SIZE = 15

const STATUS_OPTIONS: { value: ChargeFilters['status']; label: string }[] = [
  { value: 'open', label: 'Pendientes y abonados' },
  { value: 'pending', label: CHARGE_STATUS_LABEL.pending },
  { value: 'partial', label: CHARGE_STATUS_LABEL.partial },
  { value: 'paid', label: CHARGE_STATUS_LABEL.paid },
  { value: 'void', label: CHARGE_STATUS_LABEL.void },
  { value: 'all', label: 'Todos' },
]

/**
 * Cargos: lo que se cobra. El filtro de estado y de mes va al SERVIDOR (el
 * volumen crece cada mes); la búsqueda por nombre, en el cliente sobre lo ya
 * traído, para que responda al teclear.
 */
export function ChargesTab() {
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const { can } = usePermissions()
  const navigate = useNavigate()
  const toast = useToast()

  const [status, setStatus] = useState<ChargeFilters['status']>('open')
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<ChargeRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [voiding, setVoiding] = useState<ChargeRow | null>(null)
  const [paying, setPaying] = useState<string | null>(null)

  const filters = useMemo<ChargeFilters>(() => ({ status, billingMonth: monthToBilling(month) }), [status, month])
  const { data, isLoading, isError, error, refetch, isFetching } = useCharges(filters)
  const voidCharge = useVoidCharge()
  const remove = useDeleteCharge()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (c) =>
        !q ||
        c.description.toLowerCase().includes(q) ||
        `${c.student?.first_name ?? ''} ${c.student?.last_name ?? ''}`.toLowerCase().includes(q) ||
        (c.student?.code ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  useEffect(() => setPage(0), [search, status, month])
  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)

  const total = filtered.reduce((s, c) => s + (c.status === 'void' ? 0 : c.amount - c.amount_paid), 0)

  const destroy = async (c: ChargeRow) => {
    if (!window.confirm(`¿Eliminar el cargo "${c.description}"? Solo se puede si no tiene pagos.`)) return
    try {
      await remove.mutateAsync(c.id)
      toast.success('Cargo eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const doVoid = async (reason: string) => {
    if (!voiding) return
    try {
      await voidCharge.mutateAsync({ id: voiding.id, reason })
      toast.success('Cargo anulado')
      setVoiding(null)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo anular'))
    }
  }

  /**
   * Acciones de una fila. Un cargo anulado ya no admite nada; uno con pagos no
   * se borra ni se anula (la base lo impediría): se deshabilita con la razón
   * escrita en vez de dejar que falle.
   */
  const actionsFor = (c: ChargeRow): ActionItem[] => {
    if (c.status === 'void') return []
    const hasPayments = c.amount_paid > 0
    const items: ActionItem[] = []
    if (c.status !== 'paid') {
      items.push({
        label: 'Cobrar',
        icon: <HandCoins className="h-4 w-4" />,
        tone: 'success',
        onClick: () => setPaying(c.student_id),
      })
    }
    items.push({
      label: 'Corregir',
      icon: <Pencil className="h-4 w-4" />,
      onClick: () => {
        setEditing(c)
        setFormOpen(true)
      },
    })
    if (can('manageFinance')) {
      items.push({
        label: 'Anular',
        icon: <Ban className="h-4 w-4" />,
        tone: 'danger',
        disabled: hasPayments,
        hint: hasPayments ? 'Tiene pagos: anula primero el pago' : 'Queda registrado con su motivo',
        onClick: () => setVoiding(c),
      })
    }
    items.push({
      label: 'Eliminar',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger',
      disabled: hasPayments,
      hint: hasPayments ? 'Tiene pagos aplicados' : 'Solo para cargos creados por error',
      onClick: () => void destroy(c),
    })
    return items
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <FilePlus2 className="h-4 w-4" /> Nuevo cargo
        </Button>
        {can('manageFinance') && (
          <Button variant="outline" onClick={() => setGenerating(true)}>
            <Layers className="h-4 w-4" /> Generar a un grupo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ChargeFilters['status'])}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mes que cubre" hint="Vacío = todos">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Buscar">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Estudiante o descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Field>
      </div>

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando cargos…" />
        ) : isError ? (
          <LoadError error={error} onRetry={() => refetch()} retrying={isFetching} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No hay cargos con este filtro"
            description="Crea un cargo suelto o genera la mensualidad para un grupo."
            className="m-4"
          />
        ) : (
          <>
            <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500">
              {filtered.length} cargos · falta por cobrar <strong className="text-slate-800">{money(total, currency)}</strong>
            </p>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium">Descripción</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                    <th className="px-4 py-3 text-right font-medium">Falta</th>
                    <th className="px-4 py-3 font-medium">Vence</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slice.map((c) => {
                    const isVoid = c.status === 'void'
                    const hasPayments = c.amount_paid > 0
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/estudiantes/${c.student_id}`)}
                            className="font-medium text-slate-800 hover:text-brand-600"
                          >
                            {studentName(c.student)}
                          </button>
                        </td>
                        <td className="max-w-xs px-4 py-3">
                          <p className={isVoid ? 'truncate text-slate-400 line-through' : 'truncate text-slate-700'}>
                            {c.description}
                          </p>
                          {isVoid && c.void_reason && <p className="truncate text-xs text-slate-400">{c.void_reason}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={CHARGE_STATUS_TONE[c.status]}>{CHARGE_STATUS_LABEL[c.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(c.amount, currency)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {isVoid ? '—' : money(c.amount - c.amount_paid, currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDateShort(c.due_date)}</td>
                        <td className="px-4 py-3">
                          {!isVoid && (
                            <div className="flex items-center justify-end gap-1">
                              {c.status !== 'paid' && (
                                <IconBtn title="Cobrar" tone="green" onClick={() => setPaying(c.student_id)}>
                                  <HandCoins className="h-4 w-4" />
                                </IconBtn>
                              )}
                              <IconBtn
                                title="Corregir"
                                onClick={() => {
                                  setEditing(c)
                                  setFormOpen(true)
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </IconBtn>
                              {can('manageFinance') && (
                                <IconBtn
                                  title={hasPayments ? 'Tiene pagos: anula primero el pago' : 'Anular'}
                                  tone="red"
                                  disabled={hasPayments}
                                  onClick={() => setVoiding(c)}
                                >
                                  <Ban className="h-4 w-4" />
                                </IconBtn>
                              )}
                              <IconBtn
                                title={hasPayments ? 'Tiene pagos aplicados' : 'Eliminar'}
                                tone="red"
                                disabled={hasPayments}
                                onClick={() => void destroy(c)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </IconBtn>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <DataList>
              {slice.map((c) => {
                const actions = actionsFor(c)
                return (
                  <DataRow
                    key={c.id}
                    title={studentName(c.student)}
                    subtitle={c.description}
                    tone={c.status === 'void' ? 'muted' : undefined}
                    onClick={() => navigate(`/estudiantes/${c.student_id}`)}
                    badges={<Badge tone={CHARGE_STATUS_TONE[c.status]}>{CHARGE_STATUS_LABEL[c.status]}</Badge>}
                    actions={
                      actions.length > 0 ? (
                        <ActionMenu title={c.description} label={`Opciones de ${c.description}`} items={actions} />
                      ) : undefined
                    }
                  >
                    <DataFields>
                      <DataField label="Falta">
                        {c.status === 'void' ? '—' : money(c.amount - c.amount_paid, currency)}
                      </DataField>
                      <DataField label="Vence">{fmtDateShort(c.due_date)}</DataField>
                    </DataFields>
                  </DataRow>
                )
              })}
            </DataList>

            <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="cargos" />
          </>
        )}
      </Card>

      <ChargeFormModal open={formOpen} onClose={() => setFormOpen(false)} charge={editing} />
      <GenerateChargesModal open={generating} onClose={() => setGenerating(false)} />
      <PaymentModal open={paying !== null} onClose={() => setPaying(null)} studentId={paying ?? undefined} />
      <VoidReasonModal
        open={voiding !== null}
        title="Anular cargo"
        description={
          voiding
            ? `"${voiding.description}" de ${studentName(voiding.student)} por ${money(voiding.amount, currency)} dejará de contar como deuda.`
            : ''
        }
        loading={voidCharge.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(r) => void doVoid(r)}
      />
    </div>
  )
}
