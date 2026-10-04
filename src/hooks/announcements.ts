import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Announcement, AnnouncementAudience, GradeLevel, Section } from '@/types/db'

export type AnnouncementRow = Announcement & {
  grade_level: Pick<GradeLevel, 'id' | 'name'> | null
  section: (Pick<Section, 'id' | 'name'> & { grade_level: Pick<GradeLevel, 'id' | 'name'> | null }) | null
}

/** Comunicados del colegio: fijados primero, luego lo más reciente. */
export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*, grade_level:grade_levels(id, name), section:sections(id, name, grade_level:grade_levels(id, name))')
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as AnnouncementRow[]
    },
  })
}

export interface AnnouncementInput {
  title: string
  body: string
  audience: AnnouncementAudience
  /** Solo con audiencia 'grade_level'; la base exige que cuadre (check). */
  grade_level_id: string | null
  /** Solo con audiencia 'section'. */
  section_id: string | null
  pinned: boolean
  expires_on: string | null
}

export function useSaveAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: AnnouncementInput & { id?: string }) => {
      const q = id
        ? supabase.from('announcements').update(input).eq('id', id)
        : supabase.from('announcements').insert(input)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}
