import { cn } from '@/lib/cn'
import { APP_NAME } from '@/lib/constants'
import markUrl from '@/assets/brand/mark.png'
import logoUrl from '@/assets/brand/logo.png'

/*
 * Marca de ArreSchool.
 *
 * Las imágenes se IMPORTAN (van al bundle con hash) y no se leen de public/: el
 * logo aparece en la pantalla de arranque, en el <ErrorBoundary> y en el login,
 * justo los momentos en los que puede no haber red. Como PNG con hash entran en
 * el precache del service worker (`globPatterns` incluye *.png) y se pintan
 * también sin conexión.
 *
 * Originales en brand/ (sin tocar). Las versiones de src/assets/brand/ están
 * recortadas y con el fondo blanco EXTERIOR vuelto transparente; el blanco de
 * dentro del dibujo (la escuela, los huecos de las letras) se conserva o se
 * perfora según toque el borde, así que SOLO quedan bien sobre fondo claro.
 * Sobre fondo oscuro van dentro de una placa blanca (ver `Wordmark dark`).
 *
 * public/logo.png es otra cosa: la fuente cuadrada de los íconos que genera
 * `npm run icons` (favicon, PWA, imagen social).
 */

/** Emblema «AS». El tamaño lo pone quien lo usa (`h-* w-*`); no se deforma. */
export function Logo({
  className,
  /** `true` cuando al lado ya hay texto con el nombre: evita leerlo dos veces. */
  decorative = false,
}: {
  className?: string
  decorative?: boolean
}) {
  return (
    <img
      src={markUrl}
      alt={decorative ? '' : APP_NAME}
      aria-hidden={decorative || undefined}
      // `draggable={false}`: en escritorio, arrastrar el logo de la barra por
      // accidente abría la imagen suelta en otra pestaña.
      draggable={false}
      className={cn('shrink-0 select-none object-contain', className)}
    />
  )
}

/** Logo completo (emblema + «ArreSchool»), para el login y la portada. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt={APP_NAME}
      draggable={false}
      className={cn('select-none object-contain', className)}
    />
  )
}

/** Emblema + nombre en línea, para cabeceras y barras de navegación. */
export function Wordmark({
  className,
  /** Sobre fondo oscuro (pie de la landing): placa blanca tras el emblema y texto blanco. */
  dark = false,
}: {
  className?: string
  dark?: boolean
}) {
  return (
    // `min-w-0` para que el `truncate` del nombre funcione: un hijo flex se
    // niega a encogerse por debajo de su contenido si no se lo permites.
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      {dark ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1">
          <Logo className="h-full w-full" decorative />
        </span>
      ) : (
        <Logo className="h-10 w-10" decorative />
      )}
      {/* Dos tonos como el logotipo: «Arre» oscuro y «School» claro. */}
      <span className="truncate text-lg font-extrabold tracking-tight">
        <span className={dark ? 'text-white' : 'text-brand-600'}>Arre</span>
        <span className={dark ? 'text-brand-300' : 'text-brand-400'}>School</span>
      </span>
    </div>
  )
}
