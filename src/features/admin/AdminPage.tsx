import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Ban, Building2, Check, Eye, GraduationCap, LogOut, Play, RefreshCw, Search,
  ShieldCheck, ShieldPlus, SlidersHorizontal, Trash2, UserRound, Users, Wallet,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import { Avatar, EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { APP_NAME, planOrderFrom, planPriceLabel, type PlanInfo } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, money, num } from '@/lib/format'
import {
  useAdminGrantPlatformAdmin, useAdminOverview, useAdminPlanRequests, useAdminPlatformAdmins,
  useAdminResolvePlanRequest, useAdminRevokePlatformAdmin, useAdminSetSubscription,
  useAdminSetTenantSuspended, useAdminTenantPurges, useAdminTenants,
} from '@/hooks/admin'
import type { AdminPlanRequestRow, AdminTenantRow, PlanCode, SubscriptionStatus } from '@/types/db'
import { DeleteTenantModal } from './DeleteTenantModal'
import { PlansCard } from './PlansCard'

/**
 * Panel de plataforma: la vista del super-admin sobre TODAS las cuentas.
 *
 * Vive fuera de `Layout` a propósito. Un super-admin no tiene colegio propio
 * (`auth_tenant_id()` es null, requisito de las políticas cross-tenant), así que
 * la navegación de la app —Estudiantes, Finanzas, Configuración— no le lleva a ninguna
 * parte: esta pantalla trae su propio cascarón.
 */

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Prueba', active: 'Activo', past_due: 'Vencido', canceled: 'Cancelado',
}
const STATUS_TONE: Record<SubscriptionStatus, 'green' | 'amber' | 'red' | 'slate'> = {
  trial: 'amber', active: 'green', past_due: 'red', canceled: 'slate',
}
const SUB_STATUSES: SubscriptionStatus[] = ['trial', 'active', 'past_due', 'canceled']

const TENANTS_PAGE_SIZE = 10
const REQUESTS_PAGE_SIZE = 5

type SectionId = 'resumen' | 'colegios' | 'planes' | 'equipo'
const SECTIONS: { value: SectionId; label: string }[] = [
  { value: 'resumen', label: 'Resumen' }, { value: 'colegios', label: 'Colegios' },
  { value: 'planes', label: 'Planes' }, { value: 'equipo', label: 'Super-admins' },
]

