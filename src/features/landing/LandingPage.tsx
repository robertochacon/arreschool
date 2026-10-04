import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  History,
  LayoutDashboard,
  Menu,
  Package,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { usePlanSettings, toPlanMap } from '@/hooks/plans'
import { money } from '@/lib/format'
import {
  APP_NAME,
  APP_TAGLINE,
  ITEM_STATUS_LABEL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PATHS,
  PLAN_PRICE_UNIT,
  planOrderFrom,
  planPriceLabel,
  type PlanInfo,
} from '@/lib/constants'
import { Wordmark } from '@/components/Logo'
import type { PlanCode } from '@/types/db'

/**
 * Página pública de marketing: es lo que ve en `/` quien NO tiene sesión
 * (App.tsx la monta desde el guard, sin redirigir).
 *
 * Todo el contenido es GENÉRICO y hay que reescribirlo al adoptar el starter.
 * Lo que sí conviene conservar es la estructura: gancho → prueba → funciones →
 * cómo se usa → precios → dudas → llamada final. Y una regla: nada de cifras
 * inventadas («+1.000 negocios confían en nosotros») ni testimonios de mentira;
 * mientras no haya clientela real, la franja de confianza dice hechos del
 * producto, que sí son verificables.
 */
export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-brand-950">
      <Navbar />
      <Hero />
      <TrustBar />
      <Features />
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
  { id: 'funciones', label: 'Funciones' },
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
            Todo tu negocio, <span className="text-brand-600">en un solo lugar</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
            {APP_NAME} reúne tus registros, tu equipo y tus números en una sola aplicación.
            Se abre en el teléfono y sigue funcionando cuando se cae la señal.
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
              <Check className="h-4 w-4 text-brand-500" /> Listo en dos minutos
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
 *  una captura real se queda vieja en el primer rediseño). */
