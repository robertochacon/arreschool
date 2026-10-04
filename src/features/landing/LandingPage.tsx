import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  HeartHandshake,
  Menu,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react'
import { usePlanSettings, toPlanMap } from '@/hooks/plans'
import { money } from '@/lib/format'
import {
  APP_NAME,
  APP_TAGLINE,
  ATTENDANCE_STATUS_LABEL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PATHS,
  PLAN_PRICE_UNIT,
  planOrderFrom,
  planPriceLabel,
  type PlanInfo,
} from '@/lib/constants'
import { Wordmark } from '@/components/Logo'
import type { AttendanceStatus, PlanCode } from '@/types/db'

/**
 * Página pública de ArreSchool: es lo que ve en `/` quien NO tiene sesión
 * (App.tsx la monta desde el guard, sin redirigir).
 *
 * Público: la directora o el dueño de un colegio pequeño —hoy, de educación
 * inicial— que lleva matrícula, asistencia y cobros en libretas y hojas de
 * cálculo. Estructura: gancho → prueba → las cuatro áreas → los productos →
 * cómo se empieza → precios → dudas → llamada final.
 *
 * Regla que se mantiene del starter: nada de cifras inventadas («+500 colegios
 * confían en nosotros») ni testimonios de mentira. Mientras no haya clientela
 * real, la franja de confianza dice hechos del producto, que sí son verificables.
 */
export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-brand-950">
      <Navbar />
      <Hero />
      <TrustBar />
      <Features />
      <Products />
      <HowItWorks />
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
}: {
  title: string
  subtitle?: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <h2 className="text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-lg text-slate-600">{subtitle}</p>}
    </div>
  )
}

/* ── Barra de navegación ────────────────────────────────────────────────── */

/** Secciones del menú. Las comparten la barra y el panel del teléfono. */
const NAV_LINKS = [
  { id: 'funciones', label: 'Áreas' },
  { id: 'productos', label: 'Productos' },
  { id: 'proceso', label: 'Cómo funciona' },
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
        <div className="fixed inset-0 z-40 bg-brand-950/30 md:hidden" onClick={closeMenu} aria-hidden />
      )}
      <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Wordmark />
          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <SectionLink
                key={l.id}
                id={l.id}
                className="whitespace-nowrap text-sm font-semibold text-slate-500 transition-colors hover:text-brand-600"
              >
                {l.label}
              </SectionLink>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-brand-600 sm:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/registro"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/20 active:scale-95"
            >
              Empezar gratis
            </Link>
            <button
              ref={toggleRef}
              type="button"
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              aria-controls="menu-movil"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
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
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-200/70 bg-slate-50 px-4 pb-4 pt-2 shadow-card-hover animate-fade-in md:hidden"
          >
            {NAV_LINKS.map((l) => (
              <SectionLink
                key={l.id}
                id={l.id}
                onNavigate={closeMenu}
                className="block rounded-lg px-3 py-3 text-base font-semibold text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-600"
              >
                {l.label}
              </SectionLink>
            ))}
            {/* En la barra, «Iniciar sesión» está oculto por debajo de `sm` (no
                cabe junto al CTA), y es justo ahí donde hace falta. */}
            <Link
              to="/login"
              onClick={closeMenu}
              className="mt-2 flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition-colors hover:border-brand-200 hover:text-brand-600 sm:hidden"
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
      {/* Trama de puntos: da profundidad sin cargar una imagen (y sin una
          petición más en la primera pantalla, que es la que se mide). */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, rgba(37,99,235,0.06) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-2 lg:px-8 lg:pb-28 lg:pt-16">
        <div className="text-center lg:text-left">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <ShieldCheck className="h-4 w-4" />
            {APP_TAGLINE}
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-brand-950 sm:text-5xl lg:text-6xl">
            Todo tu colegio, <span className="text-brand-600">en una sola plataforma</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
            {APP_NAME} reúne estudiantes, familias, asistencia, evaluaciones y cobros en una
            sola aplicación. Pensada para educación inicial, lista para crecer a primaria y
            secundaria. Sin instalar nada y sin conocimientos técnicos.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to="/registro"
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:bg-brand-700"
            >
              Empezar gratis
            </Link>
            <SectionLink
              id="proceso"
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-brand-200 px-8 py-4 text-base font-semibold text-brand-600 transition-all hover:bg-brand-50"
            >
              <PlayCircle className="h-5 w-5" />
              Ver cómo funciona
            </SectionLink>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-500 lg:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-brand-500" /> Sin tarjeta para empezar
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-brand-500" /> Tu colegio listo en una tarde
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-brand-500" /> Cancela cuando quieras
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-6 rounded-[40px] bg-brand-500/10 blur-3xl" />
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}