export function AdminPage() {
  const { user, plans, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const overview = useAdminOverview()
  const tenants = useAdminTenants()
  // Solo las pendientes: son las únicas sobre las que hay algo que decidir.
  const requests = useAdminPlanRequests('pending')
  const resolveRequest = useAdminResolvePlanRequest()
  const setSuspended = useAdminSetTenantSuspended()

  const [query, setQuery] = useState('')
  // Se guarda el ID y no la fila: al invalidar ['admin'] tras guardar, el modal
  // debe leer el plan recién escrito; con una copia se quedaba con el anterior.
  const [planForId, setPlanForId] = useState<string | null>(null)
  const [deleteFor, setDeleteFor] = useState<AdminTenantRow | null>(null)

  // La sección va en la URL (?s=colegios): así el botón «atrás» funciona y se
  // puede compartir el enlace directo a una pestaña.
  const [params, setParams] = useSearchParams()
  const section = (params.get('s') ?? 'resumen') as SectionId
  const setSection = (id: SectionId) => {
    setParams(id === 'resumen' ? {} : { s: id })
    // Sin esto la sección nueva hereda el scroll de la anterior y aparece «por
    // la mitad».
    window.scrollTo({ top: 0 })
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = tenants.data ?? []
    if (!q) return list
    return list.filter((t) =>
      [t.name, t.owner_name ?? '', t.owner_email ?? ''].some((v) => v.toLowerCase().includes(q)),
    )
  }, [tenants.data, query])

  const ov = overview.data
  const planFor = planForId ? ((tenants.data ?? []).find((t) => t.id === planForId) ?? null) : null

  const toggleSuspend = async (t: AdminTenantRow) => {
    const next = !t.suspended
    const ask = next
      ? `¿Suspender "${t.name}"? Su equipo podrá entrar, pero no crear ni cambiar nada.`
      : `¿Reactivar "${t.name}"?`
    if (!window.confirm(ask)) return
    try {
      await setSuspended.mutateAsync({ tenant: t.id, suspended: next })
      toast.success(next ? 'Colegio suspendido.' : 'Colegio reactivado.')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el estado.'))
    }
  }

  const resolve = async (r: AdminPlanRequestRow, approve: boolean) => {
    const target = plans[r.requested_plan]?.name ?? r.requested_plan
    const ask = approve
      ? `¿Cambiar "${r.tenant_name}" al plan ${target}?`
      : `¿Rechazar la solicitud de ${target} de "${r.tenant_name}"?`
    if (!window.confirm(ask)) return
    try {
      await resolveRequest.mutateAsync({ id: r.id, approve })
      toast.success(approve ? `Plan cambiado a ${target}.` : 'Solicitud rechazada.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const refetchAll = () => {
    overview.refetch()
    tenants.refetch()
    requests.refetch()
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Mismo gris que el armazón de la app (ver Layout): sobre él las tarjetas
  // blancas se despegan y la pantalla se lee como capas.
  return (
    <div className="min-h-[100dvh] bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <span className="truncate text-lg font-extrabold tracking-tight text-brand-950">{APP_NAME}</span>
          <Badge tone="brand" className="shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" /> Super-admin
          </Badge>
          <span className="ml-auto hidden min-w-0 truncate text-sm text-slate-500 lg:block">{user?.email}</span>
          <Button variant="outline" size="sm" className="ml-auto lg:ml-0" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Cerrar sesión">
            <LogOut className="h-5 w-5 text-red-600" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Segmented value={section} onChange={setSection} options={SECTIONS} label="Secciones del panel" />

        <div className="mt-6">
          {section === 'resumen' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Colegios" value={ov?.tenants ?? '—'} icon={<Building2 className="h-5 w-5" />} tone="brand" />
                <StatCard label="Usuarios" value={ov?.members ?? '—'} icon={<UserRound className="h-5 w-5" />} tone="slate" />
                <StatCard label="Estudiantes" value={ov?.students ?? '—'} icon={<GraduationCap className="h-5 w-5" />} tone="slate" />
                <StatCard label="Estudiantes activos" value={ov?.active_students ?? '—'} icon={<Check className="h-5 w-5" />} tone="green" />
                {/* Suma bruta de pagos válidos: si conviven colegios con monedas
                    distintas es una referencia de volumen, no una caja. */}
                <StatCard label="Cobrado en ArreSchool Pay" value={ov ? money(ov.collected_total) : '—'} icon={<Wallet className="h-5 w-5" />} tone="accent" />
                <StatCard label="Super-admins" value={ov?.platform_admins ?? '—'} icon={<ShieldCheck className="h-5 w-5" />} tone="slate" />
              </div>

              {ov && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {planOrderFrom(plans).map((p) => (
                    <Badge key={p}>{plans[p].name}: {ov.by_plan?.[p] ?? 0}</Badge>
                  ))}
                </div>
              )}

              <PlanRequestsCard requests={requests.data ?? []} plans={plans} busy={resolveRequest.isPending} onResolve={resolve} />
            </>
          )}

          {section === 'colegios' && (
            <>
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9"
                  placeholder="Buscar por colegio, dueño o correo…" />
              </div>
              <TenantsTable
                rows={rows} query={query} plans={plans} loading={tenants.isLoading}
                error={tenants.isError ? tenants.error : null}
                onDetail={(id) => navigate(`/admin/colegio/${id}`)}
                // Los usuarios se gestionan en el detalle y no en un modal aquí:
                // una sola pantalla para roles, bloqueos y bajas.
                onMembers={(id) => navigate(`/admin/colegio/${id}?ir=miembros`)}
                onPlan={setPlanForId} onToggleSuspend={toggleSuspend} onDelete={setDeleteFor}
              />
              <PurgeLogCard />
            </>
          )}

          {section === 'planes' && <PlansCard />}
          {section === 'equipo' && <SuperAdminsCard />}
        </div>
      </main>

      <ChangePlanModal tenant={planFor} onClose={() => setPlanForId(null)} />
      <DeleteTenantModal tenantId={deleteFor?.id ?? null} tenantName={deleteFor?.name}
        currency={deleteFor?.currency} onClose={() => setDeleteFor(null)} />
    </div>
  )
}

// ── Solicitudes de plan ──────────────────────────────────────────────────────

function PlanRequestsCard({
  requests, plans, busy, onResolve,
}: {
  requests: AdminPlanRequestRow[]
  plans: Record<PlanCode, PlanInfo>
  busy: boolean
  onResolve: (r: AdminPlanRequestRow, approve: boolean) => void
}) {
  const [page, setPage] = useState(0)
  const { slice, safePage } = paginate(requests, page, REQUESTS_PAGE_SIZE)

  if (requests.length === 0) {
    return (
      <Card className="mt-6">
        <CardBody>
          <EmptyState icon={<Check className="h-5 w-5" />} title="Sin solicitudes pendientes"
            description="Cuando un colegio pida cambiar de plan, aparecerá aquí." />
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="mt-6 border-accent-300">
      <CardHeader title={`Solicitudes de plan (${requests.length})`} subtitle="Cuentas que pidieron cambiar de plan" />
      <CardBody className="space-y-2">
        {slice.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{r.tenant_name}</p>
              <p className="truncate text-xs text-slate-500">{r.owner_name ?? '—'} · {r.owner_email ?? '—'}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge>{r.current_plan ? plans[r.current_plan].name : '—'}</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <Badge tone="brand">{plans[r.requested_plan].name}</Badge>
                <span className="text-xs text-slate-400">· {fmtDate(r.created_at)}</span>
              </div>
              {r.note && <p className="mt-1.5 text-xs italic text-slate-500">«{r.note}»</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" loading={busy} onClick={() => onResolve(r, false)}>Rechazar</Button>
              <Button size="sm" loading={busy} onClick={() => onResolve(r, true)}>
                <Check className="h-4 w-4" /> Aprobar
              </Button>
            </div>
          </div>
        ))}
      </CardBody>
      <Pagination page={safePage} pageSize={REQUESTS_PAGE_SIZE} total={requests.length} onPage={setPage} label="solicitudes" />
    </Card>
  )
}

// ── Colegios ─────────────────────────────────────────────────────────────────

function TenantsTable({
  rows, loading, error, query, plans, onDetail, onMembers, onPlan, onToggleSuspend, onDelete,
}: {
  rows: AdminTenantRow[]
  loading: boolean
  error: unknown
  query: string
  plans: Record<PlanCode, PlanInfo>
  onDetail: (id: string) => void
  onMembers: (id: string) => void
  onPlan: (id: string) => void
  onToggleSuspend: (t: AdminTenantRow) => void
  onDelete: (t: AdminTenantRow) => void
}) {
  const [page, setPage] = useState(0)
  const { slice, safePage } = paginate(rows, page, TENANTS_PAGE_SIZE)
  // El buscador filtra sobre TODA la lista (ya viene entera del servidor); al
  // cambiar el texto hay que volver a la primera página o se ve un hueco.
  useEffect(() => setPage(0), [query])

  // Una sola lista de acciones para la tabla y para las tarjetas: así una opción
  // nueva no aparece en escritorio y falta en el teléfono.
  const actionsFor = (t: AdminTenantRow): ActionItem[] => [
    { label: 'Ver detalle', icon: <Eye className="h-4 w-4" />, onClick: () => onDetail(t.id) },
    { label: 'Usuarios', icon: <Users className="h-4 w-4" />, hint: 'Roles, bloqueo de acceso y bajas', onClick: () => onMembers(t.id) },
    { label: 'Cambiar plan', icon: <SlidersHorizontal className="h-4 w-4" />, onClick: () => onPlan(t.id) },
    t.suspended
      ? { label: 'Reactivar colegio', icon: <Play className="h-4 w-4" />, tone: 'success', onClick: () => onToggleSuspend(t) }
      : { label: 'Suspender colegio', icon: <Ban className="h-4 w-4" />, tone: 'danger', hint: 'Lo deja en solo lectura', onClick: () => onToggleSuspend(t) },
    { label: 'Eliminar colegio', icon: <Trash2 className="h-4 w-4" />, tone: 'danger', hint: 'Borra todos sus datos, sin vuelta atrás', onClick: () => onDelete(t) },
  ]

  const statusBadge = (t: AdminTenantRow) => (
    <Badge tone={t.sub_status ? STATUS_TONE[t.sub_status] : 'slate'}>
      {t.sub_status ? STATUS_LABEL[t.sub_status] : '—'}
    </Badge>
  )
  const planBadge = (t: AdminTenantRow) => <Badge tone="brand">{t.plan ? plans[t.plan].name : '—'}</Badge>

  return (
    <Card className="mt-4">
      {loading ? (
        <PageLoader label="Cargando colegios…" />
      ) : error ? (
        <p className="p-6 text-center text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los colegios.')}</p>
      ) : rows.length === 0 ? (
        <EmptyState className="m-5" icon={<Building2 className="h-6 w-6" />}
          title={query ? 'Sin resultados' : 'Aún no hay colegios'}
          description={query ? 'Prueba con otro término.' : 'Cuando alguien cree su cuenta, aparecerá aquí.'} />
      ) : (
        <>
          {/* Ocho columnas no caben en un teléfono: por debajo de `lg` la tabla
              cede el sitio a la <DataList> de más abajo. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Colegio</th>
                  <th className="px-4 py-3 font-medium">Dueño</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 text-right font-medium">Estudiantes</th>
                  <th className="px-4 py-3 text-right font-medium">Usuarios</th>
                  <th className="px-4 py-3 text-right font-medium">Cobrado</th>
                  <th className="px-4 py-3 font-medium">Alta</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {slice.map((t) => (
                  <tr key={t.id} className={t.suspended ? 'bg-red-50/40' : 'hover:bg-slate-50/60'}>
                    <td className="px-4 py-3">
                      <button onClick={() => onDetail(t.id)} className="text-left font-medium text-slate-800 hover:text-brand-600">
                        {t.name}
                      </button>
                      {t.suspended && <p className="mt-1"><Badge tone="red">Suspendido</Badge></p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{t.owner_name ?? '—'}</p>
                      {t.owner_email && <p className="text-xs text-slate-400">{t.owner_email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">{planBadge(t)}{statusBadge(t)}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {num(t.active_students)}
                      {t.students > t.active_students && <span className="block text-xs text-slate-400">{num(t.students)} en total</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{num(t.members)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-800">{money(t.collected_total, t.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ActionMenu title={t.name} label={`Opciones de ${t.name}`} items={actionsFor(t)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DataList>
            {slice.map((t) => (
              <DataRow
                key={t.id}
                title={t.name}
                titleExtra={t.whatsapp}
                onClick={() => onDetail(t.id)}
                tone={t.suspended ? 'danger' : undefined}
                badges={<>{planBadge(t)}{statusBadge(t)}{t.suspended && <Badge tone="red">Suspendido</Badge>}</>}
                actions={<ActionMenu title={t.name} label={`Opciones de ${t.name}`} items={actionsFor(t)} />}
              >
                <DataFields>
                  {/* El dueño va etiquetado y a dos columnas: sin la cabecera de
                      la tabla, un nombre suelto bajo el del colegio se confunde
                      con el teléfono de arriba. */}
                  <DataField label="Dueño" wrap className="col-span-2">
                    {t.owner_name ?? '—'}
                    {t.owner_email && <span className="block break-all text-xs font-normal text-slate-400">{t.owner_email}</span>}
                  </DataField>
                  <DataField label="Estudiantes activos">{num(t.active_students)}</DataField>
                  <DataField label="Usuarios">{num(t.members)}</DataField>
                  <DataField label="Cobrado">{money(t.collected_total, t.currency)}</DataField>
                  <DataField label="Alta">{fmtDate(t.created_at)}</DataField>
                </DataFields>
              </DataRow>
            ))}
          </DataList>
        </>
      )}
      <Pagination page={safePage} pageSize={TENANTS_PAGE_SIZE} total={rows.length} onPage={setPage} label="colegios" />
    </Card>
  )
}

