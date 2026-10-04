import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Charge,
  ChargeStatus,
  FeeConcept,
  FeeKind,
  Guardian,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  RegisterPaymentResult,
  Student,
  StudentAccount,
} from '@/types/db'

/*
 * Finanzas. Regla de oro (migración 0016): el dinero SOLO se mueve por RPC.
 *   · Cobrar          → register_payment()  (número de recibo + reparto atómico)
 *   · Anular un pago  → void_payment()      (con motivo; el pago nunca se borra)
 *   · Anular un cargo → void_charge()
 *   · Saldo a favor   → apply_student_credit()
 *   · Cargo masivo    → generate_charges()
 * Los cargos sueltos sí se crean y corrigen directo (descripción, monto,
 * vencimiento): `amount_paid` y `status` no los puede escribir el cliente.
 */

/** Todo lo que un movimiento de dinero deja desfasado. */
function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['charges'] })
  qc.invalidateQueries({ queryKey: ['payments'] })
  qc.invalidateQueries({ queryKey: ['payment'] })
  qc.invalidateQueries({ queryKey: ['student-accounts'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['report'] })
}

// ── Conceptos ───────────────────────────────────────────────────────────────

export function useFeeConcepts() {
  return useQuery({
    queryKey: ['fee-concepts'],
    queryFn: async (): Promise<FeeConcept[]> => {
      const { data, error } = await supabase.from('fee_concepts').select('*').order('name')
      if (error) throw error
      return (data ?? []) as FeeConcept[]
    },
  })
}

export interface FeeConceptInput {
  name: string
  kind: FeeKind
  default_amount: number
  is_recurring: boolean
  active: boolean
}

export function useSaveFeeConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: FeeConceptInput & { id?: string }) => {
      const q = id
        ? supabase.from('fee_concepts').update(input).eq('id', id)
        : supabase.from('fee_concepts').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-concepts'] }),
  })
}

export function useDeleteFeeConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_concepts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-concepts'] }),
  })
}

// ── Cargos ──────────────────────────────────────────────────────────────────

export type ChargeRow = Charge & {
  student: Pick<Student, 'id' | 'code' | 'first_name' | 'last_name'> | null
  fee_concept: Pick<FeeConcept, 'id' | 'name' | 'kind'> | null
}

const CHARGE_SELECT =
  '*, student:students(id, code, first_name, last_name), fee_concept:fee_concepts(id, name, kind)'

export interface ChargeFilters {
  /** 'open' = pendientes y abonados (lo que se debe hoy). */
  status: 'open' | ChargeStatus | 'all'
  /** 'YYYY-MM-01' para ver un mes de mensualidades. */
  billingMonth?: string | null
}

/**
 * Cargos del colegio con filtro de SERVIDOR: a diferencia de estudiantes, aquí
 * el volumen crece cada mes (300 niños × 11 mensualidades) y PostgREST corta
 * en 1000 filas. Por defecto se piden solo los abiertos, que es lo que se mira.
 */
export function useCharges(filters: ChargeFilters) {
  return useQuery({
    queryKey: ['charges', filters],
    queryFn: async (): Promise<ChargeRow[]> => {
      let q = supabase.from('charges').select(CHARGE_SELECT)
      if (filters.status === 'open') q = q.in('status', ['pending', 'partial'])
      else if (filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.billingMonth) q = q.eq('billing_month', filters.billingMonth)
      const { data, error } = await q
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []) as unknown as ChargeRow[]
    },
  })
}

export function useStudentCharges(studentId: string | undefined) {
  return useQuery({
    queryKey: ['charges', 'student', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<ChargeRow[]> => {
      const { data, error } = await supabase
        .from('charges')
        .select(CHARGE_SELECT)
        .eq('student_id', studentId!)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as ChargeRow[]
    },
  })
}

export interface ChargeInput {
  student_id: string
  enrollment_id: string | null
  fee_concept_id: string | null
  description: string
  amount: number
  due_date: string | null
  billing_month: string | null
}

export function useCreateCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChargeInput) => {
      // Sin `.select()`: las columnas que se devolverían no importan y el
      // INSERT de cargos va con privilegios por columna.
      const { error } = await supabase.from('charges').insert(input)
      if (error) throw error
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

/** Solo lo corregible: la base rechaza bajar el monto por debajo de lo pagado. */
export function useUpdateCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Charge, 'description' | 'amount' | 'due_date'>>) => {
      const { error } = await supabase.from('charges').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

/** Borra un cargo creado por error y SIN pagos (con pagos, la base lo impide). */
export function useDeleteCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('charges').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useVoidCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_charge', { p_charge: v.id, p_reason: v.reason })
      if (error) throw error
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

export interface GenerateChargesInput {
  concept_id: string
  amount: number | null
  description: string | null
  due_date: string | null
  /** 'YYYY-MM-01'. Con mes, no se duplica la mensualidad de ese mes. */
  billing_month: string | null
  period_id: string | null
  grade_level_id: string | null
  section_id: string | null
}

export function useGenerateCharges() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: GenerateChargesInput): Promise<{ created: number; skipped: number }> => {
      const { data, error } = await supabase.rpc('generate_charges', {
        p_concept: v.concept_id,
        p_amount: v.amount,
        p_description: v.description,
        p_due_date: v.due_date,
        p_billing_month: v.billing_month,
        p_period: v.period_id,
        p_grade: v.grade_level_id,
        p_section: v.section_id,
      })
      if (error) throw error
      return data as { created: number; skipped: number }
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

// ── Pagos ───────────────────────────────────────────────────────────────────

export type PaymentRow = Payment & {
  student: Pick<Student, 'id' | 'code' | 'first_name' | 'last_name'> | null
}

/** Pagos en un rango de fechas (la caja de un día, de un mes…). */
export function usePayments(from: string, to: string) {
  return useQuery({
    queryKey: ['payments', from, to],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, student:students(id, code, first_name, last_name)')
        .gte('paid_on', from)
        .lte('paid_on', to)
        .order('receipt_number', { ascending: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []) as unknown as PaymentRow[]
    },
  })
}

export function useStudentPayments(studentId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'student', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, student:students(id, code, first_name, last_name)')
        .eq('student_id', studentId!)
        .order('receipt_number', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as PaymentRow[]
    },
  })
}

