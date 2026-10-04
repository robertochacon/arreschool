import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { supabase } from '@/lib/supabase'
import type { AttendanceRecord, AttendanceStatus } from '@/types/db'

/**
 * Clave de la mutación que SÍ funciona sin conexión: pasar lista. Es lo que una
 * docente hace cada mañana en el aula, que es justo donde el wifi falla. Vive
 * aquí y no en el hook porque los defaults se registran en el queryClient (ver
 * abajo) y el hook solo la referencia.
 */
export const OFFLINE_SAVE_ATTENDANCE_KEY = ['saveAttendance'] as const

/**
 * Las marcas de la cola se ejecutan EN ORDEN (mismo `scope`): si la docente
 * marca "ausente" sin señal y luego lo corrige a "tardanza", al volver la red
 * tiene que llegar primero lo primero. Sin scope, react-query las lanzaría en
 * paralelo y la base podría quedarse con la versión vieja.
 */
export const ATTENDANCE_SCOPE = { id: 'attendance' } as const

export interface AttendanceMarkInput {
  enrollment_id: string
  /** null = borrar la marca de ese día (se marcó por error). */
  status: AttendanceStatus | null
  note: string | null
}

/**
 * Datos para guardar la asistencia de una sección en un día.
 *
 * Se define en este módulo, y no en `hooks/attendance.ts`, porque quien manda
 * sobre la forma es la cola: estos objetos se serializan a localStorage y pueden
 * volver a ejecutarse días después, en otra versión de la app. Cambiar un campo
 * aquí es cambiar el formato de algo ya guardado.
 *
 * No lleva id de cliente: la RPC `save_attendance` hace UPSERT por (inscripción,
 * día), así que repetirla es idempotente por naturaleza.
 */
export interface SaveAttendanceInput {
  /** Dueña de la operación encolada. `resumeIfAuthed` lo usa para no ejecutarla como otra. */
  created_by: string | null
  section_id: string
  /** 'YYYY-MM-DD' */
  date: string
  marks: AttendanceMarkInput[]
}

/** Fila de asistencia; `_pendingSync` = guardada en el teléfono, aún sin subir. */
export type AttendanceRow = AttendanceRecord & { _pendingSync?: true }

/**
 * Persistencia del cache de react-query en localStorage: lecturas disponibles
 * sin red + una cola de mutaciones que sobrevive a recargas y a cerrar la app.
 */
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'arreschool-query-cache',
  // Escribir en localStorage es síncrono y bloquea el hilo de la interfaz; con
  // throttle, una ráfaga de invalidaciones se guarda una sola vez.
  throttleTime: 1000,
})

/** Cuántas mutaciones esperan en la cola (pausadas por falta de red). */
export function pendingSyncCount(qc: QueryClient): number {
  return qc.getMutationCache().getAll().filter((m) => m.state.isPaused).length
}

/**
 * La mutación en cola no es de quien está usando la app ahora (o no hay sesión).
 *
 * Es un CENTINELA, no un fallo: se lanza antes de tocar la base para que la fila
 * NO se queme. La política de reintentos lo trata aparte (reintento eterno, cada
 * minuto), así que la mutación se queda esperando a su dueño en vez de agotar
 * los reintentos y morir en estado de error.
 */
export class NotMyQueueError extends Error {
  constructor() {
    super('La operación en cola es de otra sesión; se reintentará cuando vuelva su dueño')
    this.name = 'NotMyQueueError'
  }
}

