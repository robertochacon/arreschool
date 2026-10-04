import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { Info, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { EnrollmentStatus, PeriodStatus } from '@/types/db'

/**
 * Piezas compartidas por Estructura, Inscripciones y Asistencia. Viven aquí y
 * no en `components/` porque solo tienen sentido dentro del módulo académico.
 */

/**
 * Hoy en 'YYYY-MM-DD', en la hora LOCAL. `new Date().toISOString().slice(0,10)`
 * da la fecha UTC: en República Dominicana, después de las 8 p. m. ya es
 * "mañana" y la asistencia de la tarde quedaría con la fecha equivocada.
 */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Tono de la etiqueta de un año escolar. Record completo: un estado nuevo sin color no compila. */
export const PERIOD_TONE: Record<PeriodStatus, 'amber' | 'green' | 'slate'> = {
  planning: 'amber',
  active: 'green',
  closed: 'slate',
}

export const ENROLLMENT_TONE: Record<EnrollmentStatus, 'green' | 'red' | 'slate' | 'brand' | 'amber'> = {
  enrolled: 'green',
  withdrawn: 'red',
  completed: 'slate',
  promoted: 'brand',
  retained: 'amber',
}

const NOTICE_TONES = {
  info: 'border-brand-100 bg-brand-50 text-brand-800',
  lock: 'border-slate-200 bg-slate-50 text-slate-600',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
} as const

/**
 * Franja de aviso dentro de una pantalla (solo lectura, año cerrado…). Se queda
 * fija, al contrario que un toast, porque explica por qué faltan botones.
 */
export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof NOTICE_TONES
  children: ReactNode
  className?: string
}) {
  const Icon = tone === 'lock' ? Lock : Info
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm', NOTICE_TONES[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Texto vacío → null: la base distingue "sin dato" de "cadena vacía" y los listados también. */
export function orNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