/** Pago completo para el RECIBO: estudiante, quien pagó y qué cubrió. */
export type ReceiptData = Payment & {
  student: Pick<Student, 'id' | 'code' | 'first_name' | 'last_name'> | null
  guardian: Pick<Guardian, 'id' | 'first_name' | 'last_name' | 'document_id'> | null
  payment_allocations: (Pick<PaymentAllocation, 'id' | 'amount'> & {
    charge: Pick<Charge, 'id' | 'description' | 'amount' | 'amount_paid' | 'due_date' | 'billing_month'> | null
  })[]
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ['payment', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ReceiptData | null> => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          '*, student:students(id, code, first_name, last_name), ' +
            'guardian:guardians(id, first_name, last_name, document_id), ' +
            'payment_allocations(id, amount, charge:charges(id, description, amount, amount_paid, due_date, billing_month))',
        )
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as ReceiptData | null) ?? null
    },
  })
}

export interface RegisterPaymentInput {
  student_id: string
  amount: number
  method: PaymentMethod
  paid_on: string
  reference: string | null
  guardian_id: string | null
  payer_name: string | null
  notes: string | null
  /** Reparto manual; vacío = la base lo aplica a lo que vence antes. */
  allocations: { charge_id: string; amount: number }[] | null
}

/** Cobra. Devuelve el número de recibo para abrirlo/imprimirlo. */
export function useRegisterPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: RegisterPaymentInput): Promise<RegisterPaymentResult> => {
      const { data, error } = await supabase.rpc('register_payment', {
        p_student: v.student_id,
        p_amount: v.amount,
        p_method: v.method,
        p_paid_on: v.paid_on,
        p_reference: v.reference,
        p_guardian: v.guardian_id,
        p_payer_name: v.payer_name,
        p_notes: v.notes,
        p_allocations: v.allocations && v.allocations.length > 0 ? v.allocations : null,
      })
      if (error) throw error
      return data as RegisterPaymentResult
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useVoidPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_payment', { p_payment: v.id, p_reason: v.reason })
      if (error) throw error
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

/** Aplica el saldo a favor a los cargos abiertos. Devuelve cuánto se aplicó. */
export function useApplyCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (studentId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('apply_student_credit', { p_student: studentId })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => invalidateMoney(qc),
  })
}

// ── Saldos ──────────────────────────────────────────────────────────────────

/**
 * Saldos por estudiante (vista `student_accounts`, con la RLS de quien
 * consulta). Las cuentas por cobrar son las de `balance > 0`.
 */
export function useStudentAccounts() {
  return useQuery({
    queryKey: ['student-accounts'],
    queryFn: async (): Promise<StudentAccount[]> => {
      const { data, error } = await supabase
        .from('student_accounts')
        .select('*')
        .order('last_name')
        .order('first_name')
      if (error) throw error
      // numeric llega como número desde PostgREST, salvo en vistas con
      // agregados, donde puede llegar como texto: se normaliza en la frontera.
      return ((data ?? []) as StudentAccount[]).map((a) => ({
        ...a,
        total_charged: Number(a.total_charged),
        total_paid: Number(a.total_paid),
        balance: Number(a.balance),
        overdue: Number(a.overdue),
        credit: Number(a.credit),
        open_charges: Number(a.open_charges),
      }))
    },
  })
}

export function useStudentAccount(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-accounts', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<StudentAccount | null> => {
      const { data, error } = await supabase
        .from('student_accounts')
        .select('*')
        .eq('student_id', studentId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const a = data as StudentAccount
      return {
        ...a,
        total_charged: Number(a.total_charged),
        total_paid: Number(a.total_paid),
        balance: Number(a.balance),
        overdue: Number(a.overdue),
        credit: Number(a.credit),
        open_charges: Number(a.open_charges),
      }
    },
  })
}
