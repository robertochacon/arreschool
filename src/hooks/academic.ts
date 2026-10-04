import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type {
  AcademicPeriod,
  EducationLevel,
  GradeLevel,
  GradingTerm,
  Section,
  SectionTeacher,
  SectionTeacherRole,
  StaffStatus,
  Teacher,
  TeamMemberWithEmail,
} from '@/types/db'

/*
 * Estructura del colegio: años, cortes, grados, secciones y docentes.
 *
 * Ninguna consulta filtra por `tenant_id`: la RLS ya limita cada SELECT al
 * colegio de quien pregunta, y ninguna escritura lo manda: la base lo pone con
 * `default auth_tenant_id()` y rechaza cualquier otro (enforce_tenant_row). Un
 * `.eq('tenant_id', …)` aquí no añadiría seguridad y sí una forma de que la
 * lista salga vacía por un id todavía sin cargar.
 */

/** Todo lo que cambia cuando se toca la estructura: las pantallas la cruzan entre sí. */
function invalidateStructure(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['periods'] })
  qc.invalidateQueries({ queryKey: ['sections'] })
  qc.invalidateQueries({ queryKey: ['enrollments'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

// ── Años escolares ──────────────────────────────────────────────────────────

export function usePeriods() {
  return useQuery({
    queryKey: ['periods'],
    queryFn: async (): Promise<AcademicPeriod[]> => {
      const { data, error } = await supabase
        .from('academic_periods')
        .select('*')
        .order('starts_on', { ascending: false })
      if (error) throw error
      return (data ?? []) as AcademicPeriod[]
    },
  })
}

/**
 * El año en curso y la lista completa. Casi todas las pantallas arrancan "en el
 * año activo"; si no hay ninguno, en el más reciente, para que un colegio que
 * aún prepara su primer año no vea pantallas vacías.
 */
export function useCurrentPeriod() {
  const q = usePeriods()
  const periods = useMemo(() => q.data ?? [], [q.data])
  const current = periods.find((p) => p.status === 'active') ?? periods[0] ?? null
  return { ...q, periods, current }
}

export interface PeriodInput {
  name: string
  starts_on: string
  ends_on: string
}

export function useSavePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: PeriodInput & { id?: string }) => {
      const q = id
        ? supabase.from('academic_periods').update(input).eq('id', id)
        : supabase.from('academic_periods').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => invalidateStructure(qc),
  })
}

export function useDeletePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('academic_periods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateStructure(qc),
  })
}

/** Activa un año. Solo puede haber uno: la RPC da el mensaje claro si ya hay otro. */
export function useActivatePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('activate_academic_period', { p_period: id })
      if (error) throw error
    },
    onSuccess: () => invalidateStructure(qc),
  })
}

/**
 * Cierra un año: estado final de cada inscripción (promovido / completó) y año
 * congelado. Irreversible a propósito: es lo que hace fiable el historial.
 */
export function useClosePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<{ promoted: number; completed: number }> => {
      const { data, error } = await supabase.rpc('close_academic_period', { p_period: id })
      if (error) throw error
      return data as { promoted: number; completed: number }
    },
    onSuccess: () => {
      invalidateStructure(qc)
      qc.invalidateQueries({ queryKey: ['grading-terms'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['student-enrollments'] })
    },
  })
}

/** Reinscribe en el año nuevo a promovidos (grado siguiente) y repitentes (mismo grado). */
export function usePromoteStudents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { from: string; to: string }): Promise<{ created: number; skipped: number }> => {
      const { data, error } = await supabase.rpc('promote_students', {
        p_from_period: v.from,
        p_to_period: v.to,
      })
      if (error) throw error
      return data as { created: number; skipped: number }
    },
    onSuccess: () => {
      invalidateStructure(qc)
      qc.invalidateQueries({ queryKey: ['student-enrollments'] })
    },
  })
}

// ── Cortes de evaluación ────────────────────────────────────────────────────

export function useGradingTerms(periodId: string | undefined) {
  return useQuery({
    queryKey: ['grading-terms', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<GradingTerm[]> => {
      const { data, error } = await supabase
        .from('grading_terms')
        .select('*')
        .eq('academic_period_id', periodId!)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as GradingTerm[]
    },
  })
}

export interface GradingTermInput {
  academic_period_id: string
  name: string
  sort_order: number
  starts_on: string | null
  ends_on: string | null
  is_closed?: boolean
}

export function useSaveGradingTerm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<GradingTermInput> & { id?: string }) => {
      const q = id
        ? supabase.from('grading_terms').update(input).eq('id', id)
        : supabase.from('grading_terms').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grading-terms'] })
      qc.invalidateQueries({ queryKey: ['report-cards'] })
    },
  })
}

export function useDeleteGradingTerm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grading_terms').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grading-terms'] }),
  })
}

// ── Grados ──────────────────────────────────────────────────────────────────

export function useGradeLevels() {
  return useQuery({
    queryKey: ['grade-levels'],
    queryFn: async (): Promise<GradeLevel[]> => {
      const { data, error } = await supabase
        .from('grade_levels')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as GradeLevel[]
    },
  })
}

export interface GradeLevelInput {
  name: string
  education_level: EducationLevel
  sort_order: number
  active: boolean
}

