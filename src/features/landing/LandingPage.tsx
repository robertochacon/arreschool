import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Apple,
  BookOpenCheck,
  CalendarCheck,
  Check,
  ChevronDown,
  GraduationCap,
  HeartHandshake,
  Menu,
  NotebookPen,
  ReceiptText,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react'
import { usePlanSettings, toPlanMap } from '@/hooks/plans'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  ACHIEVEMENT_LABEL,
  ACHIEVEMENT_SHORT,
  APP_NAME,
  APP_TAGLINE,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PATHS,
  PLAN_PRICE_UNIT,
  planOrderFrom,
  planPriceLabel,
  type PlanInfo,
} from '@/lib/constants'
import { Logo, Wordmark } from '@/components/Logo'
import type { AchievementLevel, PlanCode } from '@/types/db'

/**
 * Página pública de ArreSchool: es lo que ve en `/` quien NO tiene sesión
 * (App.tsx la monta desde el guard, sin redirigir).
 *
 * Público: la directora o el dueño de un centro de EDUCACIÓN INICIAL que lleva
 * asistencia, fichas y mensualidades en libretas y hojas de cálculo. Por eso la
 * página habla el idioma del aula de inicial (casilleros con nombre, merienda,
 * quién recoge, Logrado / En proceso / Iniciado) y usa los colores del logo
 * (paleta `arre-*` en tailwind.config.js), con Fredoka/Nunito en vez de la Inter
 * de la app.
 *
 * Lo memorable es UNA cosa: el mural de casilleros del hero, la escena de pasar
 * lista que cualquier maestra reconoce. Lo demás se mantiene quieto a propósito.
 *
 * Regla que se mantiene del starter: nada de cifras inventadas («+500 colegios
 * confían en nosotros») ni testimonios de mentira. Los nombres del mural y del
 * boletín son ejemplos y se leen como tales.
 */
export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-arre-paper font-rounded text-arre-ink">
      <Navbar />
      <Hero />
      <DayTimeline />
      <Areas />
      <ReportCardSection />
      <Roles />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  )
}

/* ── Utilidades de la página ────────────────────────────────────────────── */

/** Desplaza suavemente a una sección por id (sin tocar el hash del router). */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Enlace a una sección de esta misma página.
 *
 * Es un `<a href="#seccion">` DE VERDAD, no un botón: así el rastreador de
 * Google lo ve y puede ofrecer «saltar a Precios» bajo el resultado de búsqueda.
 * El `preventDefault` es obligatorio con HashRouter: dejar que el navegador
 * salte cambiaría el fragmento, que es donde vive la ruta, y la app entera se
 * remontaría en una ruta inexistente.
 */
function SectionLink({
  id,
  className,
  children,
  onNavigate,
}: {
  id: string
  className?: string
  children: ReactNode
  onNavigate?: () => void
}) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        scrollToId(id)
        onNavigate?.()
      }}
    >
      {children}
    </a>
  )
}

/**
 * Planes tal como se anuncian, ya normalizados.
 *
 * Salen de `plan_settings`, que la RLS deja leer SIN sesión justo para esto: la
 * landing publica exactamente los precios y topes que el super-admin tenga
 * puestos, y no una copia que se queda vieja. Mientras la consulta carga —o si
 * el visitante llegó sin red— `toPlanMap` cae a las constantes de respaldo, así
 * que nunca hay una tabla de precios en blanco.
 */
function usePlans(): Record<PlanCode, PlanInfo> {
  const { data } = usePlanSettings()
  return useMemo(() => toPlanMap(data), [data])
}

