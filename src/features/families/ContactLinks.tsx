import { MessageCircle, Phone } from 'lucide-react'
import { digits } from '@/lib/format'

/**
 * Número para wa.me. WhatsApp exige el código de país; en República Dominicana
 * (y el resto del plan de numeración +1) los números se escriben con 10
 * dígitos sin él, así que se antepone el 1. Un número ya internacional se deja.
 */
export function whatsappNumber(phone: string | null | undefined): string {
  const d = digits(phone)
  return d.length === 10 ? `1${d}` : d
}

/**
 * Llamar o escribir por WhatsApp en un toque. En el teléfono es la acción más
 * común con una familia, y copiar el número a mano es donde se equivoca uno.
 */
export function ContactLinks({ phone, compact = false }: { phone: string | null | undefined; compact?: boolean }) {
  if (!phone) return null
  const wa = whatsappNumber(phone)
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={`tel:${digits(phone)}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-brand-50"
        aria-label={`Llamar al ${phone}`}
      >
        <Phone className="h-3.5 w-3.5" />
        {!compact && <span className="tabular-nums">{phone}</span>}
      </a>
      {wa.length >= 10 && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center rounded-lg px-2 py-1 text-emerald-600 hover:bg-emerald-50"
          aria-label={`Escribir por WhatsApp al ${phone}`}
          title="WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
    </span>
  )
}