/** Vista previa de la app dentro de un marco de teléfono (puro CSS, sin imágenes:
 *  una captura real se queda vieja en el primer rediseño). Enseña la tarea que
 *  más se repite en un colegio: pasar lista por la mañana. */
function PhoneMockup() {
  const rows: { name: string; status: AttendanceStatus }[] = [
    { name: 'Ana Martínez', status: 'present' },
    { name: 'Luis Pérez', status: 'present' },
    { name: 'Sofía Díaz', status: 'late' },
    { name: 'Mateo Gómez', status: 'absent' },
  ]
  const statusTone: Record<AttendanceStatus, string> = {
    present: 'bg-emerald-50 text-emerald-600',
    late: 'bg-amber-50 text-amber-600',
    absent: 'bg-red-50 text-red-500',
    excused: 'bg-slate-100 text-slate-500',
  }
  return (
    <div className="relative rounded-[2.2rem] border-[6px] border-brand-950 bg-white p-3 shadow-2xl">
      <div className="absolute right-4 top-6 z-10 flex items-center gap-1 rounded-lg bg-accent-400 px-2.5 py-1.5 text-xs font-bold text-brand-950 shadow-lg">
        <CheckCircle2 className="h-4 w-4" /> Lista guardada
      </div>
      <div className="rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-400">Asistencia · hoy</p>
        <h3 className="text-lg font-bold text-brand-950">Kinder A</h3>
        <div className="mt-3 rounded-2xl bg-white p-3 shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Presentes</span>
            <span className="text-sm font-semibold text-brand-950">18 de 20</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[90%] rounded-full bg-brand-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs text-slate-400">Mensualidades al día</span>
            <span className="text-xs font-medium text-brand-600">{money(185000)} cobrado</span>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-brand-950">{r.name}</p>
                <p className="text-[10px] text-slate-400">Kinder A</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone[r.status]}`}
              >
                {ATTENDANCE_STATUS_LABEL[r.status]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Franja de confianza ────────────────────────────────────────────────── */

/**
 * Hechos del producto, no métricas de vanidad. Cuando haya cifras reales
 * (colegios activos, estudiantes, tiempo de actividad) se cambian aquí — pero
 * solo si se pueden sostener.
 */
function TrustBar() {
  const items = [
    { icon: ShieldCheck, big: 'Cada colegio, aislado', small: 'Un colegio nunca ve los datos de otro' },
    { icon: WifiOff, big: 'Lista sin señal', small: 'Pasa lista sin wifi; sube sola después' },
    { icon: Smartphone, big: 'Se instala', small: 'Como una app, sin tienda' },
  ]
  return (
    <section className="bg-brand-950">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 py-8 sm:px-6 md:flex-row lg:px-8">
        {items.map((it) => (
          <div key={it.small} className="flex items-center gap-4">
            <div className="rounded-xl bg-white/10 p-3">
              <it.icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-white">{it.big}</div>
              <div className="text-sm text-white/60">{it.small}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Funciones ──────────────────────────────────────────────────────────── */

function Features() {
  // Las cuatro áreas del producto. Todo lo demás (asistencia, boletines,
  // recibos, comunicados) cuelga de alguna de ellas.
  const features = [
    {
      icon: GraduationCap,
      title: 'Estudiantes',
      desc: 'Ficha completa de cada niño: datos, alergias, documentos e historial año tras año. Inscripciones y secciones sin hojas sueltas.',
      tone: 'brand',
    },
    {
      icon: Star,
      title: 'Académico',
      desc: 'Años escolares, grados y secciones; asistencia diaria; evaluación por competencias e indicadores (Logrado, En proceso, Iniciado) y boletines listos para imprimir.',
      tone: 'accent',
    },
    {
      icon: Wallet,
      title: 'Finanzas',
      desc: 'Mensualidades e inscripciones generadas para todo el colegio en un clic, pagos con recibo numerado y cuentas pendientes al día.',
      tone: 'green',
    },
    {
      icon: HeartHandshake,
      title: 'Familias',
      desc: 'Padres, madres y tutores con sus datos de contacto, quién puede recoger a cada niño y quién responde por los pagos. Hermanos sin fichas duplicadas.',
      tone: 'brand',
    },
  ] as const
  const toneMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    accent: 'bg-accent-100 text-accent-600',
    green: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <section id="funciones" className="scroll-mt-24 bg-slate-50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Cuatro áreas, un solo lugar"
          subtitle="Lo que un colegio hace todos los días, sin las funciones que solo se usan en la demo."
        />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${toneMap[f.tone]}`}
              >
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-1.5 text-lg font-bold text-brand-950">{f.title}</h3>
              <p className="text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Productos ──────────────────────────────────────────────────────────── */

