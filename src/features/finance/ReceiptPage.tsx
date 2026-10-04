import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Receipt } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePayment } from '@/hooks/finance'
import { useTeamMembers } from '@/hooks/team'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { PAYMENT_METHOD_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime, money } from '@/lib/format'
import { cn } from '@/lib/cn'
import { studentName } from './financeUi'

/**
 * Recibo imprimible (ArreSchool Pay).
 *
 * Los datos del colegio salen del tenant ACTUAL (nombre, RNC, logo, pie): a
 * diferencia del boletín, un recibo no se congela en una foto, porque su valor
 * legal es el número y el monto, que la base ya hace inmutables. Si el pago se
 * anuló, el recibo lo dice en grande: imprimir un anulado sin el sello sería
 * entregar un comprobante falso.
 *
 * Se imprime con el diálogo del navegador; el marco de la app (menús,
 * cabecera) lleva `print:hidden` en el Layout, y aquí los botones también.
 */
export function ReceiptPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenant } = useAuth()
  const { data: p, isLoading, isError, error } = usePayment(id)
  const { data: team } = useTeamMembers()
  const currency = tenant?.currency

  if (isLoading) return <PageLoader label="Cargando recibo…" />
  if (isError || !p) {
    return (
      <Card>
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No se encontró el recibo"
          description={isError ? errorMessage(error) : 'Puede que el enlace sea de otro colegio o que ya no exista.'}
          action={
            <Link to="/finanzas?tab=pagos">
              <Button variant="outline">Ir a pagos</Button>
            </Link>
          }
          className="m-4"
        />
      </Card>
    )
  }

  const isVoid = p.status === 'void'
  const covered = p.payment_allocations.reduce((s, a) => s + Number(a.amount), 0)
  const credit = Math.round((p.amount - covered) * 100) / 100
  const payer = p.guardian ? `${p.guardian.first_name} ${p.guardian.last_name}` : p.payer_name
  const receivedBy = team?.find((m) => m.id === p.received_by)?.full_name

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {isVoid && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="-rotate-12 rounded-xl border-4 border-red-500/70 px-6 py-2 text-4xl font-black tracking-widest text-red-500/70 sm:text-6xl">
              ANULADO
            </span>
          </div>
        )}

        {/* ── Colegio ─────────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />
            )}
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900">{tenant?.name}</p>
              {tenant?.legal_id && <p className="text-xs text-slate-500">RNC {tenant.legal_id}</p>}
              {tenant?.address && <p className="text-xs text-slate-500">{tenant.address}</p>}
              {tenant?.phone && <p className="text-xs text-slate-500">Tel. {tenant.phone}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recibo de pago</p>
            <p className="text-2xl font-black tabular-nums text-slate-900">
              Nº {String(p.receipt_number).padStart(6, '0')}
            </p>
            <p className="text-sm text-slate-600">{fmtDate(p.paid_on)}</p>
          </div>
        </header>

        {/* ── Quién y cuánto ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 border-b border-slate-200 py-5 sm:grid-cols-2">
          <Info label="Estudiante">
            {studentName(p.student)}
            {p.student?.code && <span className="block text-xs font-normal text-slate-500">Matrícula {p.student.code}</span>}
          </Info>
          <Info label="Recibido de">
            {payer ?? '—'}
            {p.guardian?.document_id && (
              <span className="block text-xs font-normal text-slate-500">Doc. {p.guardian.document_id}</span>
            )}
          </Info>
          <Info label="Forma de pago">
            {PAYMENT_METHOD_LABEL[p.method]}
            {p.reference && <span className="block text-xs font-normal text-slate-500">Ref. {p.reference}</span>}
          </Info>
          <Info label="Monto recibido">
            <span className="text-xl font-black tabular-nums">{money(p.amount, currency)}</span>
          </Info>
        </section>

        {/* ── Detalle ─────────────────────────────────────────────────────── */}
        <section className="py-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Aplicado a</p>
          {p.payment_allocations.length === 0 ? (
            <p className="text-sm text-slate-600">Pago a cuenta (saldo a favor del estudiante).</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {p.payment_allocations.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0 text-slate-700">
                    {a.charge?.description ?? 'Cargo'}
                    {a.charge && a.charge.amount_paid < a.charge.amount && (
                      <span className="block text-xs text-slate-400">
                        Abono · falta hoy {money(a.charge.amount - a.charge.amount_paid, currency)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{money(a.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
          {credit > 0 && (
            <p className="mt-3 flex justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>Saldo a favor</span>
              <span className="font-semibold tabular-nums">{money(credit, currency)}</span>
            </p>
          )}
          <p className={cn('mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold', isVoid && 'line-through')}>
            <span>Total</span>
            <span className="tabular-nums">{money(p.amount, currency)}</span>
          </p>
        </section>

        {isVoid && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            Anulado el {fmtDateTime(p.voided_at)}. Motivo: {p.void_reason}
          </p>
        )}

        {p.notes && <p className="mb-4 text-sm text-slate-600">Nota: {p.notes}</p>}

        {/* ── Firma y pie ─────────────────────────────────────────────────── */}
        <footer className="space-y-4 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p>
              Recibido por: <span className="font-medium text-slate-700">{receivedBy ?? '—'}</span>
              <br />
              Registrado: {fmtDateTime(p.created_at)}
            </p>
            <div className="w-48 border-t border-slate-400 pt-1 text-center">Firma y sello</div>
          </div>
          {tenant?.receipt_footer && <p className="whitespace-pre-line">{tenant.receipt_footer}</p>}
          <p className="text-[10px] text-slate-400">Generado con ArreSchool</p>
        </footer>
      </article>
    </div>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="break-words text-sm font-semibold text-slate-800">{children}</p>
    </div>
  )
}
