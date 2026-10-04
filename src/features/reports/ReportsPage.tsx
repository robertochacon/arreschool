import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { BarChart3, Printer, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/lib/permissions'
import { useAttendanceReport, useEnrollmentReport, useIncomeReport } from '@/hooks/reports'
import { useStudentAccounts } from '@/hooks/finance'
import { sectionLabel, useCurrentPeriod, useSections } from '@/hooks/academic'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { StatCard } from '@/components/ui/StatCard'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { PAYMENT_METHOD_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort, money, num } from '@/lib/format'
import { cn } from '@/lib/cn'
import { isoMonthEnd, isoMonthStart, isoToday } from '@/features/finance/financeUi'

/**
 * ArreSchool Reports. Cada pestaña es UNA RPC `security invoker`: la base
 * nunca devuelve más de lo que quien pregunta ya puede leer. Las pestañas de
 * dinero, además, ni se ofrecen a quien no maneja finanzas.
 *
 * Imprimir usa el diálogo del navegador: el marco de la app no sale en papel y
 * las tablas se ven completas (en pantalla, por debajo de `lg`, van en
 * tarjetas para no pedir scroll horizontal).
 */

type Tab = 'asistencia' | 'matricula' | 'ingresos' | 'cobros'

/** Por debajo de este % de asistencia se marca al estudiante para seguimiento. */
const LOW_ATTENDANCE = 85

export function ReportsPage() {
  const { can } = usePermissions()
  const finance = can('handleFinance')
  const tabs = useMemo(
    () =>
      [
        { value: 'asistencia' as Tab, label: 'Asistencia' },
        { value: 'matricula' as Tab, label: 'Matrícula' },
        ...(finance
          ? [
              { value: 'ingresos' as Tab, label: 'Ingresos' },
              { value: 'cobros' as Tab, label: 'Por cobrar' },
            ]
          : []),
      ],
    [finance],
  )
  const [tab, setTab] = useState<Tab>('asistencia')

  const VIEW: Record<Tab, ComponentType> = {
    asistencia: AttendanceReport,
    matricula: EnrollmentReport,
    ingresos: IncomeReportView,
    cobros: ReceivablesReport,
  }
  const View = VIEW[tab]

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Asistencia, matrícula y finanzas del colegio"
        action={
          <Button variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        }
      />
      <div className="mb-5 print:hidden">
        <Segmented label="Tipo de reporte" value={tab} onChange={setTab} options={tabs} />
      </div>
      <View />
    </div>
  )
}

/* ── Piezas comunes ─────────────────────────────────────────────────────── */

function Range({
  from,
  to,
  onFrom,
  onTo,
  children,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  children?: ReactNode
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 print:hidden">
      <Field label="Desde">
        <Input type="date" value={from} max={to} onChange={(e) => onFrom(e.target.value)} />
      </Field>
      <Field label="Hasta">
        <Input type="date" value={to} min={from} onChange={(e) => onTo(e.target.value)} />
      </Field>
      {children}
    </div>
  )
}

/** Barra horizontal hecha con CSS: suficiente para comparar, sin librería de gráficos. */
function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: keyof typeof BAR_TONES }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full', BAR_TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

const BAR_TONES = {
  brand: 'bg-brand-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
} as const

function Failed({ error }: { error: unknown }) {
  return <p className="p-8 text-center text-sm text-red-600">{errorMessage(error, 'No se pudo cargar el reporte.')}</p>
}

/* ── Asistencia ─────────────────────────────────────────────────────────── */

