import { useState } from 'react'
import { AlertTriangle, Check, Pencil, Tags } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { PLAN_PRICE_UNIT } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { money, usd } from '@/lib/format'
import { useAdminUpdatePlan, usePlanSettings, type PlanSettingRow } from '@/hooks/plans'

/**
 * Administración de planes: lo que se anuncia, lo que se cobra y los topes.
 *
 * `plan_settings` es la ÚNICA fuente de verdad: de esta tabla beben los triggers
 * que limitan items y usuarios, la app y la landing pública (que la lee sin
 * sesión). Editar un plan aquí cambia el producto entero, no solo un texto.
 */
export function PlansCard() {
  const plans = usePlanSettings()
  const [editing, setEditing] = useState<PlanSettingRow | null>(null)
  const rows = plans.data ?? []

  const editButton = (p: PlanSettingRow, size: string) => (
    <button
      title={`Editar ${p.name}`}
      aria-label={`Editar ${p.name}`}
      onClick={() => setEditing(p)}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      <Pencil className={size} />
    </button>
  )
  const limit = (v: number | null) => (v == null ? '∞' : v)

  return (
    <>
      <Card>
        <CardHeader
          title="Planes"
          subtitle="Lo que se anuncia, lo que se cobra y los topes de cada plan"
          action={<Badge tone="brand"><Tags className="h-3.5 w-3.5" /> Fuente de verdad</Badge>}
        />
        {plans.isLoading ? (
          <PageLoader label="Cargando planes…" />
        ) : plans.isError ? (
          <CardBody>
            <p className="text-sm text-red-600">{errorMessage(plans.error, 'No se pudieron cargar los planes.')}</p>
          </CardBody>
        ) : (
          <>
            {/* Siete columnas no caben en un teléfono: por debajo de `lg` manda
                la <DataList>. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 text-right font-medium">Se anuncia</th>
                    <th className="px-4 py-3 text-right font-medium">En US$</th>
                    <th className="px-4 py-3 text-right font-medium">Items</th>
                    <th className="px-4 py-3 text-right font-medium">Usuarios</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((p) => (
                    <tr key={p.plan} className={cn(!p.is_offered && 'bg-slate-50/60')}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.plan} · orden {p.sort_order}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {p.price_monthly > 0 ? `${money(p.price_monthly)} ${PLAN_PRICE_UNIT}` : 'Gratis'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-800">
                        {p.price_usd > 0 ? usd(p.price_usd) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{limit(p.max_items)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{limit(p.max_members)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={p.is_offered ? 'green' : 'slate'}>{p.is_offered ? 'Se ofrece' : 'Oculto'}</Badge>
                          {p.is_featured && <Badge tone="amber">Recomendado</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">{editButton(p, 'h-4 w-4')}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DataList>
              {rows.map((p) => (
                <DataRow
                  key={p.plan}
                  title={p.name}
                  titleExtra={`${p.plan} · orden ${p.sort_order}`}
                  tone={p.is_offered ? undefined : 'muted'}
                  badges={
                    <>
                      <Badge tone={p.is_offered ? 'green' : 'slate'}>{p.is_offered ? 'Se ofrece' : 'Oculto'}</Badge>
                      {p.is_featured && <Badge tone="amber">Recomendado</Badge>}
                    </>
                  }
                  /* Una sola acción no merece hoja de opciones: sería un toque
                     de más para llegar al mismo sitio. */
                  actions={editButton(p, 'h-5 w-5')}
                >
                  <DataFields>
                    <DataField label="Se anuncia">
                      {p.price_monthly > 0 ? `${money(p.price_monthly)} ${PLAN_PRICE_UNIT}` : 'Gratis'}
                    </DataField>
                    <DataField label="En US$">{p.price_usd > 0 ? usd(p.price_usd) : '—'}</DataField>
                    <DataField label="Tope de items">{limit(p.max_items)}</DataField>
                    <DataField label="Tope de usuarios">{limit(p.max_members)}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>
          </>
        )}
        <CardBody className="border-t border-slate-100">
          <p className="text-xs text-slate-500">
            El precio en US$ es el que usa cualquier pasarela internacional; el otro es el que ve
            el cliente en su moneda. Se guardan por separado a propósito: una conversión automática
            se desactualiza sola y nadie se entera.
          </p>
        </CardBody>
      </Card>

      <EditPlanModal plan={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function EditPlanModal({ plan, onClose }: { plan: PlanSettingRow | null; onClose: () => void }) {
  const toast = useToast()
  const update = useAdminUpdatePlan()

  const [name, setName] = useState('')
  const [monthly, setMonthly] = useState('')
  const [usdPrice, setUsdPrice] = useState('')
  const [maxItems, setMaxItems] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [features, setFeatures] = useState('')
  const [order, setOrder] = useState('')
  const [offered, setOffered] = useState(true)
  const [featured, setFeatured] = useState(false)

  // Se sincroniza al abrir con OTRO plan, durante el render y no en un
  // useEffect: así no hay un fotograma con los valores del anterior. Al cerrar
  // se olvida la clave, para que reabrir el MISMO plan relea la fila guardada y
  // no resucite una edición a medias que nunca se envió.
  const [syncedKey, setSyncedKey] = useState('')
  const close = () => {
    setSyncedKey('')
    onClose()
  }
  if (plan && plan.plan !== syncedKey) {
    setSyncedKey(plan.plan)
    setName(plan.name)
    setMonthly(String(plan.price_monthly))
    setUsdPrice(String(plan.price_usd))
    // Vacío = ilimitado, que es como lo guarda la base (NULL, no cero).
    setMaxItems(plan.max_items == null ? '' : String(plan.max_items))
    setMaxMembers(plan.max_members == null ? '' : String(plan.max_members))
    setFeatures((plan.features ?? []).join('\n'))
    setOrder(String(plan.sort_order))
    setOffered(plan.is_offered)
    setFeatured(plan.is_featured)
  }

  const nMonthly = Number(monthly)
  const nUsd = Number(usdPrice)
  // Paridad implícita: cuántas unidades de moneda local se cobran por dólar. Si
  // se aleja de la tasa real, se está cobrando de más o de menos sin verlo.
  const parity = nUsd > 0 && nMonthly > 0 ? nMonthly / nUsd : null

  const save = async () => {
    if (!plan) return
    // Se valida aquí y la RPC lo vuelve a validar: esto es un formulario, no una
    // frontera de seguridad — `admin_update_plan` es un endpoint HTTP.
    const fail = (msg: string) => toast.error(msg)
    const badLimit = (v: number | null) => v !== null && (!Number.isInteger(v) || v < 1)

    const items = maxItems.trim() === '' ? null : Number(maxItems)
    const members = maxMembers.trim() === '' ? null : Number(maxMembers)
    const nOrder = Number(order)

    if (!name.trim()) return fail('El plan necesita un nombre.')
    if (!Number.isFinite(nMonthly) || nMonthly < 0) return fail('Precio mensual inválido.')
    if (!Number.isFinite(nUsd) || nUsd < 0) return fail('Precio en US$ inválido.')
    if (nMonthly > 0 && nUsd <= 0) {
      return fail('Un plan de pago necesita precio en US$: es lo que cobra la pasarela.')
    }
    if (badLimit(items) || badLimit(members)) {
      return fail('Los topes deben ser 1 o más (déjalos vacíos para ilimitado).')
    }
    // La bandera `p_clear_max` de la RPC quita los DOS topes a la vez —
    // «ilimitado» es una propiedad del plan entero, no de cada campo—, así que
    // vaciar solo uno haría desaparecer el otro sin avisar. Se pide de frente.
    if ((items === null) !== (members === null)) {
      return fail('«Ilimitado» aplica al plan completo: deja los dos topes vacíos, o pon un número en ambos.')
    }
    if (!Number.isInteger(nOrder) || nOrder < 0) return fail('El orden debe ser un entero de 0 en adelante.')

    try {
      await update.mutateAsync({
        plan: plan.plan,
        name: name.trim(),
        price_monthly: nMonthly,
        price_usd: nUsd,
        max_items: items,
        max_members: members,
        // Una viñeta por línea; las vacías se descartan para que un salto de
        // más no cuele un punto en blanco en la tabla de precios.
        features: features.split('\n').map((f) => f.trim()).filter(Boolean),
        is_offered: offered,
        is_featured: featured,
        sort_order: nOrder,
      })
      toast.success(`Plan ${name.trim()} actualizado.`)
      close()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Modal
      open={Boolean(plan)}
      onClose={close}
      size="lg"
      title={plan ? `Plan · ${plan.name}` : 'Plan'}
      footer={
        <>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={save} loading={update.isPending}><Check className="h-4 w-4" /> Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Precio que se anuncia" hint={`0 = gratis · ${PLAN_PRICE_UNIT}`}>
            <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
          <Field label="Precio en US$" hint="Lo que cobra una pasarela internacional">
            <Input inputMode="decimal" value={usdPrice} onChange={(e) => setUsdPrice(e.target.value)} />
          </Field>
        </div>

        {parity !== null && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Estás cobrando a razón de <strong>{parity.toFixed(2)}</strong> por dólar. Compáralo con
            la tasa real del día: si se ha movido, cada cobro entra por debajo de lo que anuncias.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tope de items" hint="Vacío = ilimitado">
            <Input inputMode="numeric" placeholder="Ilimitado" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />
          </Field>
          <Field label="Tope de usuarios" hint="Vacío = ilimitado">
            <Input inputMode="numeric" placeholder="Ilimitado" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
          </Field>
        </div>
        <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            «Ilimitado» va por plan, no por campo: la base los quita de dos en dos. O los dos topes
            con número, o los dos vacíos.
          </span>
        </p>

        <Field label="Características" hint="Una por línea. Es lo que lee el cliente en la landing.">
          <Textarea rows={6} value={features} onChange={(e) => setFeatures(e.target.value)} />
        </Field>

        <Field label="Orden" hint="De menor a mayor, así se listan los planes.">
          <Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className="sm:w-32" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={offered} onChange={(e) => setOffered(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300" />
          Se ofrece en la app y en la landing
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)}
            disabled={!offered} className="h-4 w-4 rounded border-slate-300 disabled:opacity-40" />
          Destacarlo como «Recomendado»
          <span className="text-xs text-slate-400">(solo uno a la vez)</span>
        </label>

        {/* Los negocios que ya están en el plan NO se tocan: conservan su
            suscripción y solo notan el tope nuevo la próxima vez que creen algo. */}
        <p className="text-xs text-slate-400">
          El cambio entra en vigor de inmediato para todos: precios, topes y viñetas se leen de esta
          tabla en cada consulta.
        </p>
      </div>
    </Modal>
  )
}
