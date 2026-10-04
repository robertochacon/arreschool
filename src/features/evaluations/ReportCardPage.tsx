import { Fragment, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileX2, Printer } from 'lucide-react'
import { useReportCard } from '@/hooks/evaluations'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import {
  ACHIEVEMENT_LABEL,
  ACHIEVEMENT_SHORT,
  ATTENDANCE_STATUS_LABEL,
  EDUCATION_LEVEL_LABEL,
  OBSERVATION_CATEGORY_LABEL,
} from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, num } from '@/lib/format'
import { LEVEL_ORDER } from './scope'
import type { AttendanceStatus, ReportCardSnapshot } from '@/types/db'

type Competency = NonNullable<ReportCardSnapshot['competencies']>[number]

const ATTENDANCE_KEYS: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

/**
 * Boletín imprimible.
 *
 * Todo lo que pinta sale de `snapshot`, la FOTO que congeló la base al
 * generarlo — nunca de las tablas vivas. Así un boletín entregado se reimprime
 * igual dentro de tres años aunque se haya renombrado una competencia, cambiado
 * la directora o corregido un indicador. El único dato vivo es el comentario
 * general, que solo se edita mientras es borrador.
 *
 * Diseño pensado para A4 en vertical (`print:`): sin menús, sin sombras, con
 * tablas que no se parten a mitad de una competencia. En el teléfono se lee
 * como una tarjeta normal.
 */