function PhoneMockup() {
  const rows = [
    { name: 'Contrato Almacén Sur', amount: 18500, status: 'active' as const },
    { name: 'Mantenimiento mensual', amount: 7200, status: 'active' as const },
    { name: 'Propuesta Ferretería', amount: 4300, status: 'draft' as const },
    { name: 'Servicio anterior', amount: 12000, status: 'archived' as const },
  ]
  const statusTone: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-600',
    draft: 'bg-amber-50 text-amber-600',
    archived: 'bg-slate-100 text-slate-400',
  }
  return (
    <div className="relative rounded-[2.2rem] border-[6px] border-brand-950 bg-white p-3 shadow-2xl">
      <div className="absolute right-4 top-6 z-10 flex items-center gap-1 rounded-lg bg-accent-400 px-2.5 py-1.5 text-xs font-bold text-brand-950 shadow-lg">
        <CheckCircle2 className="h-4 w-4" /> Al día
      </div>
      <div className="rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-400">Panel</p>
        <h3 className="text-lg font-bold text-brand-950">Este mes</h3>
        <div className="mt-3 rounded-2xl bg-white p-3 shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Total registrado</span>
            <span className="text-sm font-semibold text-brand-950">{money(42000)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 rounded-full bg-brand-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs text-slate-400">8 items activos</span>
            <span className="text-xs font-medium text-brand-600">+3 esta semana</span>
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
                <p className="text-[10px] text-slate-400">{money(r.amount)}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone[r.status]}`}
              >
                {ITEM_STATUS_LABEL[r.status]}
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
 * Hechos del producto, no métricas de vanidad. Cuando tengas cifras reales
 * (negocios activos, antigüedad, tiempo de actividad) cámbialas aquí — pero solo
 * si puedes sostenerlas.
 */
function TrustBar() {
  const items = [
    { icon: WifiOff, big: 'Sin conexión', small: 'Registra ahora, sube después' },
    { icon: ShieldCheck, big: 'Datos aislados', small: 'Un negocio nunca ve el de otro' },
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
  const features = [
    {
      icon: LayoutDashboard,
      title: 'Panel de un vistazo',
      desc: 'Lo activo, lo pendiente y el total del mes en la primera pantalla. Sin armar un informe.',
      tone: 'brand',
    },
    {
      icon: Package,
      title: 'Tus registros, en orden',
      desc: 'Crea, edita, archiva y busca los items de tu negocio desde el teléfono, sin hojas de cálculo sueltas.',
      tone: 'brand',
    },
    {
      icon: Users,
      title: 'Tu equipo, con su acceso',
      desc: 'Invita a quien administra contigo. Cada persona entra con su propia cuenta y puedes retirarle el acceso.',
      tone: 'accent',
    },
    {
      icon: WifiOff,
      title: 'Funciona sin señal',
      desc: 'Lo que registras sin datos se guarda en el aparato y sube solo cuando vuelve la conexión.',
      tone: 'green',
    },
    {
      icon: ShieldCheck,
      title: 'Cada negocio, aislado',
      desc: 'La separación entre negocios la impone la base de datos, no la pantalla: nadie llega a lo que no es suyo.',
      tone: 'brand',
    },
    {
      icon: History,
      title: 'Historial de lo que pasa',
      desc: 'Queda anotado quién cambió qué y cuándo. Útil el día que hay que revisar algo.',
      tone: 'accent',
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
          title="Lo que necesitas para el día a día"
          subtitle="Las funciones que se usan todos los días, sin las que solo se usan en la demo."
        />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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

/* ── Cómo funciona ──────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: 'Crea tu cuenta',
      desc: 'Correo, contraseña y el nombre de tu negocio. No pedimos tarjeta para empezar.',
    },
    {
      n: 2,
      title: 'Carga tus registros',
      desc: 'Añade tus items con su monto, su fecha y su estado. Puedes hacerlo desde el teléfono, aunque estés en la calle.',
    },
    {
      n: 3,
      title: 'Suma a tu equipo',
      desc: 'Invita a quien administra contigo y trabajen sobre los mismos datos, cada quien con su cuenta.',
    },
  ]
  return (
    <section id="proceso" className="scroll-mt-24 overflow-hidden bg-white py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="order-2 space-y-8 lg:order-1">
          <SectionHeading
            align="left"
            title="Así de sencillo"
            subtitle="De la hoja de cálculo al teléfono en tres pasos."
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
                Los números al día, sin cerrar el mes a mano.
              </p>
              <p className="mt-2 text-white/70">
                Cada registro actualiza el panel al instante. Lo que ves es lo que hay.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Activos', value: '8' },
                { label: 'Borradores', value: '2' },
                { label: 'Este mes', value: money(42000) },
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
          subtitle="Empieza gratis y cambia de plan cuando el negocio lo pida."
        />
        <div className={`mx-auto mt-14 grid grid-cols-1 gap-8 ${ancho} ${cols}`}>
          {visibles.map((p) => (
            <PlanCard key={p.code} plan={p} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Los topes de cada plan se aplican en el servidor. Puedes subir o bajar de plan
          desde Configuración.
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
      a: `Una aplicación web para administrar tu negocio: llevas tus registros, ves tus números y trabajas con tu equipo desde el mismo sitio, en el teléfono o en la computadora.`,
    },
    {
      q: '¿Tengo que instalar algo?',
      a: 'No. Se abre en el navegador. Si quieres tenerla como una app más, desde el propio navegador puedes añadirla a la pantalla de inicio: se abre a pantalla completa y funciona igual.',
    },
    {
      q: '¿Funciona sin internet?',
      a: 'Sí. Puedes consultar lo último que cargaste y registrar cosas nuevas sin conexión; quedan en cola en tu aparato y suben solas cuando vuelve la señal. Una franja te avisa de cuántos cambios faltan por subir.',
    },
    {
      q: '¿Puedo trabajar con más personas?',
      a: 'Sí, en los planes que lo permiten. Invitas por correo, cada persona entra con su propia cuenta y puedes retirarle el acceso cuando quieras.',
    },
    {
      q: '¿Mis datos están separados de los de otros negocios?',
      a: 'Sí. Cada negocio es un espacio aparte y la separación la aplica la base de datos, no la pantalla: aunque una consulta pidiera datos de otro negocio, no los devolvería.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `Puedes empezar gratis con el plan ${plans.basic.name}. Cuando necesites más, el plan ${plans.pro.name} cuesta ${planPriceLabel(plans.pro)}. Los precios y los topes que ves aquí son los que se aplican en la aplicación.`,
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
            Crea tu cuenta gratis y ten tu negocio ordenado esta misma tarde.
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
        { label: 'Funciones', id: 'funciones' },
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
              {APP_TAGLINE}. Una herramienta sencilla para llevar las cuentas de un negocio
              pequeño sin complicarse la vida.
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
