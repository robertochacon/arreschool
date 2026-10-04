import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AttendanceReportRow, EnrollmentReportRow, IncomeReport } from '@/types/db'

/*
 * Reportes. Cada uno es UNA RPC `security invoker` (0017): corre con la RLS de
 * quien pregunta, así que nunca devuelve más de lo que esa persona ya puede ver
 * fila a fila. Todas cuelgan de la clave ['report', …] para que cualquier
 * mutación que los desfase pueda invalidarlos de una vez.
 */

export function useAttendanceReport(from: string, to: string, sectionId: string | null) {
  return useQuery({
    queryKey: ['report', 'attendance', from, to, sectionId],
    enabled: Boolean(from && to),
    queryFn: async (): Promise<AttendanceReportRow[]> => {
      const { data, error } = await supabase.rpc('report_attendance', {
        p_from: from,
        p_to: to,
        p_section: sectionId,
      })
      if (error) throw error
      return (data ?? []) as AttendanceReportRow[]
    },
  })
}

const EMPTY_INCOME: IncomeReport = {
  total: 0,
  count: 0,
  by_method: [],
  by_concept: [],
  unallocated: 0,
  by_day: [],
}

export function useIncomeReport(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['report', 'income', from, to],
    enabled: enabled && Boolean(from && to),
    queryFn: async (): Promise<IncomeReport> => {
      const { data, error } = await supabase.rpc('report_income', { p_from: from, p_to: to })
      if (error) throw error
      // Cast acotado: jsonb sin tipar; se rellenan claves por si la RPC crece.
      return { ...EMPTY_INCOME, ...((data ?? {}) as Partial<IncomeReport>) }
    },
  })
}

export function useEnrollmentReport(periodId: string | undefined) {
  return useQuery({
    queryKey: ['report', 'enrollment', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<EnrollmentReportRow[]> => {
      const { data, error } = await supabase.rpc('report_enrollment', { p_period: periodId })
      if (error) throw error
      return (data ?? []) as EnrollmentReportRow[]
    },
  })
}
