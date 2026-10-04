import { supabase } from '@/lib/supabase'
import { ATTENDANCE_STATUS_LABEL, ENROLLMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/constants'
import type { AttendanceRecord } from '@/types/db'
import type { EnrollmentRow } from '@/hooks/enrollments'
import type { ChargeRow, PaymentRow } from '@/hooks/finance'
import type { ReportCell } from './reportExport'

export type DetailFilters =
  | { type: 'asistencia'; from: string; to: string; sectionId: string }
  | { type: 'matricula'; periodId: string }
  | { type: 'ingresos'; from: string; to: string }
  | { type: 'cobros'; today: string }

export interface DetailReport { headers: string[]; rows: ReportCell[][] }
const studentSelect = 'student:students(code, first_name, last_name)'
const name = (student: { first_name: string; last_name: string } | null) =>
  student ? `${student.first_name} ${student.last_name}` : 'Estudiante no disponible'

// Fetch every page, including installations with a lower server row limit.
export async function fetchAllRows<T>(page: (offset: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length)
    if (error) throw error
    if (!data?.length) return rows
    rows.push(...data as T[])
  }
}

export async function fetchReportDetails(filters: DetailFilters): Promise<DetailReport> {
  if (filters.type === 'matricula') {
    const rows = await fetchAllRows<EnrollmentRow>((offset) => supabase.from('enrollments')
      .select(`id, status, enrolled_on, ended_on, ${studentSelect}, grade_level:grade_levels(name), section:sections(name)`)
      .eq('academic_period_id', filters.periodId).order('id').range(offset, offset + 499))
    rows.sort((a, b) => name(a.student).localeCompare(name(b.student), 'es'))
    return { headers: ['Código', 'Estudiante', 'Grado', 'Sección', 'Estado', 'Inscripción', 'Finalización'],
      rows: rows.map((r) => [r.student?.code, name(r.student), r.grade_level?.name, r.section?.name ?? 'Sin sección', ENROLLMENT_STATUS_LABEL[r.status], r.enrolled_on, r.ended_on]) }
  }
  if (filters.type === 'ingresos') {
    const rows = await fetchAllRows<PaymentRow>((offset) => supabase.from('payments')
      .select(`id, receipt_number, paid_on, amount, method, reference, payer_name, ${studentSelect}`)
      .eq('status', 'valid').gte('paid_on', filters.from).lte('paid_on', filters.to)
      .order('paid_on').order('id').range(offset, offset + 499))
    return { headers: ['Recibo', 'Fecha', 'Código', 'Estudiante', 'Pagador', 'Forma de pago', 'Referencia', 'Monto'],
      rows: rows.map((r) => [r.receipt_number, r.paid_on, r.student?.code, name(r.student), r.payer_name, PAYMENT_METHOD_LABEL[r.method], r.reference, r.amount]) }
  }
  if (filters.type === 'cobros') {
    const rows = await fetchAllRows<ChargeRow>((offset) => supabase.from('charges')
      .select(`id, description, due_date, amount, amount_paid, ${studentSelect}, fee_concept:fee_concepts(name)`)
      .in('status', ['pending', 'partial']).order('due_date').order('id').range(offset, offset + 499))
    return { headers: ['Código', 'Estudiante', 'Concepto', 'Descripción', 'Vencimiento', 'Monto', 'Abonado', 'Saldo', 'Vencido'],
      rows: rows.map((r) => [r.student?.code, name(r.student), r.fee_concept?.name ?? 'Sin concepto', r.description, r.due_date, r.amount, r.amount_paid, Math.round((r.amount - r.amount_paid) * 100) / 100, r.due_date && r.due_date < filters.today ? 'Sí' : 'No']) }
  }
  type AttendanceDetail = AttendanceRecord & {
    enrollment: { student: PaymentRow['student'] } | null
    section: { name: string; grade_level: { name: string } | null } | null
  }
  const rows = await fetchAllRows<AttendanceDetail>((offset) => {
    let query = supabase.from('attendance_records')
      .select(`id, date, status, note, enrollment:enrollments(${studentSelect}), section:sections(name, grade_level:grade_levels(name))`)
      .gte('date', filters.from).lte('date', filters.to)
    if (filters.sectionId) query = query.eq('section_id', filters.sectionId)
    return query.order('date').order('id').range(offset, offset + 499)
  })
  return { headers: ['Fecha', 'Código', 'Estudiante', 'Grado', 'Sección', 'Asistencia', 'Observación'],
    rows: rows.map((r) => [r.date, r.enrollment?.student?.code, name(r.enrollment?.student ?? null), r.section?.grade_level?.name, r.section?.name, ATTENDANCE_STATUS_LABEL[r.status], r.note]) }
}