export function useSaveGradeLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: GradeLevelInput & { id?: string }) => {
      const q = id
        ? supabase.from('grade_levels').update(input).eq('id', id)
        : supabase.from('grade_levels').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-levels'] })
      invalidateStructure(qc)
    },
  })
}

export function useDeleteGradeLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grade_levels').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grade-levels'] }),
  })
}

// ── Docentes ────────────────────────────────────────────────────────────────

export function useTeachers() {
  return useQuery({
    queryKey: ['teachers'],
    queryFn: async (): Promise<Teacher[]> => {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('last_name')
        .order('first_name')
      if (error) throw error
      return (data ?? []) as Teacher[]
    },
  })
}

export interface TeacherInput {
  first_name: string
  last_name: string
  document_id: string | null
  email: string | null
  phone: string | null
  specialty: string | null
  hired_on: string | null
  status: StaffStatus
  notes: string | null
  /** Cuenta con rol docente que usa esta ficha. La base exige que sea del colegio. */
  user_id: string | null
}

export function useSaveTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: TeacherInput & { id?: string }) => {
      const q = id
        ? supabase.from('teachers').update(input).eq('id', id)
        : supabase.from('teachers').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teachers'] })
      // Las secciones muestran el nombre de su docente.
      qc.invalidateQueries({ queryKey: ['sections'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teachers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teachers'] })
      qc.invalidateQueries({ queryKey: ['sections'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/**
 * Miembros del equipo con su correo, para enlazar una ficha de docente con la
 * cuenta que la usa. Solo Dirección: la RPC lo comprueba.
 */
export function useTeamMembersWithEmail(enabled = true) {
  return useQuery({
    queryKey: ['team', 'members-email'],
    enabled,
    queryFn: async (): Promise<TeamMemberWithEmail[]> => {
      const { data, error } = await supabase.rpc('list_team_members')
      if (error) throw error
      return (data ?? []) as TeamMemberWithEmail[]
    },
  })
}

// ── Secciones ───────────────────────────────────────────────────────────────

/** Sección con su grado y sus docentes, que es como la pinta cualquier pantalla. */
export type SectionRow = Section & {
  grade_level: Pick<GradeLevel, 'id' | 'name' | 'sort_order' | 'education_level'> | null
  section_teachers: (Pick<SectionTeacher, 'id' | 'role' | 'subject' | 'teacher_id'> & {
    teacher: Pick<Teacher, 'id' | 'first_name' | 'last_name' | 'user_id' | 'status'> | null
  })[]
}

const SECTION_SELECT =
  '*, grade_level:grade_levels(id, name, sort_order, education_level), ' +
  'section_teachers(id, role, subject, teacher_id, teacher:teachers(id, first_name, last_name, user_id, status))'

/** Nombre corto de una sección: "Kinder A". */
export function sectionLabel(s: Pick<SectionRow, 'name' | 'grade_level'> | null | undefined): string {
  if (!s) return 'Sin sección'
  return `${s.grade_level?.name ?? ''} ${s.name}`.trim()
}

/** Secciones de un año, ordenadas como el colegio ordena sus grados. */
export function useSections(periodId: string | undefined) {
  return useQuery({
    queryKey: ['sections', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<SectionRow[]> => {
      const { data, error } = await supabase
        .from('sections')
        .select(SECTION_SELECT)
        .eq('academic_period_id', periodId!)
      if (error) throw error
      // Orden en el cliente: PostgREST no ordena por una columna embebida sin
      // complicar la consulta, y son pocas filas.
      return ((data ?? []) as unknown as SectionRow[]).sort(
        (a, b) =>
          (a.grade_level?.sort_order ?? 0) - (b.grade_level?.sort_order ?? 0) ||
          a.name.localeCompare(b.name, 'es'),
      )
    },
  })
}

/**
 * Las secciones que da la persona conectada (docente), dentro de un año.
 * Dirección y Secretaría reciben TODAS: pueden pasar lista en cualquiera, igual
 * que permite `auth_teaches_section()` en la base.
 */
export function useMySections(periodId: string | undefined, seeAll: boolean) {
  const { user } = useAuth()
  const q = useSections(periodId)
  const sections = useMemo(() => {
    const all = q.data ?? []
    if (seeAll) return all
    return all.filter((s) =>
      s.section_teachers.some((st) => st.teacher?.user_id === user?.id && st.teacher?.status === 'active'),
    )
  }, [q.data, seeAll, user?.id])
  return { ...q, sections }
}

export interface SectionInput {
  academic_period_id: string
  grade_level_id: string
  name: string
  capacity: number | null
  room: string | null
  shift: string | null
}

export function useSaveSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: SectionInput & { id?: string }) => {
      const q = id
        ? supabase.from('sections').update(input).eq('id', id)
        : supabase.from('sections').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => invalidateStructure(qc),
  })
}

export function useDeleteSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateStructure(qc),
  })
}

export function useAssignSectionTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      section_id: string
      teacher_id: string
      role: SectionTeacherRole
      subject?: string | null
    }) => {
      const { error } = await supabase.from('section_teachers').insert({ ...v, subject: v.subject ?? null })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections'] }),
  })
}

export function useRemoveSectionTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('section_teachers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections'] }),
  })
}