export function ReportCardPage() {
  const { id } = useParams()
  const { data: card, isLoading, isError, error } = useReportCard(id)

  const areas = useMemo(() => {
    const out: { area: string; items: Competency[] }[] = []
    for (const c of card?.snapshot.competencies ?? []) {
      const last = out[out.length - 1]
      if (last && last.area === c.area) last.items.push(c)
      else out.push({ area: c.area, items: [c] })
    }
    return out
  }, [card])

  if (isLoading) return <PageLoader label="Cargando boletín…" />
  if (isError || !card) {
    return (
      <EmptyState
        icon={<FileX2 className="h-6 w-6" />}
        title="No se encontró el boletín"
        description={isError ? errorMessage(error) : 'Puede que se haya eliminado o que no sea de tu colegio.'}
        action={
          <Link to="/evaluaciones">
            <Button variant="outline">Volver a Evaluaciones</Button>
          </Link>
        }
      />
    )
  }

  const s = card.snapshot
  const draft = card.status === 'draft'
  // La columna de nota solo aparece si algún indicador la tiene (primaria y
  // secundaria); en inicial sería una columna vacía que confunde a la familia.
  const hasScores = (s.competencies ?? []).some((c) => c.indicators.some((i) => i.score != null))
  const att = s.attendance
  const studentName = s.student ? `${s.student.first_name} ${s.student.last_name}` : 'Estudiante'
  const leadTeacher = s.teachers?.[0]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/evaluaciones">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {draft && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          Este boletín es un BORRADOR: todavía puede cambiar. Se imprime con una marca de agua hasta que la Dirección
          lo publique.
        </p>
      )}

      <article className="relative mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-card sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {draft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black uppercase tracking-widest text-slate-200/70 sm:text-8xl"
            style={{ transform: 'rotate(-30deg)' }}
          >
            Borrador
          </div>
        )}

        <div className="relative">
          {/* ── Cabecera del colegio ───────────────────────────────── */}
          <header className="flex items-start gap-4 border-b-2 border-slate-800 pb-4">
            {s.school?.logo_url && (
              <img src={s.school.logo_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold leading-tight sm:text-xl">{s.school?.name ?? 'Colegio'}</h1>
              {s.school?.address && <p className="text-xs text-slate-600">{s.school.address}</p>}
              {s.school?.phone && <p className="text-xs text-slate-600">Tel. {s.school.phone}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Boletín</p>
              <p className="text-sm font-bold">{s.term?.name}</p>
              <p className="text-xs text-slate-600">{s.period?.name}</p>
            </div>
          </header>

          {/* ── Estudiante ─────────────────────────────────────────── */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Info label="Estudiante" className="col-span-2">
              {studentName}
            </Info>
            <Info label="Matrícula">{s.student?.code ?? '—'}</Info>
            <Info label="Nacimiento">{fmtDate(s.student?.birth_date)}</Info>
            <Info label="Grado">
              {s.grade?.name ?? '—'}
              {s.section?.name ? ` ${s.section.name}` : ''}
            </Info>
            <Info label="Nivel">{s.grade ? EDUCATION_LEVEL_LABEL[s.grade.education_level] : '—'}</Info>
            <Info label="Docente(s)" className="col-span-2">
              {s.teachers && s.teachers.length > 0 ? s.teachers.join(', ') : '—'}
            </Info>
          </dl>

          {/* ── Competencias ───────────────────────────────────────── */}
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide">Competencias e indicadores de logro</h2>
              <p className="text-[11px] text-slate-500">
                {LEVEL_ORDER.map((l) => `${ACHIEVEMENT_SHORT[l]} = ${ACHIEVEMENT_LABEL[l]}`).join(' · ')}
              </p>
            </div>
            {areas.length === 0 ? (
              <p className="text-sm text-slate-500">No hay competencias evaluadas en este corte.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600 print:bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold">Indicador</th>
                    {LEVEL_ORDER.map((l) => (
                      <th key={l} className="w-9 border border-slate-300 px-1 py-1.5 text-center font-semibold" title={ACHIEVEMENT_LABEL[l]}>
                        {ACHIEVEMENT_SHORT[l]}
                      </th>
                    ))}
                    {hasScores && <th className="w-12 border border-slate-300 px-1 py-1.5 text-center font-semibold">Nota</th>}
                  </tr>
                </thead>
                <tbody>
                  {areas.map((a) => (
                    <Fragment key={a.area}>
                      <tr className="break-inside-avoid">
                        <td
                          colSpan={LEVEL_ORDER.length + 1 + (hasScores ? 1 : 0)}
                          className="border border-slate-300 bg-brand-50 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-800 print:bg-slate-50"
                        >
                          {a.area}
                        </td>
                      </tr>
                      {a.items.map((c) => (
                        <Fragment key={c.name}>
                          <tr className="break-inside-avoid">
                            <td
                              colSpan={LEVEL_ORDER.length + 1 + (hasScores ? 1 : 0)}
                              className="border border-slate-300 px-2 py-1.5 font-semibold"
                            >
                              {c.name}
                            </td>
                          </tr>
                          {c.indicators.map((ind, i) => (
                            <tr key={`${c.name}-${i}`} className="break-inside-avoid align-top">
                              <td className="border border-slate-300 px-2 py-1.5 pl-4 text-slate-700">
                                {ind.description}
                                {ind.comment && <span className="mt-0.5 block text-xs italic text-slate-500">{ind.comment}</span>}
                              </td>
                              {LEVEL_ORDER.map((l) => (
                                <td key={l} className="border border-slate-300 text-center font-bold">
                                  {ind.level === l ? '✓' : ''}
                                </td>
                              ))}
                              {hasScores && (
                                <td className="border border-slate-300 text-center tabular-nums">
                                  {ind.score != null ? num(ind.score) : ''}
                                </td>
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── Asistencia ─────────────────────────────────────────── */}
          {att && (
            <section className="mt-6 break-inside-avoid">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Asistencia del corte</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {ATTENDANCE_KEYS.map((k) => (
                  <div key={k} className="rounded-lg border border-slate-300 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{ATTENDANCE_STATUS_LABEL[k]}</p>
                    <p className="text-lg font-bold tabular-nums">{num(att[k])}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-slate-300 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Días registrados</p>
                  <p className="text-lg font-bold tabular-nums">{num(att.total)}</p>
                </div>
              </div>
            </section>
          )}

          {/* ── Observaciones ──────────────────────────────────────── */}
          {(s.observations?.length ?? 0) > 0 && (
            <section className="mt-6 break-inside-avoid">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Observaciones</h2>
              <ul className="space-y-2 text-sm">
                {s.observations!.map((o, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                    <span className="mr-1 font-semibold">{OBSERVATION_CATEGORY_LABEL[o.category]}:</span>
                    <span className="whitespace-pre-line">{o.body}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {card.general_comment && (
            <section className="mt-6 break-inside-avoid">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Comentario general</h2>
              <p className="whitespace-pre-line text-sm">{card.general_comment}</p>
            </section>
          )}

          {/* ── Firmas ─────────────────────────────────────────────── */}
          <footer className="mt-14 grid grid-cols-1 gap-10 break-inside-avoid text-center text-sm sm:grid-cols-3 print:grid-cols-3">
            <Signature title="Docente" name={leadTeacher} />
            <Signature title="Dirección" name={s.school?.principal_name ?? undefined} />
            <Signature title="Madre, padre o tutor" />
          </footer>

          <p className="mt-8 text-center text-[10px] text-slate-400">
            {card.published_at ? `Publicado el ${fmtDate(card.published_at)}` : 'Borrador'} · Generado con ArreSchool
          </p>
        </div>
      </article>
    </div>
  )
}

function Info({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function Signature({ title, name }: { title: string; name?: string }) {
  return (
    <div>
      <div className="mx-auto w-48 border-t border-slate-500" />
      {name && <p className="mt-1 font-medium">{name}</p>}
      <p className="text-xs text-slate-500">{title}</p>
    </div>
  )
}
