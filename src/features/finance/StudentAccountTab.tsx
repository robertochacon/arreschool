import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, Plus, Receipt, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import {
  useApplyCredit,
  useStudentAccount,
  useStudentCharges,
  useStudentPayments,
} from '@/hooks/finance'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { CHARGE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, money } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PaymentModal } from './PaymentModal'
import { ChargeFormModal } from './ChargeFormModal'
import { CHARGE_STATUS_TONE } from './financeUi'

/**
 * Pestaña "Cuenta" de la ficha del estudiante: lo que debe, lo que pagó y el
 * saldo a favor, con cobrar a un toque. Es el estado de cuenta que se le enseña
 * a una familia en la puerta.
 *
 * Las listas son cortas (un estudiante tiene una docena de cargos al año), así
 * que van como lista simple en todos los tamaños: nada que pueda pedir scroll
 * horizontal en el teléfono.
 */
export function StudentAccountTab({ studentId }: { studentId: string }) {
  const { tenant } = useAuth()
  const toast = useToast()
  const currency = tenant?.currency
  const { data: account, isLoading } = useStudentAccount(studentId)
  const { data: charges } = useStudentCharges(studentId)
  const { data: payments } = useStudentPayments(studentId)
  const applyCredit = useApplyCredit()
  const [paying, setPaying] = useState(false)
  const [newCharge, setNewCharge] = useState(false)

  if (isLoading) return <PageLoader label="Cargando la cuenta…" />

  const credit = account?.credit ?? 0

  const apply = async () => {
    try {
      const applied = await applyCredit.mutateAsync(studentId)
      toast.success(
        applied > 0 ? `${money(applied, currency)} aplicados a cargos pendientes` : 'No había cargos donde aplicarlo',
      )
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo aplicar el saldo'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pendiente" value={money(account?.balance, currency)} icon={<Wallet className="h-5 w-5" />} tone="amber" />
        <StatCard label="Vencido" value={money(account?.overdue, currency)} icon={<Wallet className="h-5 w-5" />} tone="red" />
        <StatCard label="Pagado" value={money(account?.total_paid, currency)} icon={<HandCoins className="h-5 w-5" />} tone="green" />
        <StatCard label="A favor" value={money(credit, currency)} icon={<HandCoins className="h-5 w-5" />} tone="brand" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPaying(true)}>
          <HandCoins className="h-4 w-4" /> Cobrar
        </Button>
        <Button variant="outline" onClick={() => setNewCharge(true)}>
          <Plus className="h-4 w-4" /> Nuevo cargo
        </Button>
        {/* Solo cuando hay saldo a favor Y algo que pagar con él: si no, el
            botón no haría nada y parecería roto. */}
        {credit > 0 && (account?.balance ?? 0) > 0 && (
          <Button variant="secondary" onClick={() => void apply()} loading={applyCredit.isPending}>
            Aplicar saldo a favor
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="Cargos" subtitle="Lo que se le ha cobrado, del más próximo a vencer" />
        {!charges || charges.length === 0 ? (
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="Sin cargos" className="m-4" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {charges.map((c) => (
              <li key={c.id} className={cn('flex items-start gap-3 px-4 py-3', c.status === 'void' && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium text-slate-800', c.status === 'void' && 'line-through')}>
                    {c.description}
                  </p>
                  <p className="text-xs text-slate-400">
                    Vence {fmtDateShort(c.due_date)}
                    {c.status === 'void' && c.void_reason ? ` · Anulado: ${c.void_reason}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-800">{money(c.amount, currency)}</p>
                  <Badge tone={CHARGE_STATUS_TONE[c.status]}>
                    {c.status === 'partial'
                      ? `Falta ${money(c.amount - c.amount_paid, currency)}`
                      : CHARGE_STATUS_LABEL[c.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Pagos" subtitle="Cada uno con su recibo" />
        {!payments || payments.length === 0 ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Sin pagos registrados" className="m-4" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/finanzas/recibo/${p.id}`}
                    className={cn('text-sm font-medium text-brand-700 hover:underline', p.status === 'void' && 'line-through')}
                  >
                    Recibo #{p.receipt_number}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {fmtDateShort(p.paid_on)} · {PAYMENT_METHOD_LABEL[p.method]}
                    {p.status === 'void' ? ' · Anulado' : ''}
                  </p>
                </div>
                <p
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    p.status === 'void' ? 'text-slate-400 line-through' : 'text-slate-800',
                  )}
                >
                  {money(p.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PaymentModal open={paying} onClose={() => setPaying(false)} studentId={studentId} />
      <ChargeFormModal open={newCharge} onClose={() => setNewCharge(false)} charge={null} studentId={studentId} />
    </div>
  )
}
