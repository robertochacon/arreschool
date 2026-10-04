import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, GraduationCap, Play, ShieldCheck, Trash2, UserCog, UserRound, Users, Wallet,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_LABEL } from '@/lib/constants'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Avatar, EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { APP_NAME } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, money, num } from '@/lib/format'
import {
  useAdminMembers, useAdminRemoveMember, useAdminSetMemberRole, useAdminSetUserBanned,
  useAdminTenantSummary, useAdminTenants,
} from '@/hooks/admin'
import type { AdminMember, SubscriptionStatus } from '@/types/db'
import { DeleteTenantModal } from './DeleteTenantModal'

/**
 * Ficha de un colegio vista por el super-admin: qué tiene dentro, quién entra y
 * el único botón que lo borra.
 *
 * El nombre y el plan salen de `useAdminTenants()` —la lista que el panel ya
 * tiene en cache— y no de una consulta a `tenants`: ningún componente habla con
 * `supabase` directamente, y la RPC `admin_list_tenants` es la que trae el
 * correo del dueño (que vive en `auth.users`, fuera del alcance de la RLS).
 */

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Prueba', active: 'Activo', past_due: 'Vencido', canceled: 'Cancelado',
}
const STATUS_TONE: Record<SubscriptionStatus, 'green' | 'amber' | 'red' | 'slate'> = {
  trial: 'amber', active: 'green', past_due: 'red', canceled: 'slate',
}

