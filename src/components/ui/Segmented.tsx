import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Selector de una sola opción con las opciones a la vista. Dos aspectos:
 *
 * `tabs` (por omisión) — pestañas con subrayado. Es lo que usan las pantallas
 *   para cambiar de sección (Finanzas: Por cobrar / Cargos / Pagos…) y los
 *   filtros de las listas. Se leen como navegación, no como una fila de
 *   botones grandes que compiten con las acciones de la página.
 *   MÓVIL: la tira NO se parte en filas; si no cabe, se desliza de lado DENTRO
 *   de sí misma (la página nunca gana scroll horizontal) y la pestaña activa se
 *   desplaza sola a la vista. A 360px, cinco pestañas de una palabra caben casi
 *   siempre; la ficha del estudiante, con «Documentos» e «Historial», no.
 *
 * `toggle` — interruptor compacto de dos o tres opciones DENTRO de un
 *   formulario (p. ej. «Automático / Elegir cargos» al cobrar). Ahí unas
 *   pestañas parecerían navegación y no un campo.
 *
 * `aria-pressed` y NO `role="tab"`: el patrón de pestañas le promete al lector
 * de pantalla paneles enlazados y navegación con flechas, y aquí son botones
 * que se pulsan uno a uno con el tabulador, así que se anuncian por lo que son.
 */
const VARIANTS = {
  tabs: {
    wrap: '-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0',
    track: 'flex min-w-max gap-1 border-b border-slate-200',
    base:
      '-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-2 text-sm font-semibold transition-colors sm:px-4 sm:text-[15px] ' +
      'rounded-t-lg focus:outline-none focus-visible:bg-brand-50',
    on: 'border-brand-600 text-brand-700',
    off: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
  },
  toggle: {
    wrap: '',
    track: 'inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1',
    base:
      'flex-1 truncate rounded-lg px-3 py-2 text-sm font-semibold transition-colors ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
    on: 'bg-white text-brand-700 shadow-sm',
    off: 'text-slate-500 hover:text-slate-800',
  },
} as const

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  variant = 'tabs',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  /** Nombre del grupo, para lectores de pantalla. */
  label?: string
  className?: string
  variant?: keyof typeof VARIANTS
}) {
  const v = VARIANTS[variant]
  const wrapRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // En el teléfono la tira puede ser más ancha que la pantalla: al cambiar de
  // pestaña (o al abrir en una que quedó fuera, p. ej. desde ?tab= en la URL)
  // se desliza la TIRA hasta la activa. A mano y no con `scrollIntoView`, que
  // también movería la página en vertical si la tira no está a la vista.
  useEffect(() => {
    const wrap = wrapRef.current
    const el = activeRef.current
    if (variant !== 'tabs' || !wrap || !el) return
    const left = el.offsetLeft - wrap.offsetLeft
    const right = left + el.offsetWidth
    if (left < wrap.scrollLeft || right > wrap.scrollLeft + wrap.clientWidth) {
      wrap.scrollTo({ left: Math.max(0, left - 16), behavior: 'smooth' })
    }
  }, [value, variant])

  return (
    <div ref={wrapRef} className={cn(v.wrap, className)}>
      <div role="group" aria-label={label} className={v.track}>
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              ref={active ? activeRef : undefined}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cn(v.base, active ? v.on : v.off)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
