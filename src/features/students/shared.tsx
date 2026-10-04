import { differenceInMonths, isValid, parseISO } from 'date-fns'
import { Avatar } from '@/components/ui/misc'
import { useSignedUrl } from '@/hooks/students'
import type { Student, StudentStatus } from '@/types/db'

/** Tono por estado. `Record` completo: un estado nuevo sin color no compila. */
export const STUDENT_STATUS_TONE: Record<StudentStatus, 'green' | 'amber' | 'slate' | 'red'> = {
  active: 'green',
  inactive: 'amber',
  graduated: 'slate',
  withdrawn: 'red',
}

export function studentName(s: Pick<Student, 'first_name' | 'last_name'> | null | undefined): string {
  if (!s) return '—'
  return `${s.first_name} ${s.last_name}`.trim()
}

/**
 * Edad legible. En inicial los meses importan ("3 años y 7 meses" decide el
 * grado), así que por debajo de 6 años se dicen también los meses.
 */
export function ageLabel(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null
  const d = parseISO(birthDate)
  if (!isValid(d)) return null
  const months = differenceInMonths(new Date(), d)
  if (months < 0) return null
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} ${m === 1 ? 'mes' : 'meses'}`
  if (y >= 6 || m === 0) return `${y} ${y === 1 ? 'año' : 'años'}`
  return `${y} ${y === 1 ? 'año' : 'años'} y ${m} ${m === 1 ? 'mes' : 'meses'}`
}

/**
 * Foto del estudiante (bucket privado, URL firmada) o sus iniciales. Mientras
 * la firma llega se pintan las iniciales: mejor eso que un hueco que salta.
 */
export function StudentAvatar({
  student,
  size = 'md',
}: {
  student: Pick<Student, 'first_name' | 'last_name' | 'photo_path'>
  size?: 'sm' | 'md' | 'lg'
}) {
  const { data: url } = useSignedUrl(student.photo_path)
  return <Avatar name={studentName(student)} src={url ?? undefined} size={size} />
}