/**
 * Bitácora de colegios eliminados.
 *
 * Es lo único que queda de un colegio borrado —sus `audit_logs` se fueron con
 * él—, y guarda lo que ya no se puede reconstruir: quién lo borró, cuándo y
 * cuánto había dentro. Se oculta mientras no haya ninguno.
 */
function PurgeLogCard() {
  const rows = useAdminTenantPurges(10).data ?? []
  if (rows.length === 0) return null

  return (
    <Card className="mt-4">
      <CardHeader title="Colegios eliminados"
        subtitle={`${rows.length === 10 ? 'Últimos 10' : `${rows.length} en total`} · el rastro del borrado, no los datos`} />
      <ul className="divide-y divide-slate-50">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.tenant_name}</p>
              {r.deleted_users && <Badge tone="red">Cuentas borradas</Badge>}
              <span className="whitespace-nowrap text-xs text-slate-400">{fmtDate(r.created_at)}</span>
            </div>
            <p className="mt-0.5 break-all text-xs text-slate-400">
              {r.owner_email ?? 'sin dueño'}
              {r.deleted_by_email ? ` · borrado por ${r.deleted_by_email}` : ''}
              {` · ${num(r.counts?.students ?? 0)} estudiantes · ${num(r.counts?.payments ?? 0)} pagos · ${num(r.counts?.profiles ?? 0)} usuarios`}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Suscripción de un colegio ────────────────────────────────────────────────

function ChangePlanModal({ tenant, onClose }: { tenant: AdminTenantRow | null; onClose: () => void }) {
  const { plans } = useAuth()
  const toast = useToast()
  const setSub = useAdminSetSubscription()
  const [plan, setPlan] = useState<PlanCode>('basic')
  const [status, setStatus] = useState<SubscriptionStatus>('active')

  // Se sincroniza al abrir con OTRO colegio, durante el render y no en un
  // useEffect: así no hay un fotograma con los valores del anterior. Al cerrar
  // se olvida la clave, para que reabrir el MISMO colegio relea su plan actual.
  const [syncedKey, setSyncedKey] = useState('')
  const close = () => {
    setSyncedKey('')
    onClose()
  }
  if (tenant && tenant.id !== syncedKey) {
    setSyncedKey(tenant.id)
    setPlan(tenant.plan ?? 'basic')
    setStatus(tenant.sub_status ?? 'active')
  }

  const save = async () => {
    if (!tenant) return
    try {
      await setSub.mutateAsync({ tenant: tenant.id, plan, status })
      toast.success(`Suscripción de "${tenant.name}" actualizada.`)
      close()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo actualizar el plan.'))
    }
  }

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={close}
      title={tenant ? `Suscripción · ${tenant.name}` : 'Suscripción'}
      footer={
        <>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={save} loading={setSub.isPending}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Plan</label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}>
            {planOrderFrom(plans).map((p) => (
              <option key={p} value={p}>{plans[p].name} — {planPriceLabel(plans[p])}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Estado</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
            {SUB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
        <p className="text-xs text-slate-500">
          El plan manda sobre los topes que aplican los triggers de la base. Bajarlo no borra nada:
          lo que ya existe se conserva, lo que se pierde es poder crear más.
        </p>
      </div>
    </Modal>
  )
}

// ── Super-admins de plataforma ───────────────────────────────────────────────

function SuperAdminsCard() {
  const { user } = useAuth()
  const toast = useToast()
  const admins = useAdminPlatformAdmins()
  const grant = useAdminGrantPlatformAdmin()
  const revoke = useAdminRevokePlatformAdmin()
  const [email, setEmail] = useState('')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await grant.mutateAsync({ email })
      toast.success('Super-admin agregado.')
      setEmail('')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo agregar.'))
    }
  }

  const remove = async (userId: string, label: string) => {
    if (!window.confirm(`¿Quitar a ${label} como super-admin?`)) return
    try {
      await revoke.mutateAsync(userId)
      toast.success('Super-admin removido.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader title="Super-admins de plataforma" subtitle="Cuentas con acceso a este panel (sin colegio propio)" />
      <CardBody className="space-y-4">
        {/* Sin paginar a propósito: son un puñado de cuentas, y una lista de tres
            con paginador debajo se lee como si faltara algo. */}
        {admins.isLoading ? (
          <PageLoader label="Cargando…" />
        ) : (
          <ul className="space-y-2">
            {(admins.data ?? []).map((a) => (
              <li key={a.user_id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <Avatar name={a.email} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{a.email ?? a.user_id}</span>
                {a.user_id === user?.id && <Badge tone="brand">Tú</Badge>}
                <Button variant="ghost" size="icon" className="shrink-0 text-red-600 hover:bg-red-50"
                  aria-label={`Quitar a ${a.email ?? a.user_id}`}
                  onClick={() => remove(a.user_id, a.email ?? a.user_id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com" className="min-w-[220px] flex-1" />
          <Button type="submit" loading={grant.isPending}>
            <ShieldPlus className="h-4 w-4" /> Agregar
          </Button>
        </form>
        {/* La restricción no es capricho de la UI: las políticas cross-tenant
            piden `auth_tenant_id() is null`, así que un super-admin con colegio
            propio no vería nada aquí dentro. */}
        <p className="text-xs text-slate-500">
          Tiene que ser una cuenta que ya exista y que NO pertenezca a ningún colegio. Siempre queda
          al menos un super-admin: la base rechaza quitar al último.
        </p>
      </CardBody>
    </Card>
  )
}
