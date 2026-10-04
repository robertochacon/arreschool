/**
 * Extrae un mensaje legible de un error.
 *
 * Los errores de Supabase (PostgrestError) son objetos planos con `.message`,
 * NO instancias de `Error`, así que un `err instanceof Error ? err.message : …`
 * los pierde y acaba enseñando un genérico inútil. Esta función cubre los dos
 * casos.
 *
 * Además limpia la MARCA técnica de la convención que usan los triggers y las
 * RPC de la base: lanzan `MARCA: mensaje humano` y aquí se conserva solo el
 * mensaje (`PLAN_LIMIT_ITEMS: …`, `PLAN_LIMIT_MEMBERS: …`,
 * `CUENTA_SUSPENDIDA: …` → la frase amigable a secas). La marca existe para que
 * el código la pueda reconocer, no para enseñársela a nadie.
 *
 * Se recorta por PATRÓN y no por lista de marcas conocidas: cuando esto miraba
 * solo `PLAN_LIMIT`, la marca `CUENTA_SUSPENDIDA:` llegaba cruda al toast. Una
 * marca nueva en el SQL no debe obligar a tocar este archivo.
 */
/**
 * Restricciones únicas con nombre → frase para quien usa la app. El nombre lo
 * fijan las migraciones 0013-0017 (`constraint …_key` / `create unique index`);
 * renombrar una allí sin cambiarla aquí solo degrada al mensaje genérico.
 */
const UNIQUE_MESSAGES: Record<string, string> = {
  academic_periods_name_key: 'Ya existe un año escolar con ese nombre.',
  academic_periods_one_active: 'Ya hay un año escolar en curso. Ciérralo antes de activar otro.',
  grading_terms_name_key: 'Ese año ya tiene un corte con ese nombre.',
  grade_levels_name_key: 'Ya existe un grado con ese nombre.',
  sections_name_key: 'Ese grado ya tiene una sección con ese nombre en este año.',
  section_teachers_unique: 'Ese docente ya está asignado a la sección.',
  teachers_user_key: 'Esa cuenta ya está enlazada a otra ficha de docente.',
  students_code_key: 'Ya hay un estudiante con esa matrícula.',
  student_guardians_unique: 'Ese familiar ya está vinculado al estudiante.',
  student_guardians_one_primary: 'El estudiante ya tiene un contacto principal.',
  enrollments_student_period_key: 'Este estudiante ya está inscrito en ese año escolar.',
  fee_concepts_name_key: 'Ya existe un concepto con ese nombre.',
  charges_no_double_month: 'Ese estudiante ya tiene ese cargo para ese mes.',
}

/**
 * Errores de integridad de Postgres traducidos. Llegan crudos ("violates
 * foreign key constraint…") porque los dispara la base, no una RPC con su
 * mensaje; enseñarlos tal cual se lee como un fallo de la aplicación.
 */
function integrityMessage(err: unknown, msg: string): string | null {
  const code = (err as { code?: string } | null)?.code
  if (code === '23505') {
    const name = msg.match(/constraint "([^"]+)"/)?.[1]
    return (name && UNIQUE_MESSAGES[name]) || 'Ya existe un registro con esos mismos datos.'
  }
  if (code === '23503') {
    // "update or delete on table…" = se intentó BORRAR algo con historia;
    // "insert or update on table…" = se apuntó a un dato que no es válido.
    return /^update or delete/.test(msg)
      ? 'No se puede eliminar porque tiene historial relacionado (inscripciones, pagos, evaluaciones…). Márcalo como inactivo o retirado.'
      : 'Uno de los datos elegidos no es válido (por ejemplo, una sección de otro grado o de otro año).'
  }
  if (code === '42501') {
    return 'Tu rol no tiene permiso para hacer esto. Pide ayuda a la Dirección del colegio.'
  }
  return null
}

export function errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
  let msg = fallback
  if (err instanceof Error && err.message) {
    msg = err.message
  } else if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string' &&
    (err as { message: string }).message
  ) {
    msg = (err as { message: string }).message
  }
  // El patrón es estrecho a propósito para no descabezar un mensaje legítimo:
  // la marca va al PRINCIPIO, solo A-Z 0-9 _, mínimo 3 caracteres y los dos
  // puntos PEGADOS. Así "Failed to fetch" o "Error de red: revisa la conexión"
  // pasan enteros, porque no son todo mayúsculas.
  // El grupo 2 se queda con TODO el resto (flag `s`, por si el mensaje trae
  // saltos de línea): el texto amigable puede llevar sus propios dos puntos y
  // cortarlo ahí lo dejaría a medias.
  const integrity = integrityMessage(err, msg)
  if (integrity) return integrity
  const marked = msg.match(/^([A-Z][A-Z0-9_]{2,}):\s*(.+)$/s)
  if (marked) return marked[2].trim()
  return msg
}

/**
 * ¿El error es un choque de clave única (unique_violation)?
 *
 * Se usa donde una reinserción del MISMO id es en realidad un éxito: la cola
 * offline reintenta con un id generado en el cliente, así que un 23505 significa
 * "ya estaba subido", no "falló".
 */
export function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === '23505'
}