function SectionHeading({
  title,
  subtitle,
  align = 'center',
  tone = 'ink',
}: {
  title: string
  subtitle?: string
  align?: 'center' | 'left'
  tone?: 'ink' | 'white'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <h2
        className={cn(
          'font-display text-3xl font-semibold leading-tight sm:text-4xl',
          tone === 'white' ? 'text-white' : 'text-arre-ink',
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={cn('mt-3 text-lg', tone === 'white' ? 'text-white/75' : 'text-slate-600')}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * Los cinco colores del logo, como tonos con nombre. Un `Record` y no clases
 * sueltas: Tailwind necesita ver cada clase completa escrita en el código para
 * generarla, así que no se pueden componer con `bg-arre-${color}`.
 */
type Hue = 'navy' | 'sky' | 'teal' | 'orange' | 'leaf'

const HUE: Record<Hue, { solid: string; soft: string; text: string; ring: string }> = {
  navy: { solid: 'bg-arre-navy', soft: 'bg-arre-navy/10', text: 'text-arre-navy', ring: 'ring-arre-navy/25' },
  sky: { solid: 'bg-arre-sky', soft: 'bg-arre-sky/10', text: 'text-arre-sky', ring: 'ring-arre-sky/30' },
  teal: { solid: 'bg-arre-teal', soft: 'bg-arre-teal/10', text: 'text-arre-teal', ring: 'ring-arre-teal/30' },
  orange: {
    solid: 'bg-arre-orange',
    soft: 'bg-arre-orange/10',
    text: 'text-[#C46A00]', // el naranja del logo no llega a 4.5:1 como texto sobre blanco
    ring: 'ring-arre-orange/35',
  },
  leaf: { solid: 'bg-arre-leaf', soft: 'bg-arre-leaf/10', text: 'text-[#2E8A35]', ring: 'ring-arre-leaf/35' },
}

/* ── Barra de navegación ────────────────────────────────────────────────── */

/** Secciones del menú. Las comparten la barra y el panel del teléfono. */
const NAV_LINKS = [
  { id: 'un-dia', label: 'Un día' },
  { id: 'areas', label: 'Áreas' },
  { id: 'precios', label: 'Precios' },
  { id: 'faq', label: 'Preguntas' },
] as const

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (!menuOpen) return

    // Escape cierra y devuelve el foco al botón: es el que lo abrió y el que
    // anuncia el estado (aria-expanded), así el teclado no se queda perdido.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      toggleRef.current?.focus()
    }
    // Al pasar a escritorio hay que cerrarlo. El panel es `md:hidden`, así que
    // al girar el teléfono se quedaría abierto pero invisible: el botón seguiría
    // mostrando la X y el primer toque no haría nada aparente.
    const desktop = window.matchMedia('(min-width: 768px)') // = breakpoint `md`
    const onBreakpoint = () => desktop.matches && setMenuOpen(false)

    document.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [menuOpen])

  return (
    <>
      {/* Fondo atenuado: un toque fuera del panel lo cierra. Va ANTES de la
          barra y con menos z-index que ella para que la barra —y el panel, que
          vive dentro— queden por encima y el botón siga siendo pulsable. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-arre-ink/30 md:hidden" onClick={closeMenu} aria-hidden />
      )}
      <nav className="sticky top-0 z-50 border-b border-arre-sky/15 bg-arre-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Wordmark />
          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <SectionLink
                key={l.id}
                id={l.id}
                className="whitespace-nowrap font-semibold text-slate-600 transition-colors hover:text-arre-navy"
              >
                {l.label}
              </SectionLink>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="hidden rounded-full px-3 py-2 font-semibold text-slate-600 transition-colors hover:text-arre-navy sm:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/registro"
              className="whitespace-nowrap rounded-full bg-arre-navy px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-arre-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-arre-sky/40 sm:text-base"
            >
              Empezar gratis
            </Link>
            <button
              ref={toggleRef}
              type="button"
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              aria-controls="menu-movil"
              className="rounded-full p-2 text-slate-600 hover:bg-arre-sky/10 md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Panel del teléfono. Es `absolute` a propósito: `sticky` SIGUE ocupando
            sitio en el flujo, así que un panel en flujo empujaría la página hacia
            abajo; al pulsar un enlace se cerraría, la página volvería a subir y
            el destino que `scrollIntoView` acaba de calcular quedaría obsoleto
            —el desplazamiento aterrizaría por debajo de la sección—. Fondo OPACO
            aunque la barra sea translúcida: con transparencia se transparenta el
            titular del hero por detrás de los enlaces. */}
        {menuOpen && (
          <div
            id="menu-movil"
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-arre-sky/15 bg-arre-paper px-4 pb-4 pt-2 shadow-card-hover animate-fade-in md:hidden"
          >
            {NAV_LINKS.map((l) => (
              <SectionLink
                key={l.id}
                id={l.id}
                onNavigate={closeMenu}
                className="block rounded-2xl px-3 py-3 text-base font-bold text-arre-ink transition-colors hover:bg-arre-sky/10"
              >
                {l.label}
              </SectionLink>
            ))}
            {/* En la barra, «Iniciar sesión» está oculto por debajo de `sm` (no
                cabe junto al CTA), y es justo ahí donde hace falta. */}
            <Link
              to="/login"
              onClick={closeMenu}
              className="mt-2 flex items-center justify-center rounded-full border-2 border-arre-navy/20 bg-white px-4 py-3 text-base font-bold text-arre-navy sm:hidden"
            >
              Iniciar sesión
            </Link>
          </div>
        )}
      </nav>
    </>
  )
}

/* ── Hero ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pb-32 lg:pt-16">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-arre-navy ring-1 ring-arre-sky/25">
            <Sun className="h-4 w-4 text-arre-orange" />
            Para centros de educación inicial
          </p>
          <h1 className="font-display text-[2.6rem] font-semibold leading-[1.05] text-arre-ink sm:text-6xl lg:text-[4.1rem]">
            Del saludo de la mañana a la hora de salida, tu colegio en orden.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            {APP_NAME} reúne la lista de asistencia, la ficha de cada niño con sus alergias y
            quién lo recoge, la evaluación por competencias, los boletines y las mensualidades.
            La maestra lo usa desde su teléfono; la dirección, desde la computadora.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/registro"
              className="inline-flex items-center justify-center rounded-full bg-arre-navy px-8 py-4 text-lg font-bold text-white shadow-[0_10px_0_-2px_#0E2A5C33] transition-colors hover:bg-arre-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-arre-sky/40"
            >
              Crear mi colegio gratis
            </Link>
            <SectionLink
              id="un-dia"
              className="inline-flex items-center justify-center rounded-full border-2 border-arre-navy/20 bg-white px-8 py-4 text-lg font-bold text-arre-navy transition-colors hover:border-arre-navy/40"
            >
              Ver un día en {APP_NAME}
            </SectionLink>
          </div>
          <ul className="mt-8 grid gap-2 text-slate-600 sm:grid-cols-3">
            {[
              'Sin tarjeta para empezar',
              'Pasa lista sin wifi',
              'Cada colegio con sus datos aparte',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2 font-semibold">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-arre-leaf-deep text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <CubbyBoard />
      </div>

      <OpenBookEdge />
    </section>
  )
}

/**
 * El mural de casilleros: la escena de pasar lista en un aula de inicial. Puro
 * HTML (sin imágenes ni capturas, que se quedan viejas en el primer rediseño).
 * Es el ÚNICO elemento animado de la página: los casilleros se «pegan» uno
 * tras otro al cargar, y solo si la persona no pidió reducir el movimiento.
 */
function CubbyBoard() {
  const kids: {
    name: string
    hue: Hue
    status: 'arrived' | 'late' | 'absent'
    time?: string
    tag?: { icon: LucideIcon; text: string }
  }[] = [
    { name: 'Valentina R.', hue: 'teal', status: 'arrived', time: '7:41' },
    { name: 'Mateo G.', hue: 'sky', status: 'arrived', time: '7:48' },
    { name: 'Camila P.', hue: 'orange', status: 'arrived', time: '7:52', tag: { icon: Apple, text: 'Alergia: maní' } },
    { name: 'Santiago L.', hue: 'navy', status: 'late', time: '8:10' },
    { name: 'Isabella M.', hue: 'leaf', status: 'absent', tag: { icon: NotebookPen, text: 'Avisó la mamá' } },
    { name: 'Lucas T.', hue: 'teal', status: 'arrived', time: '7:55', tag: { icon: Users, text: 'Lo recoge: abuela' } },
  ]
  const STATUS: Record<'arrived' | 'late' | 'absent', { label: string; cls: string }> = {
    arrived: { label: 'Llegó', cls: 'bg-arre-leaf-deep text-white' },
    late: { label: 'Tardanza', cls: 'bg-arre-orange text-arre-ink' },
    absent: { label: 'Ausente', cls: 'bg-slate-200 text-slate-600' },
  }

  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* Corcho del mural: borde grueso y redondeado, como los tableros del aula. */}
      <div className="rounded-[2.25rem] bg-white p-4 shadow-[0_24px_60px_-24px_rgba(14,42,92,0.35)] ring-1 ring-arre-sky/20 sm:p-6">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className="font-display text-2xl font-semibold text-arre-ink">Kinder A</p>
            {/* Fecha real de hoy: un mural fechado a mano envejece al día siguiente. */}
            <p className="text-sm text-slate-500">{fmtDate(new Date())}</p>
          </div>
          <p className="rounded-full bg-arre-leaf/10 px-3 py-1 text-sm font-bold text-[#2E8A35]">
            16 de 18 llegaron
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kids.map((k, i) => (
            <li
              key={k.name}
              style={{ animationDelay: `${150 + i * 90}ms` }}
              className={cn(
                'relative flex flex-col rounded-3xl p-3 ring-1 motion-safe:animate-pop-in',
                HUE[k.hue].soft,
                HUE[k.hue].ring,
                k.status === 'absent' && 'opacity-80',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full font-display text-lg font-semibold text-white',
                  HUE[k.hue].solid,
                )}
                aria-hidden
              >
                {k.name[0]}
              </span>
              <span className="mt-2 truncate font-bold text-arre-ink">{k.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', STATUS[k.status].cls)}>
                  {STATUS[k.status].label}
                </span>
                {k.time && <span className="text-xs font-semibold text-slate-500">{k.time}</span>}
              </span>
              {k.tag && (
                <span className="mt-2 inline-flex items-center gap-1 self-start rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-arre-ink shadow-sm">
                  <k.tag.icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{k.tag.text}</span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-arre-paper px-3 py-2.5 text-sm font-semibold text-slate-600">
          <WifiOff className="h-4 w-4 shrink-0 text-arre-sky" />
          Guardada en el teléfono. Se sube sola cuando vuelve el wifi.
        </p>
      </div>
    </div>
  )
}

/**
 * Borde inferior del hero con forma de LIBRO ABIERTO: página azul a la
 * izquierda y verde a la derecha, como en el emblema. Es la transición entre
 * el fondo cielo del hero y la sección blanca de abajo.
 */
function OpenBookEdge() {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 h-14 w-full sm:h-20 lg:h-24"
      aria-hidden
    >
      <path d="M0 52 C 260 14, 560 30, 720 104 L 720 120 L 0 120 Z" fill="#1E9BE8" />
      <path d="M0 80 C 280 50, 560 70, 720 116 L 720 120 L 0 120 Z" fill="#0B4AA8" />
      <path d="M1440 52 C 1180 14, 880 30, 720 104 L 720 120 L 1440 120 Z" fill="#45B649" />
      <path d="M1440 80 C 1160 50, 880 70, 720 116 L 720 120 L 1440 120 Z" fill="#2E8A35" />
      {/* Lomo del libro y la franja blanca que da paso a la sección siguiente. */}
      <path d="M0 112 C 300 96, 600 104, 720 120 C 840 104, 1140 96, 1440 112 L 1440 120 L 0 120 Z" fill="#ffffff" />
    </svg>
  )
}

/* ── Un día en Kinder A ─────────────────────────────────────────────────── */

/**
 * Cómo se usa, contado como un día de aula. Es una secuencia de verdad (horas
 * del día, luego el mes y el trimestre), por eso va como línea de tiempo.
 */
function DayTimeline() {
  const moments: { when: string; title: string; desc: string; icon: LucideIcon; hue: Hue }[] = [
    {
      when: '7:30',
      title: 'Llegada',
      desc: 'La maestra pasa lista desde su teléfono en medio minuto. Si se cae el wifi, se guarda y sube después.',
      icon: CalendarCheck,
      hue: 'teal',
    },
    {
      when: '9:00',
      title: 'Rincones',
      desc: 'Anota lo que observa en el anecdotario: logros, conducta, salud. Decide qué ve la familia en el boletín.',
      icon: NotebookPen,
      hue: 'sky',
    },
    {
      when: '10:30',
      title: 'Merienda',
      desc: 'Las alergias de cada niño están a la vista en la lista de clase, no en una libreta en la dirección.',
      icon: Apple,
      hue: 'orange',
    },
    {
      when: '12:00',
      title: 'Salida',
      desc: 'Quién puede recoger a cada niño y los teléfonos de emergencia, a un toque de distancia.',
      icon: Users,
      hue: 'leaf',
    },
    {
      when: 'Cada mes',
      title: 'Mensualidades',
      desc: 'Los cargos de todo el colegio en un clic, pagos con recibo numerado y la lista de quién está al día.',
      icon: ReceiptText,
      hue: 'navy',
    },
    {
      when: 'Cada trimestre',
      title: 'Boletines',
      desc: 'Evaluación por competencias con Logrado, En proceso e Iniciado, y el boletín listo para imprimir.',
      icon: BookOpenCheck,
      hue: 'teal',
    },
  ]
  return (
    <section id="un-dia" className="scroll-mt-24 bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Un día en Kinder A"
          subtitle="Lo que pasa en un aula de inicial, y dónde entra ArreSchool en cada momento."
        />
        <ol className="relative mt-14 space-y-8 before:absolute before:bottom-4 before:left-[1.65rem] before:top-4 before:w-1 before:rounded-full before:bg-arre-sky/15 sm:before:left-[7.4rem]">
          {moments.map((m) => (
            <li key={m.title} className="relative grid grid-cols-[3.3rem_1fr] gap-4 sm:grid-cols-[6rem_3.3rem_1fr]">
              <p className="hidden pt-3 text-right font-display text-lg font-semibold text-slate-500 sm:block">
                {m.when}
              </p>
              <span
                className={cn(
                  'relative z-10 flex h-[3.3rem] w-[3.3rem] items-center justify-center rounded-2xl text-white ring-8 ring-white',
                  HUE[m.hue].solid,
                )}
              >
                <m.icon className="h-6 w-6" />
              </span>
              <div className="pt-1">
                <p className="font-display text-sm font-semibold text-slate-500 sm:hidden">{m.when}</p>
                <h3 className="font-display text-xl font-semibold text-arre-ink">{m.title}</h3>
                <p className="mt-1 max-w-prose text-slate-600">{m.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── Las cuatro áreas ───────────────────────────────────────────────────── */

/**
 * Las cuatro áreas dibujadas como en el planteamiento del producto: una cruz
 * alrededor del emblema (Estudiantes arriba, Académico y Familias a los lados,
 * Finanzas abajo). En el teléfono la cruz no cabe y pasa a lista.
 */
interface AreaDef {
  icon: LucideIcon
  title: string
  desc: string
  hue: Hue
}

function Area({ a }: { a: AreaDef }) {
  return (
    <div className={cn('rounded-[1.75rem] p-5 ring-1', HUE[a.hue].soft, HUE[a.hue].ring)}>
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl text-white', HUE[a.hue].solid)}>
        <a.icon className="h-6 w-6" />
      </span>
      <h3 className="mt-3 font-display text-xl font-semibold text-arre-ink">{a.title}</h3>
      <p className="mt-1 text-slate-600">{a.desc}</p>
    </div>
  )
}

function Areas() {
  const areas: Record<'top' | 'left' | 'right' | 'bottom', AreaDef> = {
    top: {
      icon: GraduationCap,
      title: 'Estudiantes',
      desc: 'Ficha de cada niño con alergias, documentos e historial año tras año.',
      hue: 'sky',
    },
    left: {
      icon: BookOpenCheck,
      title: 'Académico',
      desc: 'Grados, secciones, asistencia, competencias y boletines.',
      hue: 'teal',
    },
    right: {
      icon: HeartHandshake,
      title: 'Familias',
      desc: 'Mamá, papá y tutores; quién recoge y quién paga. Hermanos sin duplicar.',
      hue: 'orange',
    },
    bottom: {
      icon: Wallet,
      title: 'Finanzas',
      desc: 'Mensualidades, pagos, recibos y lo que falta por cobrar.',
      hue: 'leaf',
    },
  }
  return (
    <section id="areas" className="scroll-mt-24 bg-arre-paper py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Cuatro áreas alrededor de cada niño"
          subtitle="Todo lo que un centro de inicial lleva hoy en libretas y hojas de cálculo, conectado."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3 md:grid-rows-3 md:items-center">
          <div className="md:col-start-2 md:row-start-1">
            <Area a={areas.top} />
          </div>
          <div className="md:col-start-1 md:row-start-2">
            <Area a={areas.left} />
          </div>
          {/* El emblema en el centro de la cruz: el niño en medio de todo. */}
          <div className="hidden items-center justify-center md:col-start-2 md:row-start-2 md:flex">
            <div className="flex h-44 w-44 items-center justify-center rounded-full bg-white shadow-[0_18px_40px_-20px_rgba(14,42,92,0.35)] ring-8 ring-arre-sky/10">
              <Logo className="h-28 w-28" />
            </div>
          </div>
          <div className="md:col-start-3 md:row-start-2">
            <Area a={areas.right} />
          </div>
          <div className="md:col-start-2 md:row-start-3">
            <Area a={areas.bottom} />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Boletín de muestra ─────────────────────────────────────────────────── */

const LEVEL_CHIP: Record<AchievementLevel, string> = {
  achieved: 'bg-arre-leaf-deep text-white',
  in_progress: 'bg-arre-orange text-arre-ink',
  started: 'bg-brand-500 text-white',
}

function ReportCardSection() {
  const groups: { area: string; rows: { text: string; level: AchievementLevel }[] }[] = [
    {
      area: 'Comunicación',
      rows: [
        { text: 'Expresa ideas con frases completas', level: 'achieved' },
        { text: 'Reconoce su nombre escrito', level: 'in_progress' },
      ],
    },
    {
      area: 'Pensamiento lógico',
      rows: [
        { text: 'Cuenta objetos hasta 10', level: 'achieved' },
        { text: 'Clasifica por color y forma', level: 'started' },
      ],
    },
    {
      area: 'Desarrollo personal',
      rows: [{ text: 'Se viste con poca ayuda', level: 'in_progress' }],
    },
  ]
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHeading
            align="left"
            title="Se evalúa como se evalúa en inicial"
            subtitle="Competencias, indicadores de logro y la escala de siempre. Nada de convertir a un niño de cuatro años en un promedio."
          />
          <ul className="mt-8 space-y-3">
            {(Object.keys(ACHIEVEMENT_LABEL) as AchievementLevel[]).map((l) => (
              <li key={l} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-11 items-center justify-center rounded-xl font-display font-semibold',
                    LEVEL_CHIP[l],
                  )}
                >
                  {ACHIEVEMENT_SHORT[l]}
                </span>
                <span className="text-lg font-bold text-arre-ink">{ACHIEVEMENT_LABEL[l]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-md text-slate-600">
            El boletín se genera con un clic, la dirección lo publica y queda congelado: lo que se
            entregó a la familia no cambia después.
          </p>
        </div>

        {/* Boletín de muestra: hoja con el borde del libro abierto arriba. */}
        <div className="relative mx-auto w-full max-w-md rotate-[1.2deg] rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(14,42,92,0.35)] ring-1 ring-slate-200">
          <div className="flex h-2 overflow-hidden rounded-full">
            <span className="flex-1 bg-arre-sky" />
            <span className="flex-1 bg-arre-leaf" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Logo className="h-11 w-11" decorative />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold text-arre-ink">Primer trimestre</p>
              <p className="truncate text-sm text-slate-500">Camila Pérez, Kinder A</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {groups.map((g) => (
              <div key={g.area}>
                <p className="font-display font-semibold text-arre-navy">{g.area}</p>
                <ul className="mt-1.5 divide-y divide-slate-100">
                  {g.rows.map((r) => (
                    <li key={r.text} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-slate-700">{r.text}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-lg px-2 py-0.5 font-display text-sm font-semibold',
                          LEVEL_CHIP[r.level],
                        )}
                      >
                        {ACHIEVEMENT_SHORT[r.level]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-2xl bg-arre-paper p-3 text-sm italic text-slate-600">
            «Camila participa con entusiasmo en la ronda y ya ayuda a sus compañeros a recoger.»
          </p>
        </div>
      </div>
    </section>
  )
}

/* ── Quién lo usa ───────────────────────────────────────────────────────── */

/**
 * La misma plataforma vista por cada persona del colegio. No son apps
 * distintas: es una sola cuenta con roles, y cada rol ve solo lo suyo.
 * "Próximamente" va escrito: no se promete como disponible lo que no lo está.
 */
function Roles() {
  const roles: { who: string; product: string; desc: string; hue: Hue; soon?: boolean }[] = [
    {
      who: 'Dirección y secretaría',
      product: `${APP_NAME} Admin`,
      desc: 'El año escolar, las inscripciones, el equipo y los reportes.',
      hue: 'navy',
    },
    {
      who: 'Maestras',
      product: `${APP_NAME} Teacher`,
      desc: 'Lista, evaluaciones y anecdotario, solo de su sección.',
      hue: 'teal',
    },
    {
      who: 'Caja',
      product: `${APP_NAME} Pay`,
      desc: 'Cobros y recibos. Un pago nunca se borra: se anula con motivo.',
      hue: 'orange',
    },
    {
      who: 'Familias',
      product: `${APP_NAME} Family`,
      desc: 'Comunicados, boletines y estado de cuenta para mamá y papá.',
      hue: 'leaf',
      soon: true,
    },
  ]
  return (
    <section className="bg-arre-paper py-20 lg:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Cada quien ve lo suyo"
          subtitle="Una maestra no ve los cobros; la caja no toca las notas. Los permisos los aplica la base de datos, no la pantalla."
        />
        <ul className="mt-12 divide-y divide-arre-sky/15 rounded-[2rem] bg-white px-5 ring-1 ring-arre-sky/15 sm:px-8">
          {roles.map((r) => (
            <li key={r.who} className="flex items-start gap-4 py-5">
              <span className={cn('mt-1.5 h-4 w-4 shrink-0 rounded-full', HUE[r.hue].solid)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-lg font-semibold text-arre-ink">{r.who}</h3>
                  <span className={cn('text-sm font-bold', HUE[r.hue].text)}>{r.product}</span>
                  {r.soon && (
                    <span className="rounded-full bg-arre-orange/15 px-2 py-0.5 text-xs font-bold text-[#C46A00]">
                      Próximamente
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-slate-600">{r.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── Precios ────────────────────────────────────────────────────────────── */

function Pricing() {
  const plans = usePlans()
  // Recorre los planes CONFIGURADOS en vez de dos tarjetas escritas a mano: así
  // publicar un tercer plan desde /admin se refleja aquí sin tocar código.
  const visibles = planOrderFrom(plans).map((c) => plans[c])
  const cols =
    visibles.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : visibles.length === 2 ? 'md:grid-cols-2' : ''
  const ancho = visibles.length >= 3 ? 'max-w-6xl' : 'max-w-4xl'

  return (
    <section id="precios" className="scroll-mt-24 bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Empieza gratis, crece cuando crezcas"
          subtitle="El plan gratis alcanza para un centro pequeño. Cambias de plan desde Configuración, sin perder nada."
        />
        <div className={`mx-auto mt-14 grid grid-cols-1 gap-8 ${ancho} ${cols}`}>
          {visibles.map((p) => (
            <PlanCard key={p.code} plan={p} />
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
          Los topes de cada plan cuentan solo estudiantes activos: los niños que ya egresaron
          siguen en el historial sin ocupar cupo.
        </p>
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: PlanInfo }) {
  const destacado = plan.isFeatured
  const gratis = plan.price === 0

  return (
    <div
      className={
        destacado
          ? 'relative flex flex-col rounded-[2.25rem] bg-arre-navy p-8 text-white shadow-[0_24px_60px_-24px_rgba(11,74,168,0.6)]'
          : 'flex flex-col rounded-[2.25rem] bg-arre-paper p-8 ring-2 ring-arre-sky/20'
      }
    >
      {destacado && (
        <span className="absolute -top-3 left-8 whitespace-nowrap rounded-full bg-arre-orange px-4 py-1 text-sm font-bold text-arre-ink">
          Recomendado
        </span>
      )}
      <h3 className={cn('font-display text-2xl font-semibold', !destacado && 'text-arre-ink')}>{plan.name}</h3>
      <p className={cn('mt-3 font-display text-5xl font-semibold', !destacado && 'text-arre-ink')}>
        {/* El precio siempre en cifra: el plan gratis ya se LLAMA «Gratis» y
            repetirlo como precio dejaba dos «Gratis» seguidos en la tarjeta. */}
        {money(plan.price)}
        <span className={cn('ml-1 font-rounded text-base font-semibold', destacado ? 'text-white/70' : 'text-slate-500')}>
          {PLAN_PRICE_UNIT}
        </span>
      </p>
      <ul className="mt-8 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className={cn('flex items-start gap-3', !destacado && 'text-slate-700')}>
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                destacado ? 'bg-arre-orange text-arre-ink' : 'bg-arre-leaf-deep text-white',
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/registro"
        className={
          destacado
            ? 'mt-8 inline-flex w-full items-center justify-center rounded-full bg-arre-orange py-3.5 text-lg font-bold text-arre-ink transition-colors hover:bg-accent-300'
            : 'mt-8 inline-flex w-full items-center justify-center rounded-full border-2 border-arre-navy py-3.5 text-lg font-bold text-arre-navy transition-colors hover:bg-arre-navy hover:text-white'
        }
      >
        {gratis ? 'Empezar gratis' : `Empezar con ${plan.name}`}
      </Link>
    </div>
  )
}

/* ── Preguntas frecuentes ───────────────────────────────────────────────── */

function Faq() {
  const plans = usePlans()
  const items = [
    {
      q: `¿Qué es ${APP_NAME}?`,
      a: `Una plataforma para administrar tu centro de educación inicial desde un solo lugar: niños y familias, inscripciones, asistencia, evaluaciones y boletines, mensualidades y recibos, comunicados y reportes. Funciona en el teléfono y en la computadora.`,
    },
    {
      q: '¿Sirve para Maternal, Pre-Kinder, Kinder y Preprimario?',
      a: 'Sí. Creas los grados que tenga tu centro, con el orden en que los niños avanzan, y la evaluación usa competencias e indicadores con Logrado, En proceso e Iniciado. Si mañana abres primaria, los grados y las evaluaciones con nota ya están contemplados.',
    },
    {
      q: '¿Necesito conocimientos técnicos?',
      a: 'No. Se abre en el navegador y te guía: creas el año escolar, los grados y las secciones, registras a los niños con su familia y empiezas. Si quieres, la añades a la pantalla de inicio del teléfono como una app más.',
    },
    {
      q: '¿Qué pasa con los datos de los niños?',
      a: 'Son del colegio. ArreSchool los guarda por encargo del colegio, con acceso restringido por rol; las fotos y documentos van a un almacenamiento privado y se abren con enlaces que caducan. Los detalles están en la Política de Privacidad.',
    },
    {
      q: '¿Los datos de mi colegio están separados de los de otros?',
      a: 'Sí. Cada colegio es un espacio aparte y la separación la aplica la base de datos, no la pantalla: aunque una consulta pidiera datos de otro colegio, no los devolvería.',
    },
    {
      q: '¿Puedo pasar lista sin internet?',
      a: 'Sí. La asistencia se guarda en el teléfono si se cae el wifi y sube sola cuando vuelve la señal.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `Puedes empezar gratis con el plan ${plans.basic.name}. Cuando tu centro crezca, el plan ${plans.pro.name} cuesta ${planPriceLabel(plans.pro)}. Los precios y los topes que ves aquí son los que se aplican en la aplicación.`,
    },
  ]
  return (
    <section id="faq" className="scroll-mt-24 bg-arre-paper py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title="Preguntas frecuentes" />
        <div className="mt-12 space-y-3">
          {/* <details> nativo: acordeón accesible y con teclado sin una línea de
              JavaScript, y abierto por defecto si el navegador busca en la
              página (Ctrl+F encuentra el texto de dentro). */}
          {items.map((it, i) => (
            <details
              key={it.q}
              open={i === 0}
              className="group overflow-hidden rounded-3xl bg-white ring-1 ring-arre-sky/15"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-display text-lg font-semibold text-arre-ink">
                {it.q}
                <ChevronDown className="h-5 w-5 flex-shrink-0 text-arre-sky transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 text-slate-600">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Llamada final ──────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="bg-arre-paper px-4 pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 overflow-hidden rounded-[2.5rem] bg-arre-navy px-6 py-14 text-center sm:px-12 lg:flex-row lg:text-left">
        <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem] bg-white p-3">
          <Logo className="h-full w-full" decorative />
        </span>
        <div className="flex-1">
          <SectionHeading
            align="left"
            tone="white"
            title="Tu colegio organizado antes del próximo lunes"
            subtitle="Crea la cuenta, arma tus grados y secciones y pasa la primera lista. Sin tarjeta."
          />
        </div>
        <Link
          to="/registro"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-arre-orange px-9 py-4 text-lg font-bold text-arre-ink transition-colors hover:bg-accent-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        >
          Crear mi colegio gratis
        </Link>
      </div>
    </section>
  )
}

/* ── Pie ────────────────────────────────────────────────────────────────── */

function Footer() {
  // `id` = sección de esta página · `to` = otra ruta · `href` = enlace externo o
  // mailto · sin nada = «Próximamente» (texto apagado, no un enlace muerto).
  const cols: {
    title: string
    items: { label: string; id?: string; to?: string; href?: string }[]
  }[] = [
    {
      title: 'Producto',
      items: [
        { label: 'Un día', id: 'un-dia' },
        { label: 'Áreas', id: 'areas' },
        { label: 'Precios', id: 'precios' },
        { label: 'Preguntas', id: 'faq' },
      ],
    },
    {
      title: 'Cuenta',
      items: [
        { label: 'Iniciar sesión', to: '/login' },
        { label: 'Crear cuenta', to: '/registro' },
        { label: 'Contacto', href: `mailto:${LEGAL_CONTACT_EMAIL}` },
      ],
    },
    {
      title: 'Legal',
      items: [
        { label: 'Privacidad', to: LEGAL_PATHS.privacy },
        { label: 'Términos', to: LEGAL_PATHS.terms },
      ],
    },
  ]
  const linkCls = 'text-white/60 transition-colors hover:text-arre-orange'
  return (
    <footer className="bg-arre-ink py-16 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <Wordmark dark />
            <p className="mt-4 text-sm text-white/65">
              {APP_TAGLINE}. La plataforma para centros de educación inicial: niños, aula,
              familias y mensualidades en un solo lugar.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-white/65">
              <ShieldCheck className="h-4 w-4 shrink-0 text-arre-leaf" />
              Los datos de cada colegio, aparte de los demás.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.title}>
                <h2 className="mb-4 font-display text-lg font-semibold text-white">{c.title}</h2>
                <ul className="space-y-2.5 text-sm">
                  {c.items.map((it) =>
                    it.id ? (
                      <li key={it.label}>
                        <SectionLink id={it.id} className={linkCls}>
                          {it.label}
                        </SectionLink>
                      </li>
                    ) : it.to ? (
                      <li key={it.label}>
                        <Link to={it.to} className={linkCls}>
                          {it.label}
                        </Link>
                      </li>
                    ) : it.href ? (
                      <li key={it.label}>
                        <a href={it.href} className={cn('break-words', linkCls)}>
                          {it.label}
                        </a>
                      </li>
                    ) : (
                      <li key={it.label} className="text-white/40" title="Próximamente">
                        {it.label}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {/* El año se calcula: un «© 2026» escrito a mano envejece al día
            siguiente de enero y es lo primero que delata un sitio abandonado. */}
        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-white/45">
          © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  )
}
