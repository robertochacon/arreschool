import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  Clock,
  Copy,
  Crown,
  Lock,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { ActionMenu, type ActionItem } from '@/components/ui/ActionMenu'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth/AuthProvider'
import { useUpdateTenant, type TenantUpdate } from '@/hooks/tenant'
import {
  useCreateInvite,
  usePendingInvites,
  useRemoveMember,
  useRevokeInvite,
  useSetMemberRole,
  useTeamMembers,
  type TeamMember,
} from '@/hooks/team'
import { useMyPlanRequest, useRequestPlanChange } from '@/hooks/plan'
import { uploadFile } from '@/lib/storage'
import {
  APP_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PATHS,
  ROLE_HINT,
  ROLE_LABEL,
  appUrl,
  planOrderFrom,
  planPriceLabel,
} from '@/lib/constants'
import { fmtDate } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { num } from '@/lib/format'
import { usePermissions } from '@/lib/permissions'
import type { MemberRole, PlanCode } from '@/types/db'

/**
 * Configuración del colegio: datos, plan y equipo con sus roles.
 *
 * Lo que NO está aquí a propósito: la suspensión de la cuenta (la mueve solo el
 * super-admin, ver `tenants_guard`) y el cambio directo de plan — se SOLICITA,
 * porque el plan decide cuánto cabe y cuánto se cobra.
 */
export function SettingsPage() {
  const { tenant } = useAuth()

  // Sin colegio no hay nada que configurar. Pasa un instante al recargar, antes
  // de que el AuthProvider termine de cargar el contexto.
  if (!tenant) return null

  return (
    <div>
      <PageHeader title="Configuración" description="Los datos de tu colegio, tu plan y tu equipo" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BusinessCard />
        </div>
        <div className="space-y-4">
          <PlanCard />
          <ChangePlanCard />
        </div>
      </div>

      <div className="mt-4">
        <TeamCard />
      </div>

      <LegalLinks />
    </div>
  )
}

/* ── Datos del colegio ────────────────────────────────────────────────────── */

/**
 * Monedas que ofrece el desplegable.
 *
 * Es la misma lista que sabe pintar `money()` en `@/lib/format`: si aquí se
 * añade una que allí no está, el importe saldría con el código por delante
 * ("PYG 1,500") en vez del símbolo.
 */
const CURRENCIES: { code: string; label: string }[] = [
  { code: 'DOP', label: 'DOP · Peso dominicano (RD$)' },
  { code: 'USD', label: 'USD · Dólar (US$)' },
  { code: 'EUR', label: 'EUR · Euro (€)' },
  { code: 'MXN', label: 'MXN · Peso mexicano (MX$)' },
  { code: 'COP', label: 'COP · Peso colombiano (COL$)' },
  { code: 'PEN', label: 'PEN · Sol (S/)' },
  { code: 'ARS', label: 'ARS · Peso argentino (AR$)' },
  { code: 'CLP', label: 'CLP · Peso chileno (CLP$)' },
]