export function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, plans } = useAuth()
  const [params] = useSearchParams()
  const summary = useAdminTenantSummary(id)
  const tenants = useAdminTenants()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const membersRef = useRef<HTMLDivElement>(null)

  const t = (tenants.data ?? []).find((row) => row.id === id) ?? null
  const s = summary.data
  const currency = t?.currency ?? 'DOP'

  // El panel enlaza aquí con `?ir=miembros` desde la acción «Usuarios» de la
  // lista. Sin este salto la pantalla abre por el resumen y hay que buscar la
  // tarjeta a mano, que es justo lo que esa acción prometía evitar.
  useEffect(() => {
    if (params.get('ir') !== 'miembros') return
    membersRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [params])

  return (
    <div className="min-h-[100dvh] bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <span className="truncate text-lg font-extrabold tracking-tight text-brand-950">{APP_NAME}</span>
          <Badge tone="brand" className="shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" /> Super-admin
          </Badge>
          <span className="ml-auto hidden min-w-0 truncate text-sm text-slate-500 sm:block">{user?.email}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <button
          onClick={() => navigate('/admin')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al panel
        </button>

        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold text-slate-900">{t?.name ?? 'Colegio'}</h1>
          {t?.plan && <Badge tone="brand">{plans[t.plan].name}</Badge>}
          {t?.sub_status && <Badge tone={STATUS_TONE[t.sub_status]}>{STATUS_LABEL[t.sub_status]}</Badge>}
          {t?.suspended && <Badge tone="red">Suspendido</Badge>}
        </div>
        <p className="mb-6 break-all text-sm text-slate-500">
          {t ? `${t.owner_name ?? 'Sin dueño'} · ${t.owner_email ?? 'sin correo'} · alta ${fmtDate(t.created_at)}` : ''}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Estudiantes activos" value={s ? num(s.students_active) : '—'} icon={<GraduationCap className="h-5 w-5" />} tone="brand"
            hint={s ? `${num(s.students_total)} en total · ${num(s.created_this_week)} nuevos esta semana` : undefined}
          />
          <StatCard
            label="Inscritos este año" value={s ? num(s.enrolled) : '—'} icon={<Users className="h-5 w-5" />} tone="green"
            hint={s ? `${num(s.sections)} secciones · ${num(s.teachers)} docentes · ${num(s.guardians)} familiares` : undefined}
          />
          <StatCard
            label="Cobrado" value={s ? money(s.collected_total, currency) : '—'} icon={<Wallet className="h-5 w-5" />} tone="accent"
            hint={s ? `${money(s.collected_this_month, currency)} este mes` : undefined}
          />
          <StatCard
            label="Usuarios" value={s ? num(s.members) : '—'} icon={<UserRound className="h-5 w-5" />} tone="slate"
            hint={s ? `${num(s.pending_invites)} invitaciones sin usar` : undefined}
          />
        </div>

        <div ref={membersRef} className="scroll-mt-20">
          <MembersCard tenantId={id} tenantName={t?.name ?? 'este colegio'} />
        </div>

        {/* ── Zona de peligro ───────────────────────────────────────────────
            Va al final y con marco propio: es la única acción de esta pantalla
            que no tiene vuelta atrás. */}
        <Card className="mt-4 border-red-200">
          <CardHeader title="Zona de peligro" subtitle="Acciones irreversibles" />
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Eliminar este colegio</p>
              <p className="text-xs text-slate-500">
                Borra en cascada sus estudiantes, familias, inscripciones, asistencia, evaluaciones,
                pagos, bitácora, invitaciones, solicitudes de plan y archivos. Si solo quieres cortarle el acceso, suspéndelo desde el panel.
              </p>
            </div>
            <Button variant="danger" className="shrink-0" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Eliminar…
            </Button>
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">Vista de soporte y auditoría.</p>
      </main>

      <DeleteTenantModal
        tenantId={confirmDelete && id ? id : null}
        tenantName={t?.name}
        currency={t?.currency}
        onClose={() => setConfirmDelete(false)}
        // El colegio ya no existe: quedarse aquí dejaría una pantalla de huecos.
        onDeleted={() => navigate('/admin')}
      />
    </div>
  )
}

/**
 * Usuarios del colegio: rol, bloqueo de acceso y baja.
 *
 * Sin tabla ni siquiera en escritorio. Son cuatro datos por persona y caben en
 * una fila a 360px, así que una tabla solo añadiría scroll lateral en el
 * teléfono para no ganar nada arriba.
 */
function MembersCard({ tenantId, tenantName }: { tenantId?: string; tenantName: string }) {
  const toast = useToast()
  const members = useAdminMembers(tenantId)
  const setRole = useAdminSetMemberRole()
  const setBanned = useAdminSetUserBanned()
  const removeMember = useAdminRemoveMember()
  const rows = members.data ?? []

  // Todas las mutaciones fallan igual (la RPC lanza «No autorizado», «Debe
  // quedar un dueño»…), así que el aviso se escribe una vez y no cinco.
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p
      toast.success(ok)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const actionsFor = (m: AdminMember): ActionItem[] => {
    // A un `const` local: las acciones se ejecutan dentro de cierres y así el
    // id llega ya comprobado, sin volver a ser `string | undefined` allí dentro.
    const tenant = tenantId
    if (!tenant) return []
    const nextRole = m.role === 'owner' ? 'admin' : 'owner'
    return [
      {
        label: `Cambiar a: ${ROLE_LABEL[nextRole]}`,
        icon: <UserCog className="h-4 w-4" />,
        onClick: () =>
          void run(
            setRole.mutateAsync({ tenant, user: m.id, role: nextRole }),
            'Rol actualizado.',
          ),
      },
      m.banned
        ? {
            label: 'Reactivar acceso',
            icon: <Play className="h-4 w-4" />,
            tone: 'success',
            onClick: () => void run(setBanned.mutateAsync({ user: m.id, banned: false }), 'Acceso reactivado.'),
          }
        : {
            label: 'Bloquear acceso',
            icon: <Ban className="h-4 w-4" />,
            tone: 'danger',
            hint: 'No podrá iniciar sesión en ninguna parte',
            onClick: () => void run(setBanned.mutateAsync({ user: m.id, banned: true }), 'Acceso bloqueado.'),
          },
      {
        label: 'Quitar del colegio',
        icon: <Trash2 className="h-4 w-4" />,
        tone: 'danger',
        hint: 'Conserva su cuenta: podrá crear otro colegio o unirse a uno',
        onClick: () => {
          if (!window.confirm(`¿Quitar a ${m.full_name ?? m.email} de ${tenantName}?`)) return
          void run(removeMember.mutateAsync({ tenant, user: m.id }), 'Usuario quitado del colegio.')
        },
      },
    ]
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Usuarios" subtitle={`${rows.length} con acceso a este colegio`} />
      {members.isLoading ? (
        <PageLoader label="Cargando usuarios…" />
      ) : members.isError ? (
        <p className="p-6 text-center text-sm text-red-600">{errorMessage(members.error, 'No se pudieron cargar los usuarios.')}</p>
      ) : rows.length === 0 ? (
        <EmptyState className="m-5" icon={<Users className="h-5 w-5" />} title="Sin usuarios"
          description="Este colegio no tiene ninguna cuenta asociada." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.full_name ?? m.email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{m.full_name ?? 'Sin nombre'}</p>
                <p className="truncate text-xs text-slate-400">{m.email ?? '—'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={m.role === 'owner' ? 'brand' : 'slate'}>{ROLE_LABEL[m.role]}</Badge>
                  {m.banned && <Badge tone="red">Acceso bloqueado</Badge>}
                </div>
              </div>
              <ActionMenu title={m.full_name ?? m.email ?? 'Usuario'} label="Opciones del usuario" items={actionsFor(m)} />
            </li>
          ))}
        </ul>
      )}
      <CardBody className="border-t border-slate-100 py-3">
        <p className="text-xs text-slate-500">
          «Bloquear acceso» apaga el login de esa persona en toda la plataforma; «quitar» solo la
          desvincula de este colegio. La base no deja al colegio sin dueño ni a la plataforma sin
          super-admins: esos casos los rechaza la RPC, no este formulario.
        </p>
      </CardBody>
    </Card>
  )
}
