// STUB: diálogo de inscripción (lo construye el módulo Académico).
export function EnrollStudentModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
  /** Estudiante ya elegido (desde su ficha). Sin él, el diálogo deja buscarlo. */
  studentId?: string
  onEnrolled?: (enrollmentId: string) => void
}) {
  if (!open) return null
  return <button onClick={onClose}>Cerrar</button>
}
