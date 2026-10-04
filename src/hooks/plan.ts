import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { MyPlanRequest, PlanCode } from '@/types/db'

/**
 * Solicitud de cambio de plan PENDIENTE del colegio actual (o `null`).
 *
 * No hace falta filtrar por colegio: la RLS de `plan_requests` solo devuelve las
 * del propio tenant. La clave tampoco lo lleva —el contrato la fija en
 * `['my-plan-request']`— y no hay riesgo de que una cuenta vea la de otra
 * porque al cerrar sesión se vacía el cache de lecturas (`clearOfflineCache`).
 */
export function useMyPlanRequest() {
  const { tenant } = useAuth()
  return useQuery({
    queryKey: ['my-plan-request'],
    enabled: Boolean(tenant?.id),
    queryFn: async (): Promise<MyPlanRequest | null> => {
      const { data, error } = await supabase
        .from('plan_requests')
        .select('id, requested_plan, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      // `.limit(1)` y no `.single()`: no tener ninguna solicitud es lo normal, y
      // `single()` lo trataría como error (PGRST116).
      return (data?.[0] as MyPlanRequest | undefined) ?? null
    },
  })
}

/**
 * Pide cambiar de plan. La solicitud llega al panel del super-admin, que es
 * quien la aprueba: el plan NO se cambia desde el cliente porque es lo que
 * decide cuánto cabe y cuánto se cobra.
 */
export function useRequestPlanChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { plan: PlanCode; note?: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('request_plan_change', {
        p_plan: args.plan,
        p_note: args.note ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-plan-request'] }),
  })
}
