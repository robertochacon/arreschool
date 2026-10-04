import { useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDeleteObservation, useObservations, useSaveObservation } from '@/hooks/evaluations'
import { usePermissions } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { OBSERVATION_CATEGORY_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import type { ObservationCategory, StudentObservation } from '@/types/db'

const CATEGORIES = Object.keys(OBSERVATION_CATEGORY_LABEL) as ObservationCategory[]

interface Draft {
  id?: string
  category: ObservationCategory
  body: string
  visible_to_family: boolean
}

const BLANK: Draft = { category: 'general', body: '', visible_to_family: false }

/**
 * Anecdotario de un estudiante en el año: lo que la docente va notando. Las
 * marcadas "visible para la familia" entran en el boletín del corte; las demás
 * se quedan como notas internas del colegio.
 */
export function ObservationsPanel({
  enrollmentId,
  termId,
  readOnly,
}: {
  enrollmentId: string
  /** Corte al que se asocian las nuevas (el boletín de ese corte las incluye). */
  termId: string | null
  readOnly: boolean
}) {
  const { user } = useAuth()
  const { can } = usePermissions()
  const toast = useToast()
  const { data, isLoading } = useObservations(enrollmentId)
  const save = useSaveObservation()
  const remove = useDeleteObservation()
  const [draft, setDraft] = useState<Draft | null>(null)

  // Mismo criterio que la política de la base: cada quien edita lo suyo y la
  // Dirección puede con todo. Así no aparece un lápiz que acabaría en 42501.
  const canEdit = (o: StudentObservation) =>
    !readOnly && (o.author_id === user?.id || can('manageAcademics'))

  const submit = async () => {
    if (!draft || draft.body.trim().length < 3) {
      toast.error('Escribe la observación')
      return
    }
    try {
      await save.mutateAsync({
        id: draft.id,
        enrollment_id: enrollmentId,
        grading_term_id: termId,
        category: draft.category,
        body: draft.body.trim(),
        visible_to_family: draft.visible_to_family,
      })
      toast.success(draft.id ? 'Observación actualizada' : 'Observación guardada')
      setDraft(null)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar la observación'))
    }
  }

  const destroy = async (o: StudentObservation) => {
    if (!window.confirm('¿Eliminar esta observación?')) return
    try {
      await remove.mutateAsync(o)
      toast.success('Observación eliminada')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const rows = data ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Anecdotario</p>
        {!readOnly && !draft && (
          <Button size="sm" variant="outline" onClick={() => setDraft(BLANK)}>
            <Plus className="h-4 w-4" /> Anotar
          </Button>
        )}
      </div>

      {draft && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Field label="Tipo">
            <Select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as ObservationCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {OBSERVATION_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Observación">
            <Textarea
              rows={3}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Qué observaste, con un ejemplo concreto…"
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
              checked={draft.visible_to_family}
              onChange={(e) => setDraft({ ...draft, visible_to_family: e.target.checked })}
            />
            <span>
              Visible para la familia
              <span className="block text-xs text-slate-500">Sale en el boletín del corte.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void submit()} loading={save.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Sin observaciones todavía.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="slate">{OBSERVATION_CATEGORY_LABEL[o.category]}</Badge>
                  {o.visible_to_family ? (
                    <Badge tone="brand">
                      <Eye className="h-3.5 w-3.5" /> Familia
                    </Badge>
                  ) : (
                    <Badge tone="slate">
                      <EyeOff className="h-3.5 w-3.5" /> Interna
                    </Badge>
                  )}
                </div>
                {canEdit(o) && (
                  <div className="-mr-1 -mt-1 flex shrink-0">
                    <button
                      type="button"
                      aria-label="Editar observación"
                      onClick={() =>
                        setDraft({
                          id: o.id,
                          category: o.category,
                          body: o.body,
                          visible_to_family: o.visible_to_family,
                        })
                      }
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar observación"
                      onClick={() => void destroy(o)}
                      className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{o.body}</p>
              <p className="mt-1 text-xs text-slate-400">{fmtDateTime(o.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
