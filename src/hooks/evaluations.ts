import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AchievementLevel,
  Assessment,
  Competency,
  Enrollment,
  GradingTerm,
  Indicator,
  ObservationCategory,
  ReportCard,
  StudentObservation,
} from '@/types/db'

/*
 * Evaluaciones de inicial: competencias → indicadores → nivel por corte.
 * Calificar y generar boletines pasan por RPC (una ida y vuelta por estudiante
 * o por sección); el resto son lecturas y escrituras directas con RLS.
 */

// ── Currículo: competencias e indicadores ───────────────────────────────────

export type CompetencyRow = Competency & { indicators: Indicator[] }

/** Todas las competencias con sus indicadores, en el orden del boletín. */
export function useCompetencies() {
  return useQuery({
    queryKey: ['competencies'],
    queryFn: async (): Promise<CompetencyRow[]> => {
      const { data, error } = await supabase
        .from('competencies')
        .select('*, indicators(*)')
        .order('sort_order')
        .order('area')
        .order('name')
      if (error) throw error
      const rows = (data ?? []) as unknown as CompetencyRow[]
      for (const c of rows) c.indicators.sort((a, b) => a.sort_order - b.sort_order)
      return rows
    },
  })
}

/** Las que aplican a un grado: las suyas + las transversales (grade_level_id null). */
export function competenciesForGrade(all: CompetencyRow[], gradeLevelId: string | undefined) {
  return all.filter((c) => c.active && (c.grade_level_id === null || c.grade_level_id === gradeLevelId))
}

export interface CompetencyInput {
  grade_level_id: string | null
  area: string
  name: string
  description: string | null
  sort_order: number
  active: boolean
}

export function useSaveCompetency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: CompetencyInput & { id?: string }) => {
      const q = id
        ? supabase.from('competencies').update(input).eq('id', id)
        : supabase.from('competencies').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competencies'] }),
  })
}

export function useDeleteCompetency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('competencies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competencies'] }),
  })
}

export interface IndicatorInput {
  competency_id: string
  description: string
  sort_order: number
  active: boolean
}

export function useSaveIndicator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<IndicatorInput> & { id?: string }) => {
      const q = id
        ? supabase.from('indicators').update(input).eq('id', id)
        : supabase.from('indicators').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competencies'] }),
  })
}

export function useDeleteIndicator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('indicators').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competencies'] }),
  })
}

// ── Calificar ───────────────────────────────────────────────────────────────

/** Evaluaciones de una sección en un corte (la rejilla de calificar). */
export function useSectionAssessments(sectionId: string | undefined, termId: string | undefined) {
  return useQuery({
    queryKey: ['assessments', sectionId, termId],
    enabled: Boolean(sectionId && termId),
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('section_id', sectionId!)
        .eq('grading_term_id', termId!)
      if (error) throw error
      return (data ?? []) as Assessment[]
    },
  })
}

export interface AssessmentMark {
  indicator_id: string
  /** Vacío (null en level y score) = quitar la evaluación de ese indicador. */
  level: AchievementLevel | null
  score: number | null
  comment: string | null
}

/** Guarda las marcas de UN estudiante en un corte (RPC idempotente). */
export function useSaveAssessments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { enrollment_id: string; term_id: string; marks: AssessmentMark[] }) => {
      const { error } = await supabase.rpc('save_assessments', {
        p_enrollment: v.enrollment_id,
        p_term: v.term_id,
        p_marks: v.marks,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  })
}

// ── Anecdotario ─────────────────────────────────────────────────────────────

export function useObservations(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ['observations', enrollmentId],
    enabled: Boolean(enrollmentId),
    queryFn: async (): Promise<StudentObservation[]> => {
      const { data, error } = await supabase
        .from('student_observations')
        .select('*')
        .eq('enrollment_id', enrollmentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as StudentObservation[]
    },
  })
}

