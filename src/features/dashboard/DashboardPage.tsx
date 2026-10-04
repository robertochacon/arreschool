import { Link } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Package,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDashboard } from '@/hooks/dashboard'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { ITEM_STATUS_LABEL, planPriceLabel } from '@/lib/constants'
import { money, num } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import type { ItemStatus } from '@/types/db'

/**
 * Panel de inicio: el resumen del negocio en una sola pantalla.
 *
 * Todo sale de la RPC `dashboard_summary()` y NO de la lista de items: es una
 * sola vuelta de red con las cifras ya agregadas en la base, así que el panel
 * abre igual de rápido con diez items que con diez mil.
 *
 * El botón de crear enlaza a `/items?nuevo=1` en vez de montar aquí el
 * formulario: el alta vive en UN solo sitio (`ItemFormModal`), y duplicarla
 * sería duplicar también sus validaciones y su aviso de tope de plan.
 */
export function DashboardPage() {
  const { profile, tenant, plan } = useAuth()
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard()

  if (isLoading) return <PageLoader label="Cargando tu resumen…" />

  if (isError || !data) {
    return (
      <div>
        <PageHeader title="Inicio" />
        <Card>
          <CardBody className="space-y-3 text-center">
            <p className="text-sm text-red-600">
              {errorMessage(error, 'No se pudo cargar el resumen.')}
            </p>
            <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
              Reintentar
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Solo el primer nombre: en la cabecera de un teléfono, "María de los Ángeles
  // Pérez" empuja el saludo a tres líneas.
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? 'Hola'
  const currency = tenant?.currency

  return (
    <div>
      <PageHeader
        title={`¡Hola, ${firstName}!`}
        description={
          tenant?.name ? `Este es el resumen de ${tenant.name}` : 'Este es el resumen de tu negocio'
        }
        action={
          <Link to="/items?nuevo=1">
            <Button>
              <Plus className="h-4 w-4" /> Nuevo item
            </Button>
          </Link>
        }
      />

      {/* Dos columnas en el teléfono y tres desde `lg`: seis tarjetas en una
          fila dejarían ~128px cada una y un importe de seis cifras no cabe. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Items"
          value={num(data.total_items)}
          icon={<Package className="h-5 w-5" />}
          tone="brand"
          hint={plan.maxItems == null ? 'Sin límite en tu plan' : `de ${plan.maxItems} de tu plan`}
        />
        <StatCard
          label="Activos"
          value={num(data.active_items)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="green"
          hint={`${num(data.draft_items)} en borrador`}
        />
        <StatCard
          label="Archivados"
          value={num(data.archived_items)}
          icon={<Archive className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          label="Importe total"
          value={money(data.amount_total, currency)}
          icon={<Wallet className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label="Este mes"
          value={money(data.amount_this_month, currency)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
          hint={`${num(data.created_this_week)} nuevos esta semana`}
        />
        <StatCard
          label="Equipo"
          value={num(data.members)}
          icon={<Users className="h-5 w-5" />}
          tone="slate"
          hint={plan.maxMembers == null ? 'Usuarios ilimitados' : `de ${plan.maxMembers} de tu plan`}
        />
      </div>

      {data.total_items === 0 ? (
        // Vacío CON salida: quien acaba de crear su negocio no tiene ni una
        // cifra que mirar, y lo único útil aquí es el primer registro.
        <div className="mt-5">
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="Todavía no hay items"
            description="Los items son la entidad de ejemplo de este starter: cámbiala por lo que gestione tu negocio y esta pantalla se llenará sola."
            action={
              <Link to="/items?nuevo=1">
                <Button>
                  <Plus className="h-4 w-4" /> Crear el primero
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatusBreakdown
            total={data.total_items}
            counts={{
              active: data.active_items,
              draft: data.draft_items,
              archived: data.archived_items,
            }}
          />
          <PlanCard used={data.total_items} />
        </div>
      )}
    </div>
  )
}

/** Color de cada estado. Mismo criterio que las etiquetas de la lista de items. */
const STATUS_BAR: Record<ItemStatus, string> = {
  active: 'bg-emerald-500',
  draft: 'bg-amber-400',
  archived: 'bg-slate-300',
}

const STATUS_ORDER: ItemStatus[] = ['active', 'draft', 'archived']

/**
 * Reparto por estado. Una barra apilada dice de un vistazo lo que tres cifras
 * sueltas obligan a comparar a mano: cuánto de la cartera está de verdad activo.
 */
function StatusBreakdown({
  total,
  counts,
}: {
  total: number
  counts: Record<ItemStatus, number>
}) {
  return (
    <Card className="md:col-span-2">
      <CardHeader
        title="Reparto por estado"
        subtitle={`${num(total)} items en total`}
        action={
          <Link to="/items" className="text-sm font-medium text-brand-600 hover:underline">
            Ver todos
          </Link>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          {STATUS_ORDER.map((s) => {
            const pct = total > 0 ? (counts[s] / total) * 100 : 0
            if (pct === 0) return null
            return (
              <span
                key={s}
                className={STATUS_BAR[s]}
                style={{ width: `${pct}%` }}
                title={`${ITEM_STATUS_LABEL[s]}: ${counts[s]}`}
              />
            )
          })}
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_BAR[s]}`} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{ITEM_STATUS_LABEL[s]}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                {num(counts[s])}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/**
 * Cuánto del plan se está usando. Va en el panel y no solo en Configuración
 * porque el tope se descubre normalmente al chocar con él: verlo llegar evita
 * que alguien se quede a medias de registrar algo.
 */
function PlanCard({ used }: { used: number }) {
  const { plan } = useAuth()
  const max = plan.maxItems
  // Se topa al 100% a propósito: la base admite items creados antes de bajar de
  // plan, y una barra al 130% se lee como un error de la app.
  const pct = max == null ? 0 : Math.min(100, Math.round((used / max) * 100))
  const nearLimit = max != null && used >= max * 0.8

  return (
    <Card>
      <CardHeader title="Tu plan" />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-bold text-slate-800">{plan.name}</span>
          <span className="text-sm text-slate-400">{planPriceLabel(plan)}</span>
        </div>

        {max == null ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Sparkles className="h-4 w-4 text-accent-500" /> Items ilimitados
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${nearLimit ? 'bg-amber-500' : 'bg-brand-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-semibold tabular-nums text-slate-800">{num(used)}</span> de{' '}
              <span className="tabular-nums">{num(max)}</span> items
            </p>
          </div>
        )}

        <Link to="/configuracion" className="block">
          <Button variant="secondary" className="w-full">
            {nearLimit ? 'Ampliar plan' : 'Ver mi plan'} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>

        {/* Recordatorio de qué es un borrador: sin él, la gente crea todo en
            'draft' sin saber que no cuenta como activo. */}
        <p className="flex items-start gap-2 text-xs text-slate-400">
          <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Los borradores también ocupan sitio en tu plan.
        </p>
      </CardBody>
    </Card>
  )
}
