// STUB: diálogo de cobro (lo construye Finanzas).
export function PaymentModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
  /** Estudiante ya elegido (desde su ficha o su cuenta). Sin él, el diálogo deja buscarlo. */
  studentId?: string
}) {
  if (!open) return null
  return <button onClick={onClose}>Cerrar</button>
}
