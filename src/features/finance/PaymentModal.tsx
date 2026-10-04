import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth/AuthProvider'
import { useRegisterPayment, useStudentAccount, useStudentCharges } from '@/hooks/finance'
import { useStudent, useStudentGuardians } from '@/hooks/students'
import { PAYMENT_METHOD_LABEL, RELATIONSHIP_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, money } from '@/lib/format'
import type { PaymentMethod, RegisterPaymentResult } from '@/types/db'
import { StudentPicker, isoToday, parseAmount, studentName } from './financeUi'

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]

type Mode = 'auto' | 'manual'

/** Redondeo a centavos: sumar 0.1 + 0.2 en JS da 0.30000000000000004. */
const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Cobrar. Es el ÚNICO sitio de la app donde entra dinero.
 *
 * Todo lo que importa lo hace la base en `register_payment` y en una sola
 * transacción: número de recibo correlativo, reparto entre cargos con la cuenta
 * del estudiante bloqueada y el resto como saldo a favor. Aquí solo se recoge
 * lo que dice la persona en caja y se enseña el recibo al terminar.
 *
 * Por defecto el pago se aplica "a lo que vence antes", que es lo que espera
 * cualquier familia; el reparto manual existe para el caso "esto es solo para
 * el uniforme".
 */
export function PaymentModal({
  open,
  onClose,
  studentId,
}: {
  open: boolean
  onClose: () => void
  /** Estudiante ya elegido (desde su ficha o su cuenta). Sin él, el diálogo deja buscarlo. */
  studentId?: string
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const register = useRegisterPayment()

  const [student, setStudent] = useState<string | null>(studentId ?? null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState(isoToday())
  const [reference, setReference] = useState('')
  const [payer, setPayer] = useState('')
  const [payerName, setPayerName] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<Mode>('auto')
  const [manual, setManual] = useState<Record<string, string>>({})
  const [done, setDone] = useState<RegisterPaymentResult | null>(null)

  const { data: studentRow } = useStudent(student ?? undefined)
  const { data: charges, isLoading: loadingCharges } = useStudentCharges(student ?? undefined)
  const { data: account } = useStudentAccount(student ?? undefined)
  const { data: guardians } = useStudentGuardians(student ?? undefined)

  const open_ = useMemo(
    () => (charges ?? []).filter((c) => c.status === 'pending' || c.status === 'partial'),
    [charges],
  )
  const pending = cents(open_.reduce((sum, c) => sum + (c.amount - c.amount_paid), 0))

  useEffect(() => {
    if (!open) return
    setStudent(studentId ?? null)
    setMethod('cash')
    setPaidOn(isoToday())
    setReference('')
    setPayer('')
    setPayerName('')
    setNotes('')
    setMode('auto')
    setManual({})
    setDone(null)
    setAmount('')
  }, [open, studentId])

  // El monto arranca en "todo lo pendiente" al conocer los cargos: es el caso
  // más común y evita teclear. Solo si la persona aún no escribió nada (por eso
  // `amount` no va en las dependencias: borrarlo no debe volver a rellenarlo).
  useEffect(() => {
    if (open && !done && amount === '' && pending > 0) setAmount(String(pending))
  }, [open, pending])

  // Quien paga por defecto: el responsable económico, si está marcado.
  useEffect(() => {
    if (!guardians || payer) return
    const fin = guardians.find((g) => g.is_financial_responsible) ?? guardians.find((g) => g.is_primary)
    if (fin) setPayer(fin.guardian_id)
  }, [guardians])

  const parsed = parseAmount(amount)
  const manualTotal = cents(
    Object.values(manual).reduce((sum, v) => sum + (parseAmount(v) ?? 0), 0),
  )
  const manualError = useMemo(() => {
    if (mode !== 'manual') return null
    for (const c of open_) {
      const raw = manual[c.id]
      if (!raw) continue
      const n = parseAmount(raw)
      if (n === null) return `Monto inválido en "${c.description}"`
      if (n > cents(c.amount - c.amount_paid)) return `El abono a "${c.description}" supera lo que falta`
    }
    if (parsed !== null && manualTotal > parsed) return 'Lo repartido supera el monto del pago'
    return null
  }, [mode, manual, open_, parsed, manualTotal])

  const futureDate = paidOn > isoToday()
  const canSubmit = Boolean(student && parsed && !futureDate && !manualError)

  const submit = async () => {
    if (!canSubmit || !student || !parsed) return
    try {
      const r = await register.mutateAsync({
        student_id: student,
        amount: parsed,
        method,
        paid_on: paidOn,
        reference: reference.trim() || null,
        guardian_id: payer && payer !== 'other' ? payer : null,
        payer_name: payer === 'other' ? payerName.trim() || null : null,
        notes: notes.trim() || null,
        allocations:
          mode === 'manual'
            ? open_
                .map((c) => ({ charge_id: c.id, amount: parseAmount(manual[c.id] ?? '') ?? 0 }))
                .filter((a) => a.amount > 0)
            : null,
      })
      setDone(r)
      toast.success(`Pago registrado · Recibo #${r.receipt_number}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo registrar el pago'))
    }
  }

  // ── Pantalla final: el recibo a un toque ─────────────────────────────────
  if (done) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Pago registrado"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Listo
            </Button>
            <Button
              onClick={() => {
                onClose()
                navigate(`/finanzas/recibo/${done.payment_id}`)
              }}
            >
              <Printer className="h-4 w-4" /> Ver recibo
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-bold text-slate-900">Recibo #{done.receipt_number}</p>
          <p className="text-sm text-slate-600">
            {money(Number(done.allocated), currency)} aplicados a cargos
            {Number(done.credit) > 0 && (
              <>
                {' '}· <strong>{money(Number(done.credit), currency)}</strong> quedan como saldo a favor
              </>
            )}
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cobrar"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} loading={register.isPending}>
            Registrar {parsed ? money(parsed, currency) : 'pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!studentId && (
          <Field label="Estudiante" required>
            <StudentPicker
              value={student}
              onChange={(id) => {
                setStudent(id)
                setAmount('')
                setPayer('')
                setManual({})
              }}
            />
          </Field>
        )}

        {student && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-800">{studentName(studentRow)}</p>
              <p className="text-sm text-slate-500">
                Pendiente: <strong className="text-slate-800">{money(pending, currency)}</strong>
                {account && account.credit > 0 && (
                  <span className="ml-2 text-emerald-700">· a favor {money(account.credit, currency)}</span>
                )}
              </p>
            </div>
            {loadingCharges ? (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            ) : open_.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No tiene cargos pendientes: lo que pague quedará como saldo a favor.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {open_.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-slate-700">{c.description}</p>
                      <p className="text-xs text-slate-400">
                        Vence {fmtDateShort(c.due_date)} · falta {money(c.amount - c.amount_paid, currency)}
                      </p>
                    </div>
                    {mode === 'manual' && (
                      <Input
                        className="w-28 text-right"
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Abono a ${c.description}`}
                        value={manual[c.id] ?? ''}
                        onChange={(e) => setManual((m) => ({ ...m, [c.id]: e.target.value }))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Monto recibido" required error={amount && !parsed ? 'Monto inválido' : undefined}>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Fecha" required error={futureDate ? 'No puede ser una fecha futura' : undefined}>
            <Input type="date" max={isoToday()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referencia" hint={method === 'cash' ? 'Opcional' : 'Nº de transferencia, voucher o cheque'}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        <Field label="Quién paga" hint="Sale en el recibo">
          <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
            <option value="">Sin indicar</option>
            {(guardians ?? []).map((g) => (
              <option key={g.guardian_id} value={g.guardian_id}>
                {g.guardian ? `${g.guardian.first_name} ${g.guardian.last_name}` : 'Familiar'} (
                {RELATIONSHIP_LABEL[g.relationship]})
              </option>
            ))}
            <option value="other">Otra persona…</option>
          </Select>
        </Field>
        {payer === 'other' && (
          <Field label="Nombre de quien paga">
            <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
          </Field>
        )}

        {open_.length > 0 && (
          <Field
            label="Cómo aplicar el pago"
            hint={
              mode === 'auto'
                ? 'Se aplica a lo que vence antes; lo que sobre queda a favor.'
                : `Repartido: ${money(manualTotal, currency)}${
                    parsed && parsed > manualTotal ? ` · a favor: ${money(cents(parsed - manualTotal), currency)}` : ''
                  }`
            }
            error={manualError ?? undefined}
          >
            <Segmented
              variant="toggle"
              value={mode}
              onChange={setMode}
              label="Cómo aplicar el pago"
              options={[
                { value: 'auto', label: 'Automático' },
                { value: 'manual', label: 'Elegir cargos' },
              ]}
            />
          </Field>
        )}

        <Field label="Notas" hint="Opcional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <p className="text-xs text-slate-400">
          Un pago registrado no se edita ni se borra: si hay un error, se anula con su motivo.
        </p>
      </div>
    </Modal>
  )
}