export interface ObservationInput {
  enrollment_id: string
  grading_term_id: string | null
  category: ObservationCategory
  body: string
  visible_to_family: boolean
}

export function useSaveObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: ObservationInput & { id?: string }) => {
      const q = id
        ? supabase.from('student_observations').update(input).eq('id', id)
        : supabase.from('student_observations').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['observations', v.enrollment_id] }),
  })
}

export function useDeleteObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: Pick<StudentObservation, 'id' | 'enrollment_id'>) => {
      const { error } = await supabase.from('student_observations').delete().eq('id', o.id)
      if (error) throw error
    },
    onSuccess: (_d, o) => qc.invalidateQueries({ queryKey: ['observations', o.enrollment_id] }),
  })
}

// ── Boletines ───────────────────────────────────────────────────────────────

export function useReportCards(sectionId: string | undefined, termId: string | undefined) {
  return useQuery({
    queryKey: ['report-cards', sectionId, termId],
    enabled: Boolean(sectionId && termId),
    queryFn: async (): Promise<ReportCard[]> => {
      const { data, error } = await supabase
        .from('report_cards')
        .select('*')
        .eq('section_id', sectionId!)
        .eq('grading_term_id', termId!)
      if (error) throw error
      return (data ?? []) as ReportCard[]
    },
  })
}

/** Un boletín para imprimir. Todo lo que pinta está en su `snapshot`. */
export function useReportCard(id: string | undefined) {
  return useQuery({
    queryKey: ['report-card', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ReportCard | null> => {
      const { data, error } = await supabase.from('report_cards').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return (data as ReportCard | null) ?? null
    },
  })
}

/** Boletines de un estudiante en todos sus años (ficha → historial). */
export type StudentReportCardRow = Pick<ReportCard, 'id' | 'status' | 'published_at' | 'created_at'> & {
  term: Pick<GradingTerm, 'id' | 'name' | 'sort_order'> | null
  enrollment: Pick<Enrollment, 'id' | 'academic_period_id' | 'student_id'> | null
}

export function useStudentReportCards(studentId: string | undefined) {
  return useQuery({
    queryKey: ['report-cards', 'student', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<StudentReportCardRow[]> => {
      const { data, error } = await supabase
        .from('report_cards')
        .select(
          'id, status, published_at, created_at, term:grading_terms(id, name, sort_order), ' +
            'enrollment:enrollments!inner(id, academic_period_id, student_id)',
        )
        .eq('enrollment.student_id', studentId!)
      if (error) throw error
      return (data ?? []) as unknown as StudentReportCardRow[]
    },
  })
}

/** (Re)genera los BORRADORES de una sección; los publicados se cuentan en `skipped`. */
export function useGenerateReportCards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { section_id: string; term_id: string }): Promise<{ generated: number; skipped: number }> => {
      const { data, error } = await supabase.rpc('generate_report_cards', {
        p_section: v.section_id,
        p_term: v.term_id,
      })
      if (error) throw error
      return data as { generated: number; skipped: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-cards'] })
      qc.invalidateQueries({ queryKey: ['report-card'] })
    },
  })
}

/** Publica (o devuelve a borrador) los boletines de una sección. Solo Dirección. */
export function usePublishReportCards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { section_id: string; term_id: string; publish: boolean }): Promise<number> => {
      const { data, error } = await supabase.rpc('publish_report_cards', {
        p_section: v.section_id,
        p_term: v.term_id,
        p_publish: v.publish,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-cards'] })
      qc.invalidateQueries({ queryKey: ['report-card'] })
    },
  })
}

/** Comentario general del boletín: lo único editable desde el cliente, y solo en borrador. */
export function useUpdateReportCardComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; general_comment: string | null }) => {
      const { error } = await supabase
        .from('report_cards')
        .update({ general_comment: v.general_comment })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['report-cards'] })
      qc.invalidateQueries({ queryKey: ['report-card', v.id] })
    },
  })
}
