import { useAuth } from '@/auth/AuthProvider'
import type { MemberRole } from '@/types/db'

/**
 * Matriz de permisos del colegio — ESPEJO de los predicados `auth_can_*()` de
 * la base (migración 0013).
 *
 * No es seguridad: la base vuelve a decidir en cada fila y en cada RPC. Existe
 * para no enseñar botones que van a fallar con un 42501, que para quien usa la
 * app se lee como "la aplicación está rota". Si cambias un rol de un lado,
 * cámbialo del otro en el mismo commit.
 */
export type Permission =
  /** Años, cortes, grados, secciones, docentes, competencias. */
  | 'manageAcademics'
  /** Estudiantes, familias, documentos, inscripciones, comunicados a todos. */
  | 'manageStudents'
  /** Ver cuentas, crear cargos y cobrar (caja). */
  | 'handleFinance'
  /** Conceptos, generación masiva y anulaciones. */
  | 'manageFinance'
  /** Invitar, cambiar roles y quitar personas del equipo. */
  | 'manageTeam'

const MATRIX: Record<Permission, readonly MemberRole[]> = {
  manageAcademics: ['owner', 'admin'],
  manageStudents: ['owner', 'admin', 'secretary'],
  handleFinance: ['owner', 'admin', 'accountant', 'secretary'],
  manageFinance: ['owner', 'admin', 'accountant'],
  manageTeam: ['owner'],
}

export function roleCan(role: MemberRole | null | undefined, permission: Permission): boolean {
  return Boolean(role && MATRIX[permission].includes(role))
}

/**
 * `can('handleFinance')` para la persona conectada. Una docente nunca ve el
 * menú de Finanzas; la base, además, no le devolvería ni una fila.
 */
export function usePermissions() {
  const { profile } = useAuth()
  const role = profile?.role ?? null
  return {
    role,
    can: (permission: Permission) => roleCan(role, permission),
    /** Docente pura: la app le abre directamente lo suyo (asistencia, evaluaciones). */
    isTeacher: role === 'teacher',
  }
}
