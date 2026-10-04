import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PLANS, type PlanInfo } from '@/lib/constants'
import type { PlanCode } from '@/types/db'

/** Fila cruda de `plan_settings` (la fuente de verdad de precios y topes). */
export interface PlanSettingRow {
  plan: PlanCode
  name: string
  price_monthly: number
  price_usd: number
  /** `null` = ilimitado, NO cero. */
  max_students: number | null
  max_members: number | null
  features: string[]
  is_offered: boolean
  is_featured: boolean
  sort_order: number
  updated_at: string
}

// Columnas explícitas y no `*`: `updated_by` (quién tocó los precios) no le
// importa a la UI y la fila la lee cualquier visitante sin sesión.
const COLS =
  'plan, name, price_monthly, price_usd, max_students, max_members, features, is_offered, is_featured, sort_order, updated_at'

/**
 * Lee `plan_settings`. Es PÚBLICO —la landing enseña los precios sin sesión— y
 * la RLS de la migración 0009 permite el SELECT a `anon`.
 *
 * Se expone como función suelta, además del hook, porque el AuthProvider la
 * llama fuera de react-query para tener los planes listos antes de que monte
 * ninguna pantalla.
 */
export async function fetchPlanSettings(): Promise<PlanSettingRow[]> {
  const { data, error } = await supabase.from('plan_settings').select(COLS).order('sort_order')
  if (error) throw error
  return (data ?? []) as PlanSettingRow[]
}

/**
 * Convierte las filas al `PlanInfo` que usa toda la app, con las constantes de
 * `@/lib/constants` como respaldo. Así, si la consulta falla o la app abre sin
 * conexión, ningún plan se queda sin nombre ni sin precio.
 */
export function toPlanMap(rows: PlanSettingRow[] | undefined): Record<PlanCode, PlanInfo> {
  const map = { ...PLANS }
  for (const r of rows ?? []) {
    // Un plan que está en la tabla pero no en el enum de la app (base más nueva
    // que el build) se ignora: la UI no sabría qué hacer con él.
    if (!map[r.plan]) continue
    map[r.plan] = {
      code: r.plan,
      name: r.name,
      price: Number(r.price_monthly),
      priceUsd: Number(r.price_usd),
      maxStudents: r.max_students,
      maxMembers: r.max_members,
      features: r.features ?? [],
      isOffered: r.is_offered,
      isFeatured: r.is_featured,
      sortOrder: r.sort_order,
    }
  }
  return map
}

/** Planes vigentes. Sirve tanto con sesión como en la landing pública. */
export function usePlanSettings() {
  return useQuery({
    queryKey: ['plan-settings'],
    // Cambian muy de vez en cuando; no tiene sentido repreguntarlo en cada
    // pantalla que enseñe un precio.
    staleTime: 10 * 60_000,
    queryFn: fetchPlanSettings,
  })
}

export interface PlanUpdate {
  plan: PlanCode
  name?: string
  price_monthly?: number
  price_usd?: number
  /** `null` = ilimitado. Ojo: deja ilimitados los DOS topes (ver abajo). */
  max_students?: number | null
  max_members?: number | null
  features?: string[]
  is_offered?: boolean
  is_featured?: boolean
  sort_order?: number
}

/** Edita un plan. Solo super-admin; la RPC lo vuelve a comprobar. */
export function useAdminUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (u: PlanUpdate) => {
      // En una firma con argumentos opcionales, un null a secas significa "no lo
      // toques": sin una bandera aparte no habría forma de PONER ilimitado. La
      // bandera es una sola para los dos topes porque "ilimitado" es una
      // propiedad del plan entero —así lo aplica `admin_update_plan`— y en el
      // formulario se marca con una casilla, no tope por tope.
      const clearMax = u.max_students === null || u.max_members === null
      const { error } = await supabase.rpc('admin_update_plan', {
        p_plan: u.plan,
        p_name: u.name ?? null,
        p_price_monthly: u.price_monthly ?? null,
        p_price_usd: u.price_usd ?? null,
        p_max_students: u.max_students ?? null,
        p_max_members: u.max_members ?? null,
        p_clear_max: clearMax,
        p_features: u.features ?? null,
        p_is_offered: u.is_offered ?? null,
        p_is_featured: u.is_featured ?? null,
        p_sort_order: u.sort_order ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['plan-settings'] })
      // El panel enseña cuántas cuentas hay en cada plan y con qué nombre.
      await qc.invalidateQueries({ queryKey: ['admin'] })
      // Los planes que tiene en memoria el AuthProvider se refrescan en su
      // propio `refresh()`. NO se llama desde aquí a `useAuth()` a propósito:
      // AuthProvider importa este módulo, y hacerlo al revés crearía un ciclo
      // de importación entre los dos.
    },
  })
}
