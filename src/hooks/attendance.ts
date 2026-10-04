import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  ATTENDANCE_SCOPE,
  OFFLINE_SAVE_ATTENDANCE_KEY,
  type AttendanceRow,
  type SaveAttendanceInput,
} from '@/lib/offline'
import type { AttendanceStatus } from '@/types/db'

// Los tipos de la cola viven en `@/lib/offline` (manda el formato serializado);
// se reexportan para que las pantallas solo conozcan este módulo.
export type { AttendanceRow, SaveAttendanceInput }
export type { AttendanceMarkInput } from '@/lib/offline'

/** Marcas de una sección en un día. La clave es la que actualiza la cola offline. */
export function useAttendance(sectionId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['attendance', sectionId, date],
    enabled: Boolean(sectionId && date),
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('section_id', sectionId!)
        .eq('date', date)
      if (error) throw error
      return (data ?? []) as AttendanceRow[]
    },
  })
}

/**
 * Pasar lista. Es la ÚNICA mutación que funciona sin conexión: la lógica
 * (guardia de sesión, optimista, reintentos, orden) está registrada en los
 * mutation-defaults de `@/lib/offline`, porque una lista que quedó en cola tiene
 * que poder subirse al arrancar la app, antes de que se monte ninguna pantalla.
 *
 * Quien la llama construye el input completo, incluido `created_by` (de
 * `useAuth()`), que es lo que impide que la cola se ejecute como otra cuenta.
 * Usa `mutate`, no `mutateAsync`: sin red la mutación queda PAUSADA y su
 * promesa no resolvería nunca.
 */
export function useSaveAttendance() {
  return useMutation<number, Error, SaveAttendanceInput>({
    mutationKey: OFFLINE_SAVE_ATTENDANCE_KEY,
    scope: ATTENDANCE_SCOPE,
  })
}

/** Resumen de asistencia de una inscripción (ficha del estudiante). */
export interface AttendanceSummary {
  present: number
  absent: number
  late: number
  excused: number
  total: number
  /** Últimas ausencias/tardanzas, para ver el patrón de un vistazo. */
  recent: { date: string; status: AttendanceStatus; note: string | null }[]
}

export function useEnrollmentAttendance(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', 'enrollment', enrollmentId],
    enabled: Boolean(enrollmentId),
    queryFn: async (): Promise<AttendanceSummary> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('date, status, note')
        .eq('enrollment_id', enrollmentId!)
        .order('date', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as { date: string; status: AttendanceStatus; note: string | null }[]
      const count = (s: AttendanceStatus) => rows.filter((r) => r.status === s).length
      return {
        present: count('present'),
        absent: count('absent'),
        late: count('late'),
        excused: count('excused'),
        total: rows.length,
        recent: rows.filter((r) => r.status !== 'present').slice(0, 10),
      }
    },
  })
}
