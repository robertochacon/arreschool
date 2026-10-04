import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AcademicPeriod,
  Enrollment,
  EnrollmentStatus,
  GradeLevel,
  Section,
  Student,
} from '@/types/db'

/*
 * Inscripciones: el paso de un estudiante por un año escolar. Asignar sección,
 * retirar o marcar como repitente son UPDATE de esta tabla; la base valida que
 * la sección sea del mismo año y grado (FK compuesta), la capacidad
 * (SECCION_LLENA) y que el año no esté cerrado (PERIODO_CERRADO).
 */

/** Inscripción con lo necesario para listarla sin más consultas. */
export type EnrollmentRow = Enrollment & {
  student: Pick<
    Student,
    'id' | 'code' | 'first_name' | 'last_name' | 'status' | 'gender' | 'birth_date' | 'allergies' | 'photo_path'
  > | null
  grade_level: Pick<GradeLevel, 'id' | 'name' | 'sort_order'> | null
  section: Pick<Section, 'id' | 'name'> | null
}

const ENROLLMENT_SELECT =
  '*, student:students(id, code, first_name, last_name, status, gender, birth_date, allergies, photo_path), ' +
  'grade_level:grade_levels(id, name, sort_order), section:sections(id, name)'

function byStudentName(a: EnrollmentRow, b: EnrollmentRow) {
  return (
    (a.student?.last_name ?? '').localeCompare(b.student?.last_name ?? '', 'es') ||
    (a.student?.first_name ?? '').localeCompare(b.student?.first_name ?? '', 'es')
  )
}

/** Todas las inscripciones de un año (el listado de Inscripciones). */
export function useEnrollments(periodId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(ENROLLMENT_SELECT)
        .eq('academic_period_id', periodId!)
      if (error) throw error
      return ((data ?? []) as unknown as EnrollmentRow[]).sort(byStudentName)
    },
  })
}

/**
 * Lista de clase: inscritos ACTIVOS de una sección, por apellido. Es la base de
 * pasar lista, calificar y generar boletines.
 */
export function useSectionRoster(sectionId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'section', sectionId],
    enabled: Boolean(sectionId),
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(ENROLLMENT_SELECT)
        .eq('section_id', sectionId!)
        .eq('status', 'enrolled')
      if (error) throw error
      return ((data ?? []) as unknown as EnrollmentRow[]).sort(byStudentName)
    },
  })
}

/** Historial de un estudiante: una inscripción por año, la más reciente primero. */
export type StudentEnrollmentRow = Enrollment & {
  period: Pick<AcademicPeriod, 'id' | 'name' | 'starts_on' | 'ends_on' | 'status'> | null
  grade_level: Pick<GradeLevel, 'id' | 'name'> | null
  section: Pick<Section, 'id' | 'name'> | null
}

export function useStudentEnrollments(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-enrollments', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<StudentEnrollmentRow[]> => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(
          '*, period:academic_periods(id, name, starts_on, ends_on, status), ' +
            'grade_level:grade_levels(id, name), section:sections(id, name)',
        )
        .eq('student_id', studentId!)
      if (error) throw error
      return ((data ?? []) as unknown as StudentEnrollmentRow[]).sort((a, b) =>
        (b.period?.starts_on ?? '').localeCompare(a.period?.starts_on ?? ''),
      )
    },
  })
}

function invalidateEnrollments(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['enrollments'] })
  qc.invalidateQueries({ queryKey: ['student-enrollments'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['report'] })
}

export interface EnrollInput {
  student_id: string
  academic_period_id: string
  grade_level_id: string
  section_id: string | null
  enrolled_on?: string
  notes?: string | null
}

/** Inscribe y devuelve la inscripción (para poder generarle el cargo de inscripción). */
export function useEnrollStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EnrollInput): Promise<Enrollment> => {
      const { data, error } = await supabase.from('enrollments').insert(input).select('*').single()
      if (error) throw error
      return data as Enrollment
    },
    onSuccess: () => invalidateEnrollments(qc),
  })
}

export interface EnrollmentUpdate {
  grade_level_id?: string
  section_id?: string | null
  status?: EnrollmentStatus
  ended_on?: string | null
  end_reason?: string | null
  notes?: string | null
}

export function useUpdateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: EnrollmentUpdate & { id: string }) => {
      const { error } = await supabase.from('enrollments').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateEnrollments(qc),
  })
}

/**
 * Asigna la misma sección a varios inscritos de una vez (el caso de agosto: 25
 * niños nuevos de Pre-Kinder a "Pre-Kinder A"). Una sola llamada; si la sección
 * se llena a mitad, la base rechaza TODO el lote con SECCION_LLENA y no queda
 * un reparto a medias.
 */
export function useAssignSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { ids: string[]; section_id: string | null }) => {
      if (v.ids.length === 0) return
      const { error } = await supabase.from('enrollments').update({ section_id: v.section_id }).in('id', v.ids)
      if (error) throw error
    },
    onSuccess: () => invalidateEnrollments(qc),
  })
}

/** Borra una inscripción hecha por error (sin asistencia, notas ni cargos). */
export function useDeleteEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('enrollments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateEnrollments(qc),
  })
}
