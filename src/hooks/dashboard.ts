import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DashboardSummary } from '@/types/db'

/** Todo a cero: lo que se pinta cuando la cuenta todavía no tiene colegio. */
const EMPTY: DashboardSummary = {
  current_period: null,
  students_active: 0,
  students_total: 0,
  enrolled: 0,
  unassigned: 0,
  sections: 0,
  teachers_active: 0,
  guardians: 0,
  members: 0,
  birthdays_month: 0,
  attendance_today: { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 },
  attendance_rate_30d: null,
  by_grade: [],
  finance: null,
}

/**
 * Resumen del colegio para el panel.
 *
 * `dashboard_summary()` devuelve `{}` cuando la cuenta no tiene colegio
 * (onboarding a medias, o un super-admin, que por diseño no pertenece a
 * ninguno). Se rellena aquí, en la frontera con los datos crudos, para que
 * ninguna tarjeta tenga que defenderse de un `undefined` y acabe pintando "NaN".
 * `finance` llega en null para quien no maneja finanzas: lo decide la base.
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc('dashboard_summary')
      if (error) throw error
      // Cast acotado: el jsonb llega sin tipar y puede venir vacío.
      return { ...EMPTY, ...((data ?? {}) as Partial<DashboardSummary>) }
    },
  })
}
