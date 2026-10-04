import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { removeFile, signedFileUrl, uploadFile } from '@/lib/storage'
import type {
  DocumentKind,
  Guardian,
  GuardianRelationship,
  Student,
  StudentDocument,
  StudentGuardian,
  StudentStatus,
} from '@/types/db'

/*
 * Estudiantes y familias. Igual que en el resto de hooks: sin `tenant_id` ni en
 * los filtros (lo pone la RLS) ni en las escrituras (lo pone la base).
 */

function invalidateStudents(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: ['students'] })
  if (id) qc.invalidateQueries({ queryKey: ['student', id] })
  qc.invalidateQueries({ queryKey: ['student-accounts'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

// ── Estudiantes ─────────────────────────────────────────────────────────────

/**
 * Todos los estudiantes del colegio (activos e históricos). Filtrado y
 * paginación en el cliente, como el molde del starter: el plan topa los activos
 * y un colegio de inicial cabe en memoria; además es lo único que funciona con
 * la lista cacheada sin conexión.
 */
export function useStudents() {
  return useQuery({
    queryKey: ['students'],
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('last_name')
        .order('first_name')
      if (error) throw error
      return (data ?? []) as Student[]
    },
  })
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ['student', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Student | null> => {
      const { data, error } = await supabase.from('students').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return (data as Student | null) ?? null
    },
  })
}

/** Campos editables. `code` vacío = la base asigna la matrícula (EST-000001…). */
export interface StudentInput {
  code?: string | null
  first_name: string
  last_name: string
  birth_date: string | null
  gender: Student['gender']
  document_id: string | null
  nationality: string | null
  address: string | null
  blood_type: string | null
  allergies: string | null
  medical_notes: string | null
  status: StudentStatus
  admission_date: string
  notes: string | null
}

/** Crea y DEVUELVE el estudiante: el flujo sigue con vincular familia e inscribir. */
export function useCreateStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: StudentInput): Promise<Student> => {
      const { data, error } = await supabase
        .from('students')
        .insert({ ...input, code: input.code?.trim() || null })
        .select('*')
        .single()
      if (error) throw error
      return data as Student
    },
    onSuccess: (s) => invalidateStudents(qc, s.id),
  })
}

export function useUpdateStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<StudentInput> & { id: string }) => {
      const { error } = await supabase.from('students').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => invalidateStudents(qc, v.id),
  })
}

/**
 * Borra un estudiante SIN historia (alta por error). Con inscripciones o pagos
 * la base lo impide (FK restrict) y `errorMessage()` sugiere marcarlo retirado.
 */
export function useDeleteStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ['student', id] })
      invalidateStudents(qc)
    },
  })
}

/**
 * Sube o cambia la foto. Va al bucket PRIVADO (`files`), no a `logos`: es la
 * cara de un menor y no puede quedar en una URL pública. Se muestra con URL
 * firmada (`useSignedUrl`).
 */
export function useUploadStudentPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { student: Student; file: File }) => {
      const { path } = await uploadFile('files', v.student.tenant_id, v.file, `students/${v.student.id}/photo-`)
      const { error } = await supabase.from('students').update({ photo_path: path }).eq('id', v.student.id)
      if (error) {
        await removeFile('files', path).catch(() => {})
        throw error
      }
      // La foto anterior ya no la referencia nadie: se borra para no pagar por ella.
      if (v.student.photo_path) await removeFile('files', v.student.photo_path).catch(() => {})
    },
    onSuccess: (_d, v) => invalidateStudents(qc, v.student.id),
  })
}

/**
 * URL firmada de un archivo privado. Se cachea 50 minutos (la firma dura 60):
 * así una lista con fotos no pide una firma nueva en cada render, y nunca se
 * pinta una que ya caducó.
 */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
    queryFn: () => signedFileUrl(path!),
  })
}

// ── Familias ────────────────────────────────────────────────────────────────

/** Tutor con los estudiantes a los que está vinculado (hermanos incluidos). */
export type GuardianRow = Guardian & {
  student_guardians: (Pick<StudentGuardian, 'id' | 'relationship' | 'is_primary' | 'student_id'> & {
    student: Pick<Student, 'id' | 'first_name' | 'last_name' | 'status' | 'code'> | null
  })[]
}

export function useGuardians() {
  return useQuery({
    queryKey: ['guardians'],
    queryFn: async (): Promise<GuardianRow[]> => {
      const { data, error } = await supabase
        .from('guardians')
        .select(
          '*, student_guardians(id, relationship, is_primary, student_id, student:students(id, first_name, last_name, status, code))',
        )
        .order('last_name')
        .order('first_name')
      if (error) throw error
      return (data ?? []) as unknown as GuardianRow[]
    },
  })
}