function AttendanceReport() {
  const { current } = useCurrentPeriod()
  const { data: sections } = useSections(current?.id)
  const [from, setFrom] = useState(isoMonthStart())
  const [to, setTo] = useState(isoToday())
  const [sectionId, setSectionId] = useState('')
  const { data, isLoading, isError, error } = useAttendanceReport(from, to, sectionId || null)

  const rows = data ?? []
  const low = rows.filter((r) => r.rate !== null && r.rate < LOW_ATTENDANCE).length
  const totals = rows.reduce(
    (t, r) => ({ present: t.present + r.present + r.late, total: t.total + r.total, absent: t.absent + r.absent }),
    { present: 0, total: 0, absent: 0 },
  )
  const rate = totals.total ? Math.round((1000 * totals.present) / totals.total) / 10 : null

  return (
    <div>
      <Range from={from} to={to} onFrom={setFrom} onTo={setTo}>
        <Field label="Sección" className="col-span-2 sm:col-span-1">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Todas</option>
            {(sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      </Range>

      <p className="mb-3 hidden text-sm text-slate-600 print:block">
        Asistencia del {fmtDateShort(from)} al {fmtDateShort(to)}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Asistencia" value={rate === null ? '—' : `${rate}%`} icon={<BarChart3 className="h-5 w-5" />} hint="Presentes + tardanzas" />
        <StatCard label="Ausencias" value={num(totals.absent)} icon={<BarChart3 className="h-5 w-5" />} tone="amber" />
        <StatCard
          label="Para seguimiento"
          value={num(low)}
          icon={<TriangleAlert className="h-5 w-5" />}
          tone="red"
          hint={`Menos de ${LOW_ATTENDANCE}% de asistencia`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <Card>
        {isLoading ? (
          <PageLoader label="Calculando asistencia…" />
        ) : isError ? (
          <Failed error={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Sin asistencia registrada"
            description="No hay listas pasadas en ese rango de fechas."
            className="m-4"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block print:block">
              <table className="w-full min-w-[720px] text-sm print:min-w-0">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium">Sección</th>
                    <th className="px-4 py-3 text-right font-medium">Presente</th>
                    <th className="px-4 py-3 text-right font-medium">Ausente</th>
                    <th className="px-4 py-3 text-right font-medium">Tardanza</th>
                    <th className="px-4 py-3 text-right font-medium">Excusa</th>
                    <th className="px-4 py-3 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => {
                    const isLow = r.rate !== null && r.rate < LOW_ATTENDANCE
                    return (
                      <tr key={r.enrollment_id} className={isLow ? 'bg-red-50/40' : undefined}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.section_name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.present}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.absent}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.late}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.excused}</td>
                        <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', isLow && 'text-red-600')}>
                          {r.rate === null ? '—' : `${r.rate}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <DataList className="print:hidden">
              {rows.map((r) => {
                const isLow = r.rate !== null && r.rate < LOW_ATTENDANCE
                return (
                  <DataRow
                    key={r.enrollment_id}
                    title={`${r.first_name} ${r.last_name}`}
                    titleExtra={r.section_name}
                    tone={isLow ? 'danger' : undefined}
                    badges={
                      <Badge tone={isLow ? 'red' : 'green'}>{r.rate === null ? '—' : `${r.rate}% asistencia`}</Badge>
                    }
                  >
                    <DataFields cols={3}>
                      <DataField label="Ausente">{r.absent}</DataField>
                      <DataField label="Tardanza">{r.late}</DataField>
                      <DataField label="Excusa">{r.excused}</DataField>
                    </DataFields>
                  </DataRow>
                )
              })}
            </DataList>
          </>
        )}
      </Card>
    </div>
  )
}

/* ── Matrícula ──────────────────────────────────────────────────────────── */

function EnrollmentReport() {
  const { periods, current } = useCurrentPeriod()
  const [periodId, setPeriodId] = useState<string>('')
  const effective = periodId || current?.id
  const { data, isLoading, isError, error } = useEnrollmentReport(effective)
  const rows = data ?? []

  const enrolled = rows.reduce((s, r) => s + r.enrolled, 0)
  const capacity = rows.reduce((s, r) => s + (r.capacity ?? 0), 0)
  const unassigned = rows.filter((r) => r.section_id === null).reduce((s, r) => s + r.enrolled, 0)
  const female = rows.reduce((s, r) => s + r.female, 0)
  const male = rows.reduce((s, r) => s + r.male, 0)

  return (
    <div>
      <div className="mb-4 max-w-xs print:hidden">
        <Field label="Año escolar">
          <Select value={effective ?? ''} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Inscritos" value={num(enrolled)} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard
          label="Ocupación"
          value={capacity ? `${Math.round((100 * enrolled) / capacity)}%` : '—'}
          hint={capacity ? `${num(capacity)} lugares` : 'Sin capacidad definida'}
          icon={<BarChart3 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard label="Sin sección" value={num(unassigned)} icon={<TriangleAlert className="h-5 w-5" />} tone="amber" />
        <StatCard label="Niñas / niños" value={`${num(female)} / ${num(male)}`} icon={<BarChart3 className="h-5 w-5" />} tone="slate" />
      </div>

      <Card>
        {!effective ? (
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Todavía no hay años escolares" className="m-4" />
        ) : isLoading ? (
          <PageLoader label="Contando inscritos…" />
        ) : isError ? (
          <Failed error={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nadie inscrito en ese año" className="m-4" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const full = r.capacity !== null && r.enrolled >= r.capacity
              return (
                <li key={`${r.grade_level_id}-${r.section_id ?? 'none'}`} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-800">
                      {r.grade_name} {r.section_name ?? <span className="text-amber-600">· sin sección</span>}
                    </p>
                    <p className="text-sm tabular-nums text-slate-600">
                      {num(r.enrolled)}
                      {r.capacity !== null && ` / ${num(r.capacity)}`}
                      {r.withdrawn > 0 && <span className="ml-2 text-xs text-slate-400">{r.withdrawn} retirados</span>}
                    </p>
                  </div>
                  <Bar value={r.enrolled} max={r.capacity ?? Math.max(r.enrolled, 1)} tone={full ? 'red' : 'brand'} />
                  <p className="text-xs text-slate-500">
                    {num(r.female)} niñas · {num(r.male)} niños
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ── Ingresos ───────────────────────────────────────────────────────────── */

function IncomeReportView() {
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const [from, setFrom] = useState(isoMonthStart())
  const [to, setTo] = useState(isoMonthEnd())
  const { data, isLoading, isError, error } = useIncomeReport(from, to)

  if (isLoading) return <PageLoader label="Sumando ingresos…" />
  if (isError || !data) return <Card><Failed error={error} /></Card>

  const maxMethod = Math.max(0, ...data.by_method.map((m) => m.total))
  const maxConcept = Math.max(0, ...data.by_concept.map((c) => c.total))
  const maxDay = Math.max(0, ...data.by_day.map((d) => d.total))

  return (
    <div>
      <Range from={from} to={to} onFrom={setFrom} onTo={setTo} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Cobrado" value={money(data.total, currency)} icon={<BarChart3 className="h-5 w-5" />} tone="green" />
        <StatCard label="Pagos" value={num(data.count)} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard
          label="Sin aplicar"
          value={money(data.unallocated, currency)}
          hint="Quedó como saldo a favor"
          icon={<BarChart3 className="h-5 w-5" />}
          tone="slate"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Por forma de pago" />
          <BarList
            rows={data.by_method.map((m) => ({
              key: m.method,
              label: `${PAYMENT_METHOD_LABEL[m.method]} · ${num(m.count)}`,
              value: m.total,
            }))}
            max={maxMethod}
            currency={currency}
          />
        </Card>
        <Card>
          <CardHeader title="Por concepto" subtitle="Lo aplicado a cada tipo de cargo" />
          <BarList
            rows={data.by_concept.map((c) => ({ key: c.concept, label: c.concept, value: c.total }))}
            max={maxConcept}
            currency={currency}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Por día" />
          <BarList
            rows={data.by_day.map((d) => ({ key: d.date, label: fmtDateShort(d.date), value: d.total }))}
            max={maxDay}
            currency={currency}
            tone="green"
          />
        </Card>
      </div>
    </div>
  )
}

function BarList({
  rows,
  max,
  currency,
  tone,
}: {
  rows: { key: string; label: string; value: number }[]
  max: number
  currency?: string
  tone?: keyof typeof BAR_TONES
}) {
  if (rows.length === 0) return <p className="p-5 text-sm text-slate-500">Sin datos en este rango.</p>
  return (
    <ul className="space-y-3 p-5">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-600">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-800">{money(r.value, currency)}</span>
          </div>
          <Bar value={r.value} max={max} tone={tone} />
        </li>
      ))}
    </ul>
  )
}

/* ── Por cobrar ─────────────────────────────────────────────────────────── */

function ReceivablesReport() {
  const { tenant } = useAuth()
  const currency = tenant?.currency
  const { data, isLoading, isError, error } = useStudentAccounts()

  if (isLoading) return <PageLoader label="Calculando saldos…" />
  if (isError) return <Card><Failed error={error} /></Card>

  const debtors = (data ?? []).filter((a) => a.balance > 0).sort((a, b) => b.overdue - a.overdue || b.balance - a.balance)
  const total = debtors.reduce((s, a) => s + a.balance, 0)
  const overdue = debtors.reduce((s, a) => s + a.overdue, 0)

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Por cobrar" value={money(total, currency)} icon={<BarChart3 className="h-5 w-5" />} tone="amber" />
        <StatCard label="Vencido" value={money(overdue, currency)} icon={<TriangleAlert className="h-5 w-5" />} tone="red" />
        <StatCard label="Estudiantes con deuda" value={num(debtors.length)} icon={<BarChart3 className="h-5 w-5" />} tone="slate" className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        {debtors.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nadie debe nada" description="Todas las cuentas están al día." className="m-4" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {debtors.map((a) => (
              <li key={a.student_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {a.first_name} {a.last_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {a.code} · {num(a.open_charges)} cargos · próximo {fmtDateShort(a.next_due_date)}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="font-semibold text-slate-800">{money(a.balance, currency)}</p>
                  {a.overdue > 0 && <p className="text-xs text-red-600">vencido {money(a.overdue, currency)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
