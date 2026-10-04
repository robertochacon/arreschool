import { useId } from 'react'
import { cn } from '@/lib/cn'
import { APP_NAME } from '@/lib/constants'

/*
 * Marca del starter, dibujada EN LÍNEA (SVG) y no cargada de public/logo.png.
 *
 * ¿Por qué vectorial? Porque el logo aparece en la pantalla de arranque, en el
 * <ErrorBoundary> y en el login: justo los tres momentos en los que puede no
 * haber red, y una imagen que no carga deja un hueco donde debería estar la
 * única señal de que la app es la app. Al ir dentro del bundle se pinta siempre,
 * escala a cualquier tamaño y no gasta una petición.
 *
 * public/logo.png sigue existiendo, pero solo como fuente de los íconos que
 * genera `npm run icons` (favicon, PWA, imagen social). Cambiar la marca son dos
 * pasos: ese PNG y este archivo.
 */

// Gemelos de tailwind.config.js. Van en hex porque un `stop` de degradado no
// entiende clases de Tailwind; si cambias la paleta, cambia también estos tres.
const BRAND_FROM = '#3b82f6' // brand-500
const BRAND_TO = '#1d4ed8' // brand-700
const ACCENT = '#fbbf24' // accent-400

/** Isotipo cuadrado. El tamaño lo pone quien lo usa (`h-* w-*`). */
export function Logo({
  className,
  /** `true` cuando al lado ya hay texto con el nombre: evita leerlo dos veces. */
  decorative = false,
}: {
  className?: string
  decorative?: boolean
}) {
  // Un id por instancia. Con un id fijo, dos logos en la misma página
  // compartirían el degradado y el segundo heredaría el del primero: hoy son
  // idénticos, pero es una trampa lista para saltar en cuanto alguien tinte uno
  // distinto. Se le quitan los ':' que mete React porque no son válidos dentro
  // de un `url(#…)`.
  const gradientId = `logo-${useId().replace(/:/g, '')}`

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : APP_NAME}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor={BRAND_FROM} />
          <stop offset="1" stopColor={BRAND_TO} />
        </linearGradient>
      </defs>
      {/* Baldosa: el mismo radio grande de las tarjetas (rounded-2xl). */}
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      {/* Tres barras que crecen = el negocio que va hacia arriba. Abstracto a
          propósito: el starter no sabe a qué se dedicará quien lo use. */}
      <rect x="15" y="34" width="8" height="15" rx="4" fill="#fff" fillOpacity="0.55" />
      <rect x="28" y="27" width="8" height="22" rx="4" fill="#fff" fillOpacity="0.8" />
      <rect x="41" y="20" width="8" height="29" rx="4" fill="#fff" />
      <circle cx="45" cy="14" r="5" fill={ACCENT} />
    </svg>
  )
}

/** Isotipo + nombre, para cabeceras y barras de navegación. */
export function Wordmark({
  className,
  /** Sobre fondo oscuro (pie de la landing): el texto pasa a blanco. */
  dark = false,
}: {
  className?: string
  dark?: boolean
}) {
  return (
    // `min-w-0` para que el `truncate` del nombre funcione: un hijo flex se
    // niega a encogerse por debajo de su contenido si no se lo permites.
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Logo className="h-9 w-9" decorative />
      <span
        className={cn(
          'truncate text-lg font-extrabold tracking-tight',
          dark ? 'text-white' : 'text-brand-950',
        )}
      >
        {APP_NAME}
      </span>
    </div>
  )
}