function BusinessCard() {
  const { tenant } = useAuth()
  const { can } = usePermissions()
  // Solo Dirección y Administración editan los datos que salen impresos en
  // recibos y boletines. El resto del equipo los ve, pero sin formulario.
  const canEdit = can('manageAcademics')
  const update = useUpdateTenant()
  const toast = useToast()
  const [form, setForm] = useState<TenantUpdate>({})
  const [uploading, setUploading] = useState(false)

  // El formulario se rehidrata cuando cambia el colegio cargado (por ejemplo
  // tras el `refresh()` que hace la propia mutación).
  useEffect(() => {
    if (!tenant) return
    setForm({
      name: tenant.name,
      email: tenant.email ?? '',
      phone: tenant.phone ?? '',
      whatsapp: tenant.whatsapp ?? '',
      address: tenant.address ?? '',
      currency: tenant.currency,
      legal_id: tenant.legal_id ?? '',
      principal_name: tenant.principal_name ?? '',
      receipt_footer: tenant.receipt_footer ?? '',
    })
  }, [tenant])

  if (!tenant) return null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name?.trim()
    if (!name) {
      toast.error('El colegio necesita un nombre.')
      return
    }
    try {
      // No hace falta refrescar a mano: `useUpdateTenant` ya llama a `refresh()`
      // del AuthProvider, que es de donde la cabecera saca nombre y logo.
      // Los vacíos se guardan como NULL: un RNC "" saldría como hueco en el recibo.
      const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)
      await update.mutateAsync({
        id: tenant.id,
        ...form,
        name,
        legal_id: clean(form.legal_id),
        principal_name: clean(form.principal_name),
        receipt_footer: clean(form.receipt_footer),
      })
      toast.success('Cambios guardados')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron guardar los cambios'))
    }
  }

  const onLogo = async (file: File) => {
    setUploading(true)
    try {
      // Bucket `logos`: es el público, y su política solo deja escribir dentro
      // de la carpeta `<tenant_id>/` (ver @/lib/storage).
      const { publicUrl } = await uploadFile('logos', tenant.id, file, 'logo-')
      await update.mutateAsync({ id: tenant.id, logo_url: publicUrl })
      toast.success('Logo actualizado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo subir el logo'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Datos del colegio" subtitle="Así aparece en recibos, boletines y en tu cuenta" />
      <CardBody>
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={tenant.name} src={tenant.logo_url} size="lg" />
          {/* Un <label> con el input escondido dentro: el selector de archivos
              nativo no se puede estilar, y así el área visible es un botón
              normal de 44px que sí se puede tocar con el pulgar. */}
          {canEdit && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            {uploading ? 'Subiendo…' : 'Cambiar logo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onLogo(f)
                // Se limpia el valor: sin esto, volver a elegir EL MISMO archivo
                // no dispara `change` y parecería que la app se quedó colgada.
                e.target.value = ''
              }}
            />
          </label>
          )}
        </div>

        {/* `fieldset disabled` apaga todos los campos de una vez para quien
            solo puede mirar, sin repetir la condición en cada input. */}
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
          <Field label="Nombre del colegio" required>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                required
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="pl-9"
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Correo de contacto">
              <Input
                type="email"
                inputMode="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                inputMode="tel"
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="WhatsApp" hint="Con código de país. Ej. 18095551234">
              <Input
                inputMode="tel"
                value={form.whatsapp ?? ''}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </Field>
            <Field label="Moneda" hint="Con la que se muestran todos los importes">
              <Select
                value={form.currency ?? 'DOP'}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Dirección">
            <Input
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="RNC / registro" hint="Sale impreso en los recibos">
              <Input
                value={form.legal_id ?? ''}
                onChange={(e) => setForm({ ...form, legal_id: e.target.value })}
              />
            </Field>
            <Field label="Director/a" hint="Firma en los boletines">
              <Input
                value={form.principal_name ?? ''}
                onChange={(e) => setForm({ ...form, principal_name: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Pie del recibo" hint="Cuenta bancaria, política de pagos o un mensaje para las familias">
            <Input
              value={form.receipt_footer ?? ''}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
            />
          </Field>
          </fieldset>

          {canEdit && (
            <div className="flex justify-end">
              <Button type="submit" loading={update.isPending}>
                Guardar cambios
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

function PlanCard() {
  const { plan, subscription } = useAuth()

  return (
    <Card>
      <CardHeader
        title="Tu plan"
        action={
          subscription?.status === 'trial' ? (
            <Badge tone="amber">Prueba</Badge>
          ) : subscription?.status === 'active' ? (
            <Badge tone="green">Activo</Badge>
          ) : (
            <Badge tone="slate">Sin suscripción</Badge>
          )
        }
      />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Crown className="h-5 w-5 text-accent-500" />
          <span className="text-lg font-bold text-slate-800">{plan.name}</span>
          <span className="text-slate-400">· {planPriceLabel(plan)}</span>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          {plan.maxStudents == null ? 'Estudiantes ilimitados' : `Hasta ${num(plan.maxStudents)} estudiantes activos`}
          {' · '}
          {plan.maxMembers == null ? 'usuarios ilimitados' : `${num(plan.maxMembers)} usuario(s)`}
        </p>

        {subscription?.status === 'trial' && subscription.trial_ends_at && (
          <p className="mt-1 text-sm text-slate-500">
            Tu prueba termina el {fmtDate(subscription.trial_ends_at)}.
          </p>
        )}

        <ul className="mt-3 space-y-1.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {f}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/**
 * Solicitud de cambio de plan.
 *
 * Se muestra siempre que exista OTRO plan ofrecido, sin dar por hecho cuál es el
 * "de arriba": marcar un plan nuevo como visible en /admin tiene que bastar para
 * que se pueda pedir desde aquí.
 */
function ChangePlanCard() {
  const { plan, plans, isOwner } = useAuth()
  const myRequest = useMyPlanRequest()
  const requestPlan = useRequestPlanChange()
  const toast = useToast()

  const others = planOrderFrom(plans).filter((c) => c !== plan.code)
  // Solo la dueña: la RPC lo vuelve a comprobar, esto es para no enseñar un
  // botón que va a fallar.
  if (!isOwner || others.length === 0) return null

  const pending = myRequest.data ?? null

  const request = async (code: PlanCode) => {
    try {
      await requestPlan.mutateAsync({ plan: code })
      toast.success(`Solicitud de ${plans[code].name} enviada. Te contactaremos para activarlo.`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo enviar la solicitud'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Cambiar de plan"
        subtitle={pending ? 'Tienes una solicitud en revisión' : 'Solicítalo y te contactamos'}
      />
      <CardBody className="space-y-2">
        {pending ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Solicitud de <strong>{plans[pending.requested_plan].name}</strong> enviada el{' '}
              {fmtDate(pending.created_at)}. Un administrador la revisará pronto.
            </span>
          </div>
        ) : (
          others.map((code) => {
            const p = plans[code]
            return (
              <div
                key={code}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                    {p.isFeatured && <Sparkles className="h-4 w-4 shrink-0 text-accent-500" />}
                    <span className="truncate">{p.name}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {planPriceLabel(p)}
                    {p.features[0] ? ` · ${p.features[0]}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  loading={requestPlan.isPending}
                  onClick={() => void request(code)}
                >
                  Solicitar
                </Button>
              </div>
            )
          })
        )}
      </CardBody>
    </Card>
  )
}

/* ── Equipo ───────────────────────────────────────────────────────────────── */

/**
 * Roles que se pueden repartir. 'owner' no está a propósito: la propiedad del
 * colegio no viaja por invitación ni se regala con un clic (la base lo rechaza
 * en `create_invite` y `set_member_role`, migración 0018).
 */
const ASSIGNABLE_ROLES: MemberRole[] = ['teacher', 'secretary', 'accountant', 'admin']

const ROLE_TONE: Record<MemberRole, 'brand' | 'green' | 'amber' | 'slate'> = {
  owner: 'brand',
  admin: 'brand',
  secretary: 'green',
  teacher: 'amber',
  accountant: 'slate',
}

function TeamCard() {
  const { tenant, plan, isOwner, user } = useAuth()
  const toast = useToast()
  const { data: members } = useTeamMembers()
  const { data: invites } = usePendingInvites()
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()
  const setRole = useSetMemberRole()
  const removeMember = useRemoveMember()
  const [inviteRole, setInviteRole] = useState<MemberRole>('teacher')

  // `null` = ilimitado. Un plan de un solo usuario no puede invitar a nadie, y
  // `create_invite` lo rechaza con PLAN_LIMIT_MEMBERS.
  const multiUser = plan.maxMembers == null || plan.maxMembers > 1
  const canInvite = multiUser && isOwner
  const registerUrl = appUrl('/registro')

  const inviteText = (code: string, role: MemberRole) =>
    `Te invito a unirte a ${tenant?.name ?? 'mi colegio'} en ${APP_NAME} como ${ROLE_LABEL[role]}.\n` +
    `1) Crea tu cuenta aquí: ${registerUrl}\n` +
    `2) Elige "Unirme con código" y escribe: ${code}`

  const invite = async () => {
    try {
      const code = await createInvite.mutateAsync({ role: inviteRole })
      toast.success(`Invitación de ${ROLE_LABEL[inviteRole]} creada (${code}). Compártela con esa persona.`)
    } catch (err) {
      // `errorMessage` limpia el prefijo PLAN_LIMIT_MEMBERS y deja la frase útil.
      toast.error(errorMessage(err, 'No se pudo crear la invitación'))
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Código copiado')
    } catch {
      // El portapapeles falla sin HTTPS y en algunos navegadores embebidos.
      toast.error('No se pudo copiar. Selecciona el código y cópialo a mano.')
    }
  }

  const share = async (code: string, role: MemberRole) => {
    const text = inviteText(code, role)
    // La hoja nativa de compartir es lo que la gente usa en el teléfono (manda
    // por el chat que quiera). En escritorio casi nunca existe: se cae a copiar.
    if (navigator.share) {
      try {
        await navigator.share({ title: APP_NAME, text })
        return
      } catch {
        // Cancelar la hoja también lanza: no es un error que haya que contar.
        return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Invitación copiada. Pégala donde quieras enviarla.')
    } catch {
      toast.error('No se pudo copiar la invitación')
    }
  }

  const revoke = async (id: string) => {
    if (!window.confirm('¿Revocar esta invitación? El código dejará de servir al instante.')) return
    try {
      await revokeInvite.mutateAsync(id)
      toast.success('Invitación revocada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo revocar'))
    }
  }

  const changeRole = async (m: TeamMember, role: MemberRole) => {
    try {
      await setRole.mutateAsync({ userId: m.id, role })
      toast.success(`${m.full_name ?? 'La persona'} ahora es ${ROLE_LABEL[role]}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el rol'))
    }
  }

  const remove = async (m: TeamMember) => {
    if (
      !window.confirm(
        `¿Quitar a ${m.full_name ?? 'esta persona'} del colegio? Perderá el acceso al instante; ` +
          'su cuenta y lo que registró se conservan.',
      )
    )
      return
    try {
      await removeMember.mutateAsync(m.id)
      toast.success('Persona quitada del equipo')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo quitar'))
    }
  }

  /** Acciones sobre un miembro: solo el owner, nunca sobre sí mismo ni otro owner. */
  const actionsFor = (m: TeamMember): ActionItem[] => [
    ...ASSIGNABLE_ROLES.filter((r) => r !== m.role).map((r) => ({
      label: `Cambiar a ${ROLE_LABEL[r]}`,
      hint: ROLE_HINT[r],
      icon: <UserCog className="h-4 w-4" />,
      onClick: () => void changeRole(m, r),
    })),
    {
      label: 'Quitar del colegio',
      icon: <UserMinus className="h-4 w-4" />,
      tone: 'danger' as const,
      onClick: () => void remove(m),
    },
  ]

  return (
    <Card>
      <CardHeader
        title="Equipo"
        subtitle="Quién entra a ArreSchool y qué puede hacer cada rol"
        action={
          !multiUser ? (
            <Badge tone="brand">
              <Crown className="h-3.5 w-3.5" /> Plan superior
            </Badge>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        <ul className="space-y-2">
          {(members ?? []).map((m) => {
            const manageable = isOwner && m.id !== user?.id && m.role !== 'owner'
            return (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar name={m.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {m.full_name ?? 'Sin nombre'}
                    {m.id === user?.id && <span className="font-normal text-slate-400"> (tú)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">{ROLE_HINT[m.role]}</p>
                </div>
                <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                {manageable && (
                  <ActionMenu
                    title={m.full_name ?? 'Miembro del equipo'}
                    label={`Opciones de ${m.full_name ?? 'este miembro'}`}
                    items={actionsFor(m)}
                  />
                )}
              </li>
            )
          })}
        </ul>

        {!multiUser ? (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
            <Lock className="h-5 w-5 shrink-0 text-slate-400" />
            Tu plan es de un solo usuario. Cambia de plan para invitar a docentes y secretaría.
          </div>
        ) : !isOwner ? (
          // El resto del equipo ve quién más está, pero no los códigos: son
          // secretos de tipo "quien lo tenga, entra" y la RLS solo se los
          // devuelve a la Dirección.
          <p className="text-sm text-slate-500">
            Solo la Dirección (dueño de la cuenta) puede invitar, cambiar roles o quitar accesos.
          </p>
        ) : (
          <>
            {canInvite && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Invitar a alguien</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    aria-label="Rol de la persona invitada"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                    className="sm:flex-1"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={() => void invite()} loading={createInvite.isPending}>
                    <UserPlus className="h-4 w-4" /> Crear invitación
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{ROLE_HINT[inviteRole]}</p>
              </div>
            )}

            {invites && invites.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invitaciones pendientes
                </p>
                <ul className="space-y-2">
                  {invites.map((inv) => {
                    const expired = new Date(inv.expires_at).getTime() < Date.now()
                    return (
                      <li key={inv.id} className="rounded-xl border border-slate-200 p-2.5">
                        {/* Envuelve en dos filas a propósito: a 360px, el código y
                            tres botones en línea dejan el código en cuatro letras. */}
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm text-slate-700">
                            {inv.code}
                          </code>
                          <Badge tone={ROLE_TONE[inv.role]}>{ROLE_LABEL[inv.role]}</Badge>
                          {expired && <Badge tone="red">Vencida</Badge>}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                            {expired ? 'Venció' : 'Vence'} el {fmtDate(inv.expires_at)}
                          </span>
                          <IconAction title="Copiar código" onClick={() => void copyCode(inv.code)}>
                            <Copy className="h-4 w-4" />
                          </IconAction>
                          <IconAction
                            title="Compartir invitación"
                            onClick={() => void share(inv.code, inv.role)}
                          >
                            <Share2 className="h-4 w-4" />
                          </IconAction>
                          <IconAction
                            title="Revocar invitación"
                            tone="danger"
                            onClick={() => void revoke(inv.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconAction>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="Sin invitaciones pendientes"
                description="Invita a docentes, secretaría o finanzas: cada rol ve solo lo suyo."
              />
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function IconAction({
  title,
  onClick,
  tone = 'default',
  children,
}: {
  title: string
  onClick: () => void
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={
        tone === 'danger'
          ? 'shrink-0 rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500'
          : 'shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
      }
    >
      {children}
    </button>
  )
}

/**
 * Enlaces legales dentro de la app. Configuración es el único sitio de la zona
 * con sesión donde la gente los busca: en la landing y en el registro están,
 * pero quien ya entró no vuelve a pasar por ahí.
 */
function LegalLinks() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
      <Link to={LEGAL_PATHS.privacy} className="hover:text-brand-500 hover:underline">
        Política de Privacidad
      </Link>
      <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
      <Link to={LEGAL_PATHS.terms} className="hover:text-brand-500 hover:underline">
        Condiciones del Servicio
      </Link>
      <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="hover:text-brand-500 hover:underline">
        Contacto
      </a>
    </div>
  )
}
