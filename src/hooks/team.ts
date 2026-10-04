import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { MemberRole } from '@/types/db'

export interface TeamMember {
  id: string
  full_name: string | null
  role: MemberRole
  created_at: string
}

/**
 * Miembros del colegio.
 *
 * Sin `.eq('tenant_id', …)`: la RLS de `profiles` ya limita el SELECT al propio
 * colegio. Filtrar aquí además no daría más seguridad y sí una forma de que la
 * lista salga vacía por un id todavía sin cargar.
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: ['team', 'members'],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
  })
}

export interface Invite {
  id: string
  /** Secreto tipo "quien lo tenga, entra". Solo la dueña puede leerlo. */
  code: string
  email: string | null
  role: MemberRole
  expires_at: string
  accepted_at: string | null
  created_at: string
}

/**
 * Invitaciones sin canjear.
 *
 * Se traen también las VENCIDAS (solo se filtra `accepted_at`): siguen siendo
 * filas que la dueña ve y revoca, y esconderlas dejaría en la tabla enlaces que
 * ella cree que ya no existen. La pantalla las marca comparando `expires_at`.
 */
export function usePendingInvites() {
  return useQuery({
    queryKey: ['team', 'invites'],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('tenant_invites')
        .select('id, code, email, role, expires_at, accepted_at, created_at')
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invite[]
    },
  })
}

/**
 * Crea una invitación y devuelve su CÓDIGO, que es lo que se comparte.
 *
 * Pasa por la RPC y no por un insert: `tenant_invites` no tiene política de
 * INSERT a propósito. La RPC comprueba que quien invita sea la dueña y que el
 * plan admita más de un usuario (error `PLAN_LIMIT_MEMBERS: …`, que
 * `errorMessage()` limpia antes de enseñarlo).
 */
export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    // El rol viaja en la invitación y lo aplica `accept_invite`: quien canjea el
    // código no lo elige. 'owner' lo rechaza la base (0018).
    mutationFn: async (v: { role: MemberRole; email?: string | null }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_role: v.role,
        p_email: v.email ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', 'invites'] }),
  })
}

/** Revoca una invitación: borrar la fila invalida el enlace al instante. */
export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tenant_invites').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', 'invites'] }),
  })
}

/**
 * Canjea un código y devuelve el id del colegio al que se entró.
 *
 * El canje es atómico dentro de la RPC (un UPDATE condicional sobre la fila): dos
 * personas con el mismo enlace no pueden entrar las dos.
 */
export function useAcceptInvite() {
  const qc = useQueryClient()
  const { refresh } = useAuth()
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_invite', { p_code: code.trim() })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      // La cuenta acaba de PASAR de "sin colegio" a tener uno: el perfil que
      // guarda el AuthProvider (y del que dependen los guards de ruta) está
      // obsoleto, y todo lo cacheado se leyó cuando no había colegio, así que se
      // invalida entero en vez de ir clave por clave.
      await refresh()
      await qc.invalidateQueries()
    },
  })
}

/** Cambia el rol de alguien del equipo. Solo la Dirección (owner); la RPC lo comprueba. */
export function useSetMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userId: string; role: MemberRole }) => {
      const { error } = await supabase.rpc('set_member_role', { p_user: v.userId, p_role: v.role })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })
}

/**
 * Saca a alguien del colegio. Su cuenta de acceso sigue existiendo (puede
 * crear o unirse a otro colegio); su ficha de docente, si la tenía, se conserva
 * sin enlace.
 */
export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_member', { p_user: userId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      qc.invalidateQueries({ queryKey: ['teachers'] })
      qc.invalidateQueries({ queryKey: ['sections'] })
    },
  })
}
