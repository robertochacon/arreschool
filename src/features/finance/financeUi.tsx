import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, endOfMonth, startOfMonth } from 'date-fns'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/misc'
import { useStudents } from '@/hooks/students'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import type { ChargeStatus, Student } from '@/types/db'

/*
 * Piezas compartidas por las pantallas de Finanzas. Viven aquí y no en
 * components/ui porque hablan el idioma del dominio (cargos, estudiantes).
 */

/** Tono de la etiqueta de un cargo. `Record` completo: un estado nuevo sin color no compila. */
export const CHARGE_STATUS_TONE: Record<ChargeStatus, 'amber' | 'brand' | 'green' | 'slate'> = {
  pending: 'amber',
  partial: 'brand',
  paid: 'green',
  void: 'slate',
}

/**
 * Fechas como 'YYYY-MM-DD' en HORA LOCAL. `new Date().toISOString()` daría la
 * fecha UTC, y en República Dominicana después de las 8 p. m. eso ya es
 * "mañana": la base rechazaría el pago por fecha futura.
 */
export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')
export const isoToday = () => isoDate(new Date())
export const isoMonthStart = (d = new Date()) => isoDate(startOfMonth(d))
export const isoMonthEnd = (d = new Date()) => isoDate(endOfMonth(d))

/** 'YYYY-MM' (lo que da <input type="month">) → primer día del mes, como lo guarda la base. */
export const monthToBilling = (month: string) => (month ? `${month}-01` : null)

/** Nombre "Apellido, Nombre" no: en una fila de teléfono se lee mejor nombre + apellido. */
export function studentName(s: Pick<Student, 'first_name' | 'last_name'> | null | undefined) {
  return s ? `${s.first_name} ${s.last_name}` : 'Estudiante'
}

/**
 * Lee un importe escrito a mano. Devuelve null si no es un número positivo con
 * hasta dos decimales: la base lo volvería a rechazar, pero con un mensaje
 * técnico.
 */
export function parseAmount(raw: string): number | null {
  const v = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null
  const n = Number(v)
  return n > 0 ? n : null
}

/**
 * Pide el MOTIVO de una anulación. Es obligatorio en la base (void_payment /
 * void_charge), y pedirlo en un diálogo propio —no en un `prompt()`— permite
 * escribirlo bien en el teléfono y deja claro que la acción queda registrada.
 */
export function VoidReasonModal({
  open,
  title,
  description,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  loading?: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            Anular
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{description}</p>
        <Field label="Motivo" required hint="Queda guardado junto con tu nombre y la fecha.">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Se registró dos veces"
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Buscador de estudiante para los diálogos que no llegan desde una ficha
 * (cobrar desde Caja, crear un cargo suelto). Solo los ACTIVOS por defecto: a
 * un egresado rara vez se le cobra, y mostrarlo confunde con homónimos.
 */
export function StudentPicker({
  value,
  onChange,
  includeInactive = false,
}: {
  value: string | null
  onChange: (id: string) => void
  includeInactive?: boolean
}) {
  const { data, isLoading } = useStudents()
  const [q, setQ] = useState('')

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data ?? [])
      .filter((s) => includeInactive || s.status === 'active')
      .filter(
        (s) =>
          !term ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(term) ||
          s.code.toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [data, q, includeInactive])

  const selected = data?.find((s) => s.id === value)

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          className="pl-9"
          placeholder={selected ? studentName(selected) : 'Buscar por nombre o matrícula…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : (
        <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {matches.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Sin resultados</li>}
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.id)
                  setQ('')
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm',
                  s.id === value ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50',
                )}
              >
                <span className="min-w-0 truncate font-medium">{studentName(s)}</span>
                <span className="shrink-0 text-xs text-slate-400">{s.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ICON_TONES = {
  slate: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  green: 'text-emerald-600 hover:bg-emerald-50',
  red: 'text-red-500 hover:bg-red-50',
} as const

/**
 * Botón de icono de las tablas (solo escritorio). `title` obligatorio: un icono
 * suelto no dice qué hace. En el teléfono las mismas acciones van con su nombre
 * escrito en el <ActionMenu>.
 */
export function IconBtn({
  title,
  onClick,
  children,
  tone = 'slate',
  disabled,
}: {
  title: string
  onClick: () => void
  children: ReactNode
  tone?: keyof typeof ICON_TONES
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        ICON_TONES[tone],
      )}
    >
      {children}
    </button>
  )
}

/** Caja de error con reintento, igual en todas las pestañas. */
export function LoadError({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="space-y-3 p-8 text-center">
      <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los datos.')}</p>
      <Button variant="outline" onClick={onRetry} loading={retrying}>
        Reintentar
      </Button>
    </div>
  )
}
