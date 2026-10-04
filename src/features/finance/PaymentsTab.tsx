import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, HandCoins, Receipt, Search } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePayments, useVoidPayment, type PaymentRow } from '@/hooks/finance'
import { usePermissions } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { PAYMENT_METHOD_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, money, num } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PaymentModal } from './PaymentModal'
import { IconBtn, LoadError, VoidReasonModal, isoMonthEnd, isoMonthStart, studentName } from './financeUi'

const PAGE_SIZE = 15

/**
 * Pagos (la caja). Por defecto el mes en curso, que es lo que se cuadra. Los
 * anulados se quedan en la lista —tachados y con su motivo— porque su número
 * de recibo existe y alguien puede tener el papel en la mano.
 */
export function PaymentsTab() {
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const { can } = usePermissions()
  const navigate = useNavigate()
  const toast = useToast()
  const [from, setFrom] = useState(isoMonthStart())
  const [to, setTo] = useState(isoMonthEnd())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [voiding, setVoiding] = useState<PaymentRow | null>(null)
  const [paying, setPaying] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = usePayments(from, to)
  const voidPayment = useVoidPayment()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (p) =>
        !q ||
        String(p.receipt_number).includes(q) ||
        `${p.student?.first_name ?? ''} ${p.student?.last_name ?? ''}`.toLowerCase().includes(q) ||
        (p.reference ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  useEffect(() => setPage(0), [search, from, to])
  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)
  const valid = filtered.filter((p) => p.status === 'valid')
  const total = valid.reduce((s, p) => s + p.amount, 0)

  const doVoid = async (reason: string) => {
    if (!voiding) return
    try {
      await voidPayment.mutateAsync({ id: voiding.id, reason })
      toast.success(`Recibo #${voiding.receipt_number} anulado`)
      setVoiding(null)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo anular el pago'))
    }
  }

  const actionsFor = (p: PaymentRow): ActionItem[] => {
    const items: ActionItem[] = [
      {
        label: 'Ver recibo',
        icon: <Receipt className="h-4 w-4" />,
        onClick: () => navigate(`/finanzas/recibo/${p.id}`),
      },
    ]
    if (p.status === 'valid' && can('manageFinance')) {
      items.push({
        label: 'Anular pago',
        icon: <Ban className="h-4 w-4" />,
        tone: 'danger',
        hint: 'El dinero vuelve a contar como deuda',
        onClick: () => setVoiding(p),
      })
    }
    return items
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPaying(true)}>
          <HandCoins className="h-4 w-4" /> Cobrar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Buscar" className="col-span-2 sm:col-span-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Recibo, estudiante, referencia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Field>
      </div>

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando pagos…" />
        ) : isError ? (
          <LoadError error={error} onRetry={() => refetch()} retrying={isFetching} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="Sin pagos en estas fechas"
            description="Cambia el rango o registra un cobro."
            className="m-4"
          />
        ) : (
          <>
            <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500">
              {num(valid.length)} pagos válidos · cobrado <strong className="text-slate-800">{money(total, currency)}</strong>
            </p>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Recibo</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium">Método</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slice.map((p) => {
                    const isVoid = p.status === 'void'
                    return (
                      <tr key={p.id} className={cn('hover:bg-slate-50/60', isVoid && 'text-slate-400')}>
                        <td className="px-4 py-3">
                          <span className={cn('font-medium', isVoid && 'line-through')}>#{p.receipt_number}</span>
                          {isVoid && (
                            <p className="max-w-[12rem] truncate text-xs" title={p.void_reason ?? undefined}>
                              Anulado: {p.void_reason}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{fmtDateShort(p.paid_on)}</td>
                        <td className="px-4 py-3">{studentName(p.student)}</td>
                        <td className="px-4 py-3">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.reference && <p className="text-xs text-slate-400">{p.reference}</p>}
                        </td>
                        <td className={cn('px-4 py-3 text-right font-medium tabular-nums', isVoid && 'line-through')}>
                          {money(p.amount, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Ver recibo" onClick={() => navigate(`/finanzas/recibo/${p.id}`)}>
                              <Receipt className="h-4 w-4" />
                            </IconBtn>
                            {!isVoid && can('manageFinance') && (
                              <IconBtn title="Anular pago" tone="red" onClick={() => setVoiding(p)}>
                                <Ban className="h-4 w-4" />
                              </IconBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <DataList>
              {slice.map((p) => (
                <DataRow
                  key={p.id}
                  title={`Recibo #${p.receipt_number} · ${money(p.amount, currency)}`}
                  subtitle={studentName(p.student)}
                  tone={p.status === 'void' ? 'muted' : undefined}
                  onClick={() => navigate(`/finanzas/recibo/${p.id}`)}
                  badges={p.status === 'void' ? <Badge tone="red">Anulado</Badge> : undefined}
                  actions={<ActionMenu title={`Recibo #${p.receipt_number}`} items={actionsFor(p)} />}
                >
                  <DataFields>
                    <DataField label="Fecha">{fmtDateShort(p.paid_on)}</DataField>
                    <DataField label="Método">{PAYMENT_METHOD_LABEL[p.method]}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>

            <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="pagos" />
          </>
        )}
      </Card>

      <PaymentModal open={paying} onClose={() => setPaying(false)} />
      <VoidReasonModal
        open={voiding !== null}
        title={voiding ? `Anular recibo #${voiding.receipt_number}` : 'Anular pago'}
        description="El pago queda registrado como anulado (no se borra) y lo que cubría vuelve a quedar pendiente. El número de recibo no se reutiliza."
        loading={voidPayment.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(r) => void doVoid(r)}
      />
    </div>
  )
}
