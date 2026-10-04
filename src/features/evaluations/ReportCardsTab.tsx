import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, MessageSquareText, RefreshCw, Send, Undo2, Users } from 'lucide-react'
import { useSectionRoster } from '@/hooks/enrollments'
import {
  useGenerateReportCards,
  usePublishReportCards,
  useReportCards,
  useUpdateReportCardComment,
} from '@/hooks/evaluations'
import { usePermissions } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Textarea } from '@/components/ui/Input'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataList, DataRow } from '@/components/ui/DataList'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort } from '@/lib/format'
import { rosterName, type EvaluationScope } from './scope'
import type { ReportCard, ReportCardStatus } from '@/types/db'

const STATUS: Record<ReportCardStatus, { label: string; tone: 'amber' | 'green' }> = {
  draft: { label: 'Borrador', tone: 'amber' },
  published: { label: 'Publicado', tone: 'green' },
}

interface Row {
  key: string
  name: string
  card: ReportCard | null
}

/**
 * Boletines de una sección en un corte.
 *
 * Generar copia en cada boletín una FOTO de lo evaluado (la arma la base): por
 * eso tras corregir una evaluación hay que volver a generar, y por eso los ya
 * publicados no se tocan — lo que se entregó a la familia no cambia solo.
 */
export function ReportCardsTab({ scope }: { scope: EvaluationScope }) {
  const section = scope.section!
  const term = scope.term!
  const { can } = usePermissions()
  const toast = useToast()
  const navigate = useNavigate()
  const roster = useSectionRoster(section.id)
  const cards = useReportCards(section.id, term.id)
  const generate = useGenerateReportCards()
  const publish = usePublishReportCards()
  const [editing, setEditing] = useState<ReportCard | null>(null)

  const canPublish = can('manageAcademics')
  // Generar lo puede quien escribe en la sección (la RPC lo comprueba); sobre
  // un año cerrado no tiene sentido rehacer fotos.
  const canGenerate = scope.period?.status !== 'closed'

  // Una fila por estudiante de la lista de clase, más los boletines de quien ya
  // no está en ella (retirado tras generarlo): el boletín existe y debe verse.
  const rows = useMemo<Row[]>(() => {
    const byEnrollment = new Map((cards.data ?? []).map((c) => [c.enrollment_id, c]))
    const out: Row[] = (roster.data ?? []).map((e) => ({
      key: e.id,
      name: rosterName(e.student),
      card: byEnrollment.get(e.id) ?? null,
    }))
    const inRoster = new Set(out.map((r) => r.key))
    for (const c of cards.data ?? []) {
      if (inRoster.has(c.enrollment_id)) continue
      out.push({ key: c.enrollment_id, name: rosterName(c.snapshot.student), card: c })
    }
    return out
  }, [roster.data, cards.data])

  const drafts = rows.filter((r) => r.card?.status === 'draft').length
  const published = rows.filter((r) => r.card?.status === 'published').length

  const runGenerate = async () => {
    try {
      const r = await generate.mutateAsync({ section_id: section.id, term_id: term.id })
      const extra = r.skipped ? ` · ${r.skipped} publicado(s) sin tocar` : ''
      toast.success(`${r.generated} borrador(es) generado(s)${extra}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron generar los boletines'))
    }
  }

  const runPublish = async (value: boolean) => {
    const msg = value
      ? `¿Publicar ${drafts} boletín(es)? Una vez publicados ya no cambian aunque se corrija una evaluación.`
      : `¿Devolver ${published} boletín(es) a borrador para corregirlos?`
    if (!window.confirm(msg)) return
    try {
      const n = await publish.mutateAsync({ section_id: section.id, term_id: term.id, publish: value })
      toast.success(value ? `${n} boletín(es) publicado(s)` : `${n} boletín(es) devuelto(s) a borrador`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  if (roster.isLoading || cards.isLoading) return <PageLoader label="Cargando boletines…" />
  const error = roster.error ?? cards.error
  if (error) {
    return (
      <Card className="p-8 text-center text-sm text-red-600">
        {errorMessage(error, 'No se pudieron cargar los boletines.')}
      </Card>
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Esta sección no tiene estudiantes"
        description="Asigna estudiantes a la sección desde Inscripciones."
      />
    )
  }

  const open = (c: ReportCard) => navigate(`/evaluaciones/boletin/${c.id}`)

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {canGenerate && (
          <Button onClick={() => void runGenerate()} loading={generate.isPending}>
            <RefreshCw className="h-4 w-4" /> {drafts + published > 0 ? 'Actualizar borradores' : 'Generar boletines'}
          </Button>
        )}
        {canPublish && drafts > 0 && (
          <Button variant="secondary" onClick={() => void runPublish(true)} loading={publish.isPending}>
            <Send className="h-4 w-4" /> Publicar ({drafts})
          </Button>
        )}
        {canPublish && published > 0 && scope.period?.status !== 'closed' && (
          <Button variant="outline" onClick={() => void runPublish(false)} loading={publish.isPending}>
            <Undo2 className="h-4 w-4" /> Devolver a borrador
          </Button>
        )}
      </div>

      <Card>
        {/* ── Tabla (desde lg) ───────────────────────────────────────── */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Estudiante</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Comentario general</th>
                <th className="px-4 py-3 font-medium">Publicado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge card={r.card} />
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500">{r.card?.general_comment || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDateShort(r.card?.published_at)}</td>
                  <td className="px-4 py-3">
                    {r.card && (
                      <div className="flex justify-end gap-1">
                        {r.card.status === 'draft' && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(r.card)}>
                            <MessageSquareText className="h-4 w-4" /> Comentario
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => open(r.card!)}>
                          <FileText className="h-4 w-4" /> Ver
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Tarjetas (teléfono y tableta) ──────────────────────────── */}
        <DataList>
          {rows.map((r) => (
            <DataRow
              key={r.key}
              title={r.name}
              subtitle={r.card?.general_comment || undefined}
              onClick={r.card ? () => open(r.card!) : undefined}
              badges={<StatusBadge card={r.card} />}
              actions={
                r.card ? (
                  <ActionMenu
                    title={r.name}
                    label={`Opciones del boletín de ${r.name}`}
                    items={[
                      { label: 'Ver e imprimir', icon: <FileText className="h-4 w-4" />, onClick: () => open(r.card!) },
                      {
                        label: 'Comentario general',
                        icon: <MessageSquareText className="h-4 w-4" />,
                        onClick: () => setEditing(r.card),
                        disabled: r.card.status !== 'draft',
                        hint: r.card.status !== 'draft' ? 'Solo en borrador' : undefined,
                      },
                    ]}
                  />
                ) : undefined
              }
            />
          ))}
        </DataList>
      </Card>

      <CommentModal card={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function StatusBadge({ card }: { card: ReportCard | null }) {
  if (!card) return <Badge tone="slate">Sin generar</Badge>
  const s = STATUS[card.status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

/** Comentario general del boletín: lo único editable a mano, y solo en borrador. */
function CommentModal({ card, onClose }: { card: ReportCard | null; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateReportCardComment()
  const [text, setText] = useState('')

  useEffect(() => {
    if (card) setText(card.general_comment ?? '')
  }, [card])

  const submit = async () => {
    if (!card) return
    try {
      await update.mutateAsync({ id: card.id, general_comment: text.trim() || null })
      toast.success('Comentario guardado')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el comentario'))
    }
  }

  return (
    <Modal
      open={Boolean(card)}
      onClose={onClose}
      title={`Comentario · ${rosterName(card?.snapshot.student)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={update.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Comentario general" hint="Sale al final del boletín, antes de las firmas.">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cómo le fue en el corte, fortalezas y en qué acompañarlo en casa…"
        />
      </Field>
    </Modal>
  )
}
