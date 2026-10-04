import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, HandCoins, Search, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useStudentAccounts } from '@/hooks/finance'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { StatCard } from '@/components/ui/StatCard'
import { Segmented } from '@/components/ui/Segmented'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { fmtDateShort, money, num } from '@/lib/format'
import { PaymentModal } from './PaymentModal'
import { IconBtn, LoadError, studentName } from './financeUi'

const PAGE_SIZE = 15

type Filter = 'debt' | 'overdue' | 'credit'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'debt', label: 'Con deuda' },
  { value: 'overdue', label: 'Vencidos' },
  { value: 'credit', label: 'Saldo a favor' },
]

/**
 * Cuentas por cobrar: quién debe, cuánto y desde cuándo. Sale de la vista
 * `student_accounts`, que ya trae los totales calculados en la base: aquí solo
 * se filtra y se ordena por lo que más urge (lo vencido primero).
 */
export function AccountsTab() {
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useStudentAccounts()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('debt')
  const [page, setPage] = useState(0)
  const [paying, setPaying] = useState<string | null>(null)

  const accounts = useMemo(() => data ?? [], [data])

  const totals = useMemo(
    () => ({
      balance: accounts.reduce((s, a) => s + Math.max(0, a.balance), 0),
      overdue: accounts.reduce((s, a) => s + a.overdue, 0),
      debtors: accounts.filter((a) => a.balance > 0).length,
      credit: accounts.reduce((s, a) => s + a.credit, 0),
    }),
    [accounts],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts
      .filter((a) => {
        if (filter === 'debt' && a.balance <= 0) return false
        if (filter === 'overdue' && a.overdue <= 0) return false
        if (filter === 'credit' && a.credit <= 0) return false
        if (!q) return true
        return `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
      })
      .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance)
  }, [accounts, search, filter])

  useEffect(() => setPage(0), [search, filter])
  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)

  if (isLoading) return <PageLoader label="Calculando saldos…" />
  if (isError) return <Card><LoadError error={error} onRetry={() => refetch()} retrying={isFetching} /></Card>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Por cobrar" value={money(totals.balance, currency)} icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <StatCard label="Vencido" value={money(totals.overdue, currency)} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
        <StatCard label="Familias con deuda" value={num(totals.debtors)} icon={<UserRound className="h-5 w-5" />} tone="slate" />
        <StatCard label="Saldos a favor" value={money(totals.credit, currency)} icon={<HandCoins className="h-5 w-5" />} tone="green" />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar por nombre o matrícula…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Segmented label="Filtrar cuentas" value={filter} onChange={setFilter} options={FILTERS} />
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title={accounts.length === 0 ? 'Todavía no hay cuentas' : 'Nada pendiente aquí'}
            description={
              accounts.length === 0
                ? 'Las cuentas aparecen cuando se crean cargos para los estudiantes.'
                : 'Ninguna cuenta coincide con la búsqueda o el filtro.'
            }
            className="m-4"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                    <th className="px-4 py-3 text-right font-medium">Vencido</th>
                    <th className="px-4 py-3 text-right font-medium">A favor</th>
                    <th className="px-4 py-3 font-medium">Próximo vencimiento</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slice.map((a) => (
                    <tr key={a.student_id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/estudiantes/${a.student_id}`)}
                          className="font-medium text-slate-800 hover:text-brand-600"
                        >
                          {studentName(a)}
                        </button>
                        <p className="text-xs text-slate-400">{a.code}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(a.balance, currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">
                        {a.overdue > 0 ? money(a.overdue, currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                        {a.credit > 0 ? money(a.credit, currency) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDateShort(a.next_due_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Ver ficha" onClick={() => navigate(`/estudiantes/${a.student_id}`)}>
                            <UserRound className="h-4 w-4" />
                          </IconBtn>
                          <Button size="sm" onClick={() => setPaying(a.student_id)}>
                            Cobrar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DataList>
              {slice.map((a) => (
                <DataRow
                  key={a.student_id}
                  title={studentName(a)}
                  titleExtra={a.code}
                  tone={a.overdue > 0 ? 'danger' : undefined}
                  onClick={() => navigate(`/estudiantes/${a.student_id}`)}
                  badges={
                    <>
                      {a.overdue > 0 && <Badge tone="red">Vencido {money(a.overdue, currency)}</Badge>}
                      {a.credit > 0 && <Badge tone="green">A favor {money(a.credit, currency)}</Badge>}
                    </>
                  }
                  actions={
                    <ActionMenu
                      title={studentName(a)}
                      label={`Opciones de ${studentName(a)}`}
                      items={[
                        {
                          label: 'Cobrar',
                          icon: <HandCoins className="h-4 w-4" />,
                          tone: 'success',
                          onClick: () => setPaying(a.student_id),
                        },
                        {
                          label: 'Ver ficha y cuenta',
                          icon: <UserRound className="h-4 w-4" />,
                          onClick: () => navigate(`/estudiantes/${a.student_id}`),
                        },
                      ]}
                    />
                  }
                >
                  <DataFields>
                    <DataField label="Pendiente">{money(a.balance, currency)}</DataField>
                    <DataField label="Próximo vence">{fmtDateShort(a.next_due_date)}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>

            <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="cuentas" />
          </>
        )}
      </Card>

      <PaymentModal open={paying !== null} onClose={() => setPaying(null)} studentId={paying ?? undefined} />
    </div>
  )
}
