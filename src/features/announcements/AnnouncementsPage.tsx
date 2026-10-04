import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { useCurrentPeriod, useMySections, useSections } from '@/hooks/academic'
import { useAnnouncements, useDeleteAnnouncement, type AnnouncementRow } from '@/hooks/announcements'
import { usePermissions } from '@/lib/permissions'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { AUDIENCE_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { AnnouncementFormModal } from './AnnouncementFormModal'
import type { AnnouncementAudience } from '@/types/db'

const OFFICE_AUDIENCES: AnnouncementAudience[] = ['all', 'grade_level', 'section']
const TEACHER_AUDIENCES: AnnouncementAudience[] = ['section']

/** "Todo el colegio", "Kinder" o "Kinder A": a quién va dirigido, en palabras. */
function audienceText(a: AnnouncementRow) {
  if (a.audience === 'grade_level') return a.grade_level?.name ?? AUDIENCE_LABEL.grade_level
  if (a.audience === 'section')
    return a.section ? `${a.section.grade_level?.name ?? ''} ${a.section.name}`.trim() : AUDIENCE_LABEL.section
  return AUDIENCE_LABEL.all
}

/**
 * Comunicados del colegio (ArreSchool Family los mostrará a las familias).
 *
 * Secretaría y Dirección escriben a cualquier audiencia; una docente, solo a
 * sus secciones — la política de la base lo exige igual
 * (`auth_teaches_section`), aquí solo se evita ofrecerle lo que fallaría.
 */
export function AnnouncementsPage() {
  const { can } = usePermissions()
  const toast = useToast()
  const office = can('manageStudents')
  const { current } = useCurrentPeriod()
  const all = useSections(office ? current?.id : undefined)
  const mine = useMySections(current?.id, false)
  const { data, isLoading, isError, error, refetch, isFetching } = useAnnouncements()
  const remove = useDeleteAnnouncement()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementRow | null>(null)

  // Memo para que la referencia sea estable: el formulario se reinicia cuando
  // cambia, y un `?? []` nuevo en cada render lo vaciaría mientras se escribe.
  const writableSections = useMemo(
    () => (office ? (all.data ?? []) : mine.sections),
    [office, all.data, mine.sections],
  )
  const mineIds = useMemo(() => new Set(mine.sections.map((s) => s.id)), [mine.sections])
  const canCreate = office || mine.sections.length > 0
  const canEdit = (a: AnnouncementRow) => office || (a.section_id !== null && mineIds.has(a.section_id))

  // 'yyyy-MM-dd' local y no toISOString(): en América, de noche, el ISO ya es
  // "mañana" y un comunicado que vence hoy saldría vencido antes de tiempo.
  const today = format(new Date(), 'yyyy-MM-dd')
  const rows = data ?? []

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }

  const destroy = async (a: AnnouncementRow) => {
    if (!window.confirm(`¿Eliminar "${a.title}"?`)) return
    try {
      await remove.mutateAsync(a.id)
      toast.success('Comunicado eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Comunicados"
        description="Avisos para todo el colegio, un grado o una sección."
        action={
          canCreate ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <PageLoader label="Cargando comunicados…" />
      ) : isError ? (
        <Card className="space-y-3 p-8 text-center">
          <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los comunicados.')}</p>
          <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
            Reintentar
          </Button>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6" />}
          title="Todavía no hay comunicados"
          description="Publica avisos de reuniones, actividades o días feriados para mantener a todos al tanto."
          action={
            canCreate ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Escribir el primero
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const expired = Boolean(a.expires_on && a.expires_on < today)
            return (
              <li key={a.id}>
                <Card className={cn('p-4', expired && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.pinned && (
                          <Badge tone="brand">
                            <Pin className="h-3.5 w-3.5" /> Fijado
                          </Badge>
                        )}
                        <Badge tone="slate">{audienceText(a)}</Badge>
                        {expired && <Badge tone="amber">Vencido</Badge>}
                      </div>
                      <h3 className="mt-2 font-semibold text-slate-800">{a.title}</h3>
                    </div>
                    {canEdit(a) && (
                      <ActionMenu
                        title={a.title}
                        label={`Opciones de ${a.title}`}
                        items={[
                          {
                            label: 'Editar',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => {
                              setEditing(a)
                              setOpen(true)
                            },
                          },
                          {
                            label: 'Eliminar',
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: 'danger',
                            onClick: () => void destroy(a),
                          },
                        ]}
                      />
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-700">{a.body}</p>
                  <p className="mt-3 text-xs text-slate-400">
                    {fmtDateTime(a.published_at)}
                    {a.expires_on && ` · vence el ${fmtDate(a.expires_on)}`}
                  </p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <AnnouncementFormModal
        open={open}
        onClose={() => setOpen(false)}
        announcement={editing}
        audiences={office ? OFFICE_AUDIENCES : TEACHER_AUDIENCES}
        sections={writableSections}
      />
    </div>
  )
}