export interface GuardianInput {
  first_name: string
  last_name: string
  document_id: string | null
  phone: string | null
  phone_alt: string | null
  email: string | null
  occupation: string | null
  workplace: string | null
  address: string | null
  notes: string | null
}

function invalidateFamilies(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['guardians'] })
  qc.invalidateQueries({ queryKey: ['student-guardians'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

export function useCreateGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GuardianInput): Promise<Guardian> => {
      const { data, error } = await supabase.from('guardians').insert(input).select('*').single()
      if (error) throw error
      return data as Guardian
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

export function useUpdateGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<GuardianInput> & { id: string }) => {
      const { error } = await supabase.from('guardians').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

export function useDeleteGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('guardians').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

/** Vínculo estudiante↔tutor con la ficha completa del tutor. */
export type StudentGuardianRow = StudentGuardian & { guardian: Guardian | null }

export function useStudentGuardians(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-guardians', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<StudentGuardianRow[]> => {
      const { data, error } = await supabase
        .from('student_guardians')
        .select('*, guardian:guardians(*)')
        .eq('student_id', studentId!)
        .order('is_primary', { ascending: false })
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as StudentGuardianRow[]
    },
  })
}

export interface StudentGuardianInput {
  relationship: GuardianRelationship
  is_primary: boolean
  lives_with: boolean
  can_pickup: boolean
  is_emergency_contact: boolean
  is_financial_responsible: boolean
}

export function useLinkGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: StudentGuardianInput & { student_id: string; guardian_id: string }) => {
      // Solo un contacto principal por estudiante (índice único parcial): si el
      // nuevo lo es, se le quita la marca al anterior ANTES de insertar.
      if (v.is_primary) {
        const { error: e1 } = await supabase
          .from('student_guardians')
          .update({ is_primary: false })
          .eq('student_id', v.student_id)
          .eq('is_primary', true)
        if (e1) throw e1
      }
      const { error } = await supabase.from('student_guardians').insert(v)
      if (error) throw error
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

export function useUpdateStudentGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      student_id,
      ...patch
    }: Partial<StudentGuardianInput> & { id: string; student_id: string }) => {
      if (patch.is_primary) {
        const { error: e1 } = await supabase
          .from('student_guardians')
          .update({ is_primary: false })
          .eq('student_id', student_id)
          .eq('is_primary', true)
          .neq('id', id)
        if (e1) throw e1
      }
      const { error } = await supabase.from('student_guardians').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

export function useUnlinkGuardian() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('student_guardians').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateFamilies(qc),
  })
}

// ── Documentos ──────────────────────────────────────────────────────────────

export function useStudentDocuments(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-documents', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<StudentDocument[]> => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('*')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as StudentDocument[]
    },
  })
}

/**
 * Sube el archivo y luego registra la fila. Si la fila falla, se borra el
 * archivo: un blob sin fila es invisible desde la app y se paga igual.
 */
export function useUploadStudentDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      student: Pick<Student, 'id' | 'tenant_id'>
      file: File
      kind: DocumentKind
      title: string
      notes: string | null
    }) => {
      const { path } = await uploadFile('files', v.student.tenant_id, v.file, `students/${v.student.id}/`)
      const { error } = await supabase.from('student_documents').insert({
        student_id: v.student.id,
        kind: v.kind,
        title: v.title,
        file_path: path,
        file_name: v.file.name,
        mime_type: v.file.type || null,
        size_bytes: v.file.size,
        notes: v.notes,
      })
      if (error) {
        await removeFile('files', path).catch(() => {})
        throw error
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['student-documents', v.student.id] }),
  })
}

/** Borra la fila y DESPUÉS el archivo (al revés, un fallo dejaría una fila rota). */
export function useDeleteStudentDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (doc: StudentDocument) => {
      const { error } = await supabase.from('student_documents').delete().eq('id', doc.id)
      if (error) throw error
      await removeFile('files', doc.file_path).catch(() => {})
    },
    onSuccess: (_d, doc) => qc.invalidateQueries({ queryKey: ['student-documents', doc.student_id] }),
  })
}

/**
 * Abre un documento privado en otra pestaña con una URL firmada de corta vida.
 *
 * La pestaña se abre ANTES del `await`, todavía dentro del toque del usuario:
 * Safari en iOS bloquea un `window.open` que llega después de una promesa por
 * considerarlo un popup no solicitado. Luego se le pone la URL firmada.
 */
export async function openStudentDocument(doc: Pick<StudentDocument, 'file_path'>) {
  const tab = window.open('', '_blank')
  try {
    const url = await signedFileUrl(doc.file_path, 300)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.href = url
    }
  } catch (err) {
    tab?.close()
    throw err
  }
}