/**
 * La misma plataforma vista por cada persona del colegio. No son apps
 * distintas: es una sola cuenta con roles, y cada rol ve solo lo suyo.
 * "Próximamente" va escrito: no se promete como disponible lo que no lo está.
 */
function Products() {
  const products = [
    {
      icon: ShieldCheck,
      name: `${APP_NAME} Admin`,
      who: 'Dirección y secretaría',
      desc: 'Estructura del colegio, inscripciones, equipo con roles y permisos.',
    },
    {
      icon: CalendarCheck,
      name: `${APP_NAME} Teacher`,
      who: 'Docentes',
      desc: 'Pasar lista desde el teléfono, evaluar indicadores y escribir observaciones de su sección.',
    },
    {
      icon: Wallet,
      name: `${APP_NAME} Pay`,
      who: 'Caja y finanzas',
      desc: 'Cargos, cobros, recibos y anulaciones con motivo. Nada se borra en silencio.',
    },
    {
      icon: BarChart3,
      name: `${APP_NAME} Reports`,
      who: 'Dirección',
      desc: 'Asistencia, matrícula por grado, ingresos y cuentas por cobrar en una pantalla.',
    },
    {
      icon: Users,
      name: `${APP_NAME} Family`,
      who: 'Padres y tutores',
      desc: 'Comunicados, boletines y estado de cuenta para las familias.',
      soon: true,
    },
  ]
  return (
    <section id="productos" className="scroll-mt-24 bg-white py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Una plataforma, una vista para cada quien"
          subtitle="La docente ve su sección; la caja, los cobros; la Dirección, todo. Los permisos los aplica la base de datos, no la pantalla."
        />
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <p.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-brand-950">{p.name}</h3>
                  <p className="text-xs text-slate-500">{p.who}</p>
                </div>
                {p.soon && (
                  <span className="ml-auto shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                    Próximamente
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Cómo funciona ──────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: 'Crea tu colegio',
      desc: 'Correo, contraseña y el nombre del colegio. No pedimos tarjeta para empezar.',
    },
    {
      n: 2,
      title: 'Arma tu año escolar',
      desc: 'Crea el año, los grados y las secciones; registra a tus estudiantes con su familia e inscríbelos. Todo guiado, paso a paso.',
    },
    {
      n: 3,
      title: 'Suma a tu equipo',
      desc: 'Invita a docentes, secretaría y finanzas. Cada quien entra con su cuenta y ve solo lo que le toca.',
    },
  ]
  return (
    <section id="proceso" className="scroll-mt-24 overflow-hidden bg-white py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="order-2 space-y-8 lg:order-1">
          <SectionHeading
            align="left"
            title="Así de sencillo"
            subtitle="De la libreta y la hoja de cálculo a una sola plataforma en tres pasos."
          />
          {steps.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  s.n === 1 ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'
                }`}
              >
                {s.n}
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-950">{s.title}</h3>
                <p className="mt-0.5 text-slate-600">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative order-1 lg:order-2">
          <div className="absolute -right-8 -top-8 h-64 w-64 rounded-full bg-brand-200/30 blur-3xl" />
          <div className="relative rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-2xl">
            <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white">
              <BarChart3 className="h-12 w-12 text-accent-300" />
              <p className="mt-4 text-2xl font-extrabold leading-tight">
                Asistencia, notas y cobros, siempre al día.
              </p>
              <p className="mt-2 text-white/70">
                Cada lista, cada evaluación y cada pago actualiza el panel al instante.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Estudiantes', value: '86' },
                { label: 'Asistencia', value: '94%' },
                { label: 'Cobrado', value: money(185000) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="truncate text-sm font-bold text-brand-950">{s.value}</p>
                  <p className="text-[11px] text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
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
    <section id="precios" className="scroll-mt-24 bg-slate-50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Planes que crecen contigo"
          subtitle="Empieza gratis y cambia de plan cuando tu colegio crezca."
        />
        <div className={`mx-auto mt-14 grid grid-cols-1 gap-8 ${ancho} ${cols}`}>
          {visibles.map((p) => (
            <PlanCard key={p.code} plan={p} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Los topes de cada plan se aplican en el servidor y cuentan solo estudiantes
          activos: el historial de egresados no ocupa cupo. Cambias de plan desde Configuración.
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
          ? 'relative flex flex-col rounded-[32px] bg-brand-600 p-8 text-center text-white shadow-2xl shadow-brand-600/30'
          : 'flex flex-col rounded-[32px] border border-slate-200 bg-white p-8 text-center'
      }
    >
      {destacado && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-400 px-4 py-1 text-xs font-bold uppercase tracking-widest text-brand-950 shadow-md">
          Recomendado
        </span>
      )}
      <h3 className={`text-xl font-bold ${destacado ? '' : 'text-brand-950'}`}>{plan.name}</h3>
      <p className={`mt-4 text-4xl font-black ${destacado ? '' : 'text-brand-950'}`}>
        {gratis ? 'Gratis' : money(plan.price)}
        {!gratis && (
          <span className={`text-base font-medium ${destacado ? 'text-white/60' : 'text-slate-400'}`}>
            {` ${PLAN_PRICE_UNIT}`}
          </span>
        )}
      </p>
      <ul className="mt-8 flex-1 space-y-4 text-left">
        {plan.features.map((f) => (
          <li key={f} className={`flex items-start gap-3 ${destacado ? '' : 'text-slate-600'}`}>
            <Check
              className={`mt-0.5 h-5 w-5 flex-shrink-0 ${destacado ? 'text-accent-300' : 'text-brand-600'}`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/registro"
        className={
          destacado
            ? 'mt-8 inline-flex w-full items-center justify-center rounded-xl bg-accent-400 py-3.5 font-bold text-brand-950 shadow-xl transition-all hover:scale-[1.02]'
            : 'mt-8 inline-flex w-full items-center justify-center rounded-xl border-2 border-brand-600 py-3.5 font-bold text-brand-700 transition-all hover:bg-brand-50'
        }
      >
        {gratis ? 'Empezar ahora' : `Empezar con ${plan.name}`}
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
      a: `Una plataforma para administrar tu colegio desde un solo lugar: estudiantes y familias, inscripciones, asistencia, evaluaciones y boletines, cobros y recibos, comunicados y reportes. Funciona en el teléfono y en la computadora.`,
    },
    {
      q: '¿Sirve para mi nivel educativo?',
      a: 'Hoy está pensada para educación inicial y preescolar (evaluación por competencias con Logrado / En proceso / Iniciado). El modelo ya contempla primaria y secundaria: los grados llevan su nivel y las evaluaciones admiten calificación numérica.',
    },
    {
      q: '¿Necesito conocimientos técnicos?',
      a: 'No. Se abre en el navegador y te guía: creas el año escolar, los grados y las secciones, registras a tus estudiantes y empiezas. Si quieres, la añades a la pantalla de inicio del teléfono como una app más.',
    },
    {
      q: '¿Los datos de mi colegio están separados de los de otros?',
      a: 'Sí. Cada colegio es un espacio aparte y la separación la aplica la base de datos, no la pantalla: aunque una consulta pidiera datos de otro colegio, no los devolvería. Además, cada rol ve solo lo suyo: una docente no ve los cobros.',
    },
    {
      q: '¿Qué pasa con los datos de los niños?',
      a: 'Son del colegio. ArreSchool los guarda por encargo del colegio, con acceso restringido por rol; las fotos y documentos van a un almacenamiento privado y se abren con enlaces que caducan. Los detalles están en la Política de Privacidad.',
    },
    {
      q: '¿Puedo pasar lista sin internet?',
      a: 'Sí. La asistencia se guarda en el teléfono si se cae el wifi y sube sola cuando vuelve la señal. Una franja avisa de cuántos cambios faltan por subir.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `Puedes empezar gratis con el plan ${plans.basic.name}. Cuando tu colegio crezca, el plan ${plans.pro.name} cuesta ${planPriceLabel(plans.pro)}. Los precios y los topes que ves aquí son los que se aplican en la aplicación.`,
    },
  ]
  return (
    <section id="faq" className="scroll-mt-24 bg-white py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title="Preguntas frecuentes" />
        <div className="mt-12 space-y-4">
          {/* <details> nativo: acordeón accesible y con teclado sin una línea de
              JavaScript, y abierto por defecto si el navegador busca en la
              página (Ctrl+F encuentra el texto de dentro). */}
          {items.map((it, i) => (
            <details
              key={it.q}
              open={i === 0}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-brand-950">
                {it.q}
                <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200 p-5 pt-4 text-slate-600">{it.a}</div>
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
    <section className="bg-white px-4 pb-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-center text-white shadow-2xl sm:p-16">
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Empieza hoy, sin compromiso
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
            Crea tu cuenta gratis y ten tu colegio organizado esta misma tarde.
          </p>
          <Link
            to="/registro"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent-400 px-10 py-5 text-lg font-bold text-brand-950 shadow-2xl transition-all hover:scale-105 active:scale-95"
          >
            Crear mi cuenta gratis
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
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
        { label: 'Áreas', id: 'funciones' },
        { label: 'Productos', id: 'productos' },
        { label: 'Cómo funciona', id: 'proceso' },
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
  return (
    <footer className="bg-brand-950 py-16 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <Wordmark dark />
            <p className="mt-4 text-sm text-white/60">
              {APP_TAGLINE}. La plataforma sencilla para administrar colegios: estudiantes,
              académico, finanzas y familias en un solo lugar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.title}>
                <h2 className="mb-4 font-bold text-white">{c.title}</h2>
                <ul className="space-y-2.5 text-sm">
                  {c.items.map((it) =>
                    it.id ? (
                      <li key={it.label}>
                        <SectionLink
                          id={it.id}
                          className="text-white/50 transition-colors hover:text-accent-400"
                        >
                          {it.label}
                        </SectionLink>
                      </li>
                    ) : it.to ? (
                      <li key={it.label}>
                        <Link
                          to={it.to}
                          className="text-white/50 transition-colors hover:text-accent-400"
                        >
                          {it.label}
                        </Link>
                      </li>
                    ) : it.href ? (
                      <li key={it.label}>
                        <a
                          href={it.href}
                          className="break-words text-white/50 transition-colors hover:text-accent-400"
                        >
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
        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-white/40">
          © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  )
}