/**
 * Registra los defaults de las mutaciones que deben funcionar sin conexión.
 *
 * Se hace a nivel de queryClient y NO dentro del hook: una mutación que quedó en
 * cola ayer se rehidrata al arrancar la app sin que ningún componente se haya
 * montado todavía, y react-query solo sabe cómo ejecutarla si encuentra estos
 * defaults ligados a su `mutationKey`. Si se registraran en el hook, la cola
 * quedaría con mutaciones sin `mutationFn`, imposibles de reanudar.
 *
 * Y la comprobación de sesión/dueño vive DENTRO del `mutationFn`, no fuera: el
 * `QueryClient.mount()` que dispara `QueryClientProvider` al montar se suscribe
 * por su cuenta a `focusManager` y a `onlineManager` y llama a
 * `resumePausedMutations()`, que reanuda TODA la cola sin mirar quién hay
 * conectado. Cualquier guard externo (como `resumeIfAuthed`) se lo salta la
 * propia librería; el único punto que no se puede esquivar es el camino de
 * ejecución de la mutación.
 */
export function registerOfflineMutations(qc: QueryClient) {
  qc.setMutationDefaults(OFFLINE_SAVE_ATTENDANCE_KEY, {
    // 'online': sin red la mutación se PAUSA y entra a la cola, que es justo lo
    // que queremos aquí. (El default global es 'always' para que el resto falle
    // rápido en vez de quedarse colgado.)
    networkMode: 'online',
    scope: ATTENDANCE_SCOPE,
    mutationFn: async (input: SaveAttendanceInput): Promise<number> => {
      // PRIMERA línea, antes de tocar la base: aquí es donde de verdad se sabe
      // quién está ejecutando esto, porque la librería puede haber reanudado la
      // cola por su cuenta (ver la nota de arriba). Sin sesión, o si la encoló
      // otra cuenta, se sale con el centinela SIN escribir: así no se gasta un
      // 42501 de RLS contra la fila y el dato sigue en la cola.
      // `getSession()` lee localStorage, no va a la red: es barato repetirlo.
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user?.id
      if (!uid) throw new NotMyQueueError()
      if (input.created_by && input.created_by !== uid) throw new NotMyQueueError()

      const { data: n, error } = await supabase.rpc('save_attendance', {
        p_section: input.section_id,
        p_date: input.date,
        p_marks: input.marks,
      })
      if (error) throw error
      return (n as number) ?? 0
    },
    // Optimista: la lista se ve marcada al instante. Corre igual aunque la
    // mutación quede pausada por falta de red, que es el caso que importa: sin
    // esto, quien pasa lista sin señal no ve nada y lo vuelve a marcar todo.
    onMutate: async (input: SaveAttendanceInput) => {
      const key = ['attendance', input.section_id, input.date]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<AttendanceRow[]>(key)
      const now = new Date().toISOString()
      const byEnrollment = new Map((prev ?? []).map((r) => [r.enrollment_id, r]))
      for (const m of input.marks) {
        if (!m.status) {
          byEnrollment.delete(m.enrollment_id)
          continue
        }
        const old = byEnrollment.get(m.enrollment_id)
        byEnrollment.set(m.enrollment_id, {
          id: old?.id ?? `pending-${m.enrollment_id}`,
          tenant_id: old?.tenant_id ?? '',
          enrollment_id: m.enrollment_id,
          section_id: input.section_id,
          date: input.date,
          status: m.status,
          note: m.note,
          recorded_by: input.created_by,
          created_at: old?.created_at ?? now,
          updated_at: now,
          _pendingSync: true,
        })
      }
      qc.setQueryData<AttendanceRow[]>(key, [...byEnrollment.values()])
      return { prev, key }
    },
    onError: (_err, _input, ctx) => {
      // Se restaura la foto exacta de antes: entre medias pudo llegar un refetch
      // y un filtro manual borraría datos buenos.
      const c = ctx as { prev?: AttendanceRow[]; key?: unknown[] } | undefined
      if (c?.key) qc.setQueryData(c.key, c.prev)
    },
    // Al sincronizar, refresca lo que la base guardó de verdad (la foto de
    // sección, quién lo registró) y los totales que dependen de la asistencia.
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ['attendance', input.section_id, input.date] })
      qc.invalidateQueries({ queryKey: ['attendance', 'enrollment'] })
      qc.invalidateQueries({ queryKey: ['report'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    // "No hay sesión / no es mío" no es un fallo: reintenta para siempre, una vez
    // por minuto, sin consumir el presupuesto de los 3 reintentos de verdad (los
    // que cubren un error de red o del servidor). Es lo que convierte la espera
    // en algo indefinido en vez de una cuenta atrás hacia perder el dato.
    retry: (n, err) => (err instanceof NotMyQueueError ? true : n < 3),
    retryDelay: (n, err) =>
      err instanceof NotMyQueueError ? 60_000 : Math.min(1000 * 2 ** n, 30_000),
  })

  // Al recuperar la red, intenta subir la cola — SOLO si hay sesión válida.
  onlineManager.subscribe((online) => {
    if (online) void resumeIfAuthed(qc)
  })
}

/**
 * Reanuda la cola SOLO si hay sesión autenticada, y solo lo del usuario actual.
 *
 * OJO: esto YA NO es la defensa que evita perder datos —esa vive dentro del
 * `mutationFn`, ver `NotMyQueueError`—, porque la librería reanuda la cola por
 * su cuenta desde `QueryClient.mount()` y nunca pasa por aquí. Lo de aquí es una
 * OPTIMIZACIÓN: despierta cuanto antes lo que sí se puede subir ahora mismo y
 * evita mover lo que se sabe que va a volver a quedarse esperando.
 *
 * Se miran las PAUSADAS (las que no salieron por falta de red) y también las
 * `pending`: una mutación que está esperando a que vuelva su dueño no está
 * pausada, está entre reintentos, y así es como se rehidrata tras una recarga.
 */
export async function resumeIfAuthed(qc: QueryClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) return // sin sesión: la cola queda PAUSADA, no se quema como anon
    const waiting = qc
      .getMutationCache()
      .getAll()
      .filter((m) => m.state.isPaused || m.state.status === 'pending')
    await Promise.all(
      waiting
        .filter((m) => {
          const vars = m.state.variables as { created_by?: string | null } | undefined
          // Sin `created_by` no se puede saber de quién es; se intenta, porque
          // dejarla pausada para siempre también sería perderla.
          return !vars?.created_by || vars.created_by === uid
        })
        // `.catch` por mutación: una que falle no debe abortar el resto.
        .map((m) => m.continue().catch(() => {})),
    )
  } catch {
    /* noop: sin sesión legible, la cola espera */
  }
}

