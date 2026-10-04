import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { Tenant } from '@/types/db'

/**
 * Campos del negocio que se editan desde Configuración.
 *
 * `suspended_at` queda FUERA a propósito: es una decisión comercial del
 * super-admin y el trigger `tenants_guard` (0008) rechaza el cambio si viene de
 * cualquier otro. Listarlo aquí solo serviría para ofrecer un botón que la base
 * va a rebotar.
 */
export type TenantUpdate = Partial<
  Pick<
    Tenant,
    'name' | 'logo_url' | 'phone' | 'whatsapp' | 'email' | 'address' | 'currency' | 'locale'
  >
>

/**
 * Actualiza los datos del negocio.
 *
 * El `id` es opcional: si no viene se usa el del negocio de la sesión. La RLS de
 * `tenants` solo permite tocar `id = auth_tenant_id()`, así que mandar otro no
 * abre ninguna puerta — simplemente no afectaría a ninguna fila.
 */
export function useUpdateTenant() {
  const { tenant, refresh } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...patch }: TenantUpdate & { id?: string }) => {
      const tenantId = id ?? tenant?.id
      if (!tenantId) throw new Error('Sin negocio')
      const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId)
      if (error) throw error
    },
    // El nombre, el logo y la moneda los sirve el AuthProvider y no una consulta
    // de react-query: sin este refresh la cabecera seguiría pintando los datos
    // viejos hasta la próxima recarga completa.
    onSuccess: () => refresh(),
  })
}
