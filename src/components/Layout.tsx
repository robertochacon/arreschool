import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Settings, UserRound, LogOut, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/auth/AuthProvider'
import { Wordmark, Logo } from '@/components/Logo'
import { OfflineBar } from '@/components/OfflineBar'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/Badge'
import type { SubscriptionStatus } from '@/types/db'

/**
 * Cascarón de la app protegida: navegación, cabecera y <Outlet/>.
 *
 * Una sola lista de destinos alimenta las DOS navegaciones (barra lateral desde
 * `lg`, barra inferior en el teléfono). Duplicarla es la forma clásica de que
 * una pantalla nueva aparezca en el escritorio y no en el móvil.
 *
 * Caben las cuatro en la barra inferior a 360px (90px cada una), así que no hace
 * falta el cajón lateral ni un botón «Más». Si añades destinos, deja como mucho
 * cinco abajo y manda el resto a un cajón: por debajo de ~72px de ancho el texto
 * se parte.
 */
interface NavItemDef {
  to: string
  label: string
  icon: LucideIcon
  /** Solo para '/': sin `end` la raíz quedaría activa en todas las rutas. */
  end?: boolean
}

const NAV: NavItemDef[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
]

/** Estado de la suscripción, en el idioma del negocio y con su color. */
const STATUS_BADGE: Record<SubscriptionStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  trial: { label: 'Prueba', tone: 'amber' },
  active: { label: 'Activo', tone: 'green' },
  past_due: { label: 'Pago pendiente', tone: 'red' },
  canceled: { label: 'Cancelado', tone: 'slate' },
}

export function Layout() {
  const { tenant, profile, plan, subscription, isPlatformAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  // Fondo un paso más oscuro que el `bg-slate-50` del body (que se queda para la
  // landing, los legales y el login): sobre este gris las tarjetas blancas se
  // despegan y la app se lee como capas y no como una sola hoja.
  return (
    <div className="min-h-[100dvh] bg-slate-100">
      {/* ── Barra lateral (desde lg) ────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <SideItem key={item.to} {...item} />
          ))}
          {/* El panel de plataforma no está en NAV: no es parte de la app del
              negocio y solo lo ve quien es super-admin. */}
          {isPlatformAdmin && (
            <SideItem to="/admin" label="Plataforma" icon={ShieldCheck} />
          )}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <PlanPill plan={plan.name} status={subscription?.status} />
        </div>
      </aside>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          {/* En móvil no hay barra lateral, así que la marca vive aquí. */}
          <Logo className="h-8 w-8 lg:hidden" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {tenant?.name ?? 'Mi negocio'}
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menú de la cuenta"
              className="flex items-center gap-2 rounded-full p-1 hover:bg-slate-100"
            >
              <Avatar name={profile?.full_name ?? tenant?.name} src={profile?.avatar_url} size="sm" />
            </button>
            {menuOpen && (
              <>
                {/* Capa invisible a pantalla completa: un toque en cualquier
                    sitio cierra el menú. Es lo que hace que funcione igual con
                    el dedo que con el ratón (no hay `blur` en un toque fuera). */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-card-hover animate-fade-in">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {profile?.full_name ?? 'Mi cuenta'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{tenant?.name}</p>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem
                    icon={UserRound}
                    label="Mi perfil"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/perfil')
                    }}
                  />
                  <MenuItem
                    icon={Settings}
                    label="Configuración"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/configuracion')
                    }}
                  />
                  <MenuItem icon={LogOut} label="Cerrar sesión" onClick={handleSignOut} danger />
                </div>
              </>
            )}
          </div>
        </header>

        <OfflineBar />

        {/* `pb-24` en móvil: la barra inferior es fija y taparía la última fila
            (o el botón de guardar) de cada pantalla. */}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* ── Barra inferior (solo móvil) ─────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <BottomItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  )
}

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function SideItem({ to, label, icon: Icon, end }: NavItemDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  )
}

function BottomItem({ to, label, icon: Icon, end }: NavItemDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2',
          isActive ? 'text-brand-600' : 'text-slate-500',
        )
      }
    >
      <Icon className="h-5 w-5" />
      {/* 10px y `truncate`: «Configuración» no cabe entera a 360px y sin esto
          rompería el reparto en cuatro columnas iguales. */}
      <span className="max-w-full truncate px-1 text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/** Plan vigente al pie de la barra lateral: recuerda en qué plan se está sin
 *  tener que entrar a Configuración. */
function PlanPill({ plan, status }: { plan: string; status?: SubscriptionStatus }) {
  const badge = status ? STATUS_BADGE[status] : null
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">Plan</p>
        <p className="truncate text-sm font-semibold text-slate-800">{plan}</p>
      </div>
      {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
    </div>
  )
}