/**
 * Sube la cola (si hay red y sesión) y espera a que drene. Úsalo ANTES de cerrar
 * sesión. Devuelve cuántas quedaron sin subir, para poder avisar.
 */
export async function flushOfflineQueue(qc: QueryClient): Promise<number> {
  if (onlineManager.isOnline()) {
    await resumeIfAuthed(qc)
  }
  return pendingSyncCount(qc)
}

/**
 * Limpia SOLO las lecturas (cache de consultas + cache de lecturas del service
 * worker) al cerrar sesión, por higiene en dispositivos compartidos.
 *
 * CONSERVA a propósito la cola de mutaciones: son datos que la persona ya dio
 * por guardados y que aún no llegaron al servidor. Se reintentarán cuando el
 * MISMO usuario vuelva a entrar con conexión. El persister vuelve a guardar el
 * estado (consultas vacías + cola intacta), así que la cola sobrevive.
 *
 * Si otra cuenta entra en el mismo dispositivo antes de que se sincronice, esas
 * mutaciones fallarán por RLS (otro tenant): falla segura, nunca una escritura
 * cruzada entre negocios.
 */
export async function clearOfflineCache(qc: QueryClient) {
  qc.getQueryCache().clear() // borra lecturas; NO toca la cola de mutaciones
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete('supabase-read')
    } catch {
      /* noop: sin service worker no hay nada que limpiar */
    }
  }
}
