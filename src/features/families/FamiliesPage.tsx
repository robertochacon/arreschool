import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { useDeleteGuardian, useGuardians, type GuardianRow } from '@/hooks/students'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { Avatar, EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { RELATIONSHIP_LABEL } from '@/lib/constants'
import { usePermissions } from '@/lib/permissions'
import { errorMessage } from '@/lib/errors'
import { digits, num } from '@/lib/format'
import { cn } from '@/lib/cn'
import { GuardianFormModal } from './GuardianFormModal'
import { ContactLinks } from './ContactLinks'

/**
 * Familias: padres, madres y tutores, con sus hijos en el colegio.
 *
 * Una ficha por persona aunque tenga varios hijos inscritos: es lo que permite
 * ver a los hermanos juntos y que un cambio de teléfono valga para todos.
 */

const PAGE_SIZE = 15

export function FamiliesPage() {
  const toast = useToast()
  const { can } = usePermissions()
  const { data, isLoading, isError, error, refetch, isFetching } = useGuardians()
  const remove = useDeleteGuardian()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GuardianRow | null>(null)

  const canManage = can('manageStudents')
  const guardians = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qd = digits(q)
    if (!q) return guardians
    return guardians.filter(
      (g) =>
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
        (g.document_id ?? '').toLowerCase().includes(q) ||
        (qd.length >= 3 && (digits(g.phone).includes(qd) || digits(g.phone_alt).includes(qd))) ||
        // Buscar por el nombre del hijo es lo más natural en la puerta del colegio.
        g.student_guardians.some((sg) =>
          `${sg.student?.first_name ?? ''} ${sg.student?.last_name ?? ''}`.toLowerCase().includes(q),
        ),
    )
  }, [guardians, search])

  useEffect(() => setPage(0), [search])
  const { slice, safePage } = paginate(filtered, page, PAGE_SIZE)

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  const edit = (g: GuardianRow) => {
    setEditing(g)
    setOpen(true)
  }

  const destroy = async (g: GuardianRow) => {
    const kids = g.student_guardians.length
    const warning = kids > 0 ? ` Se desvinculará de ${kids} estudiante(s).` : ''
    if (!window.confirm(`¿Eliminar a ${g.first_name} ${g.last_name}?${warning} No se puede deshacer.`)) return
    try {
      await remove.mutateAsync(g.id)
      toast.success('Familiar eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const actionsFor = (g: GuardianRow) => [
    { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => edit(g) },
    {
      label: 'Eliminar',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger' as const,
      onClick: () => void destroy(g),
      hint: 'Sin vuelta atrás',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Familias"
        description={`${num(guardians.length)} familiares registrados`}
        action={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Nuevo familiar
            </Button>
          ) : undefined
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          className="pl-9"
          placeholder="Buscar por nombre, teléfono, documento o hijo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando familias…" />
        ) : isError ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar las familias.')}</p>
            <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
              Reintentar
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={guardians.length === 0 ? 'Todavía no hay familias' : 'Sin resultados'}
            description={
              guardians.length === 0
                ? 'Lo habitual es registrarlas desde la ficha de cada estudiante, en la pestaña Familia.'
                : 'Prueba con otra búsqueda.'
            }
            action={
              guardians.length === 0 && canManage ? (
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" /> Registrar familiar
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Familiar</th>
                    <th className="px-4 py-3 font-medium">Contacto</th>
                    <th className="px-4 py-3 font-medium">Hijos en el colegio</th>
                    {canManage && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slice.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${g.first_name} ${g.last_name}`} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">
                              {g.first_name} {g.last_name}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {[g.document_id, g.occupation].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {g.phone ? <ContactLinks phone={g.phone} /> : <span className="text-slate-400">—</span>}
                        {g.email && <p className="truncate text-xs text-slate-500">{g.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Children guardian={g} />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Editar" onClick={() => edit(g)}>
                              <Pencil className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn title="Eliminar" tone="red" onClick={() => void destroy(g)}>
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DataList>
              {slice.map((g) => (
                <DataRow
                  key={g.id}
                  leading={<Avatar name={`${g.first_name} ${g.last_name}`} size="sm" />}
                  title={`${g.first_name} ${g.last_name}`}
                  titleExtra={g.email ?? undefined}
                  onClick={canManage ? () => edit(g) : undefined}
                  actions={
                    canManage ? (
                      <ActionMenu
                        title={`${g.first_name} ${g.last_name}`}
                        label={`Opciones de ${g.first_name}`}
                        items={actionsFor(g)}
                      />
                    ) : undefined
                  }
                  badges={<Children guardian={g} />}
                >
                  {g.phone && (
                    <DataFields cols={2}>
                      <DataField label="Teléfono" className="col-span-2">
                        <ContactLinks phone={g.phone} />
                      </DataField>
                    </DataFields>
                  )}
                </DataRow>
              ))}
            </DataList>

            <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="familiares" />
          </>
        )}
      </Card>

      <GuardianFormModal open={open} onClose={() => setOpen(false)} guardian={editing} />
    </div>
  )
}

/** Hijos del familiar como enlaces a su ficha, con el parentesco. */
function Children({ guardian }: { guardian: GuardianRow }) {
  if (guardian.student_guardians.length === 0) {
    return <span className="text-xs text-slate-400">Sin estudiantes vinculados</span>
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {guardian.student_guardians.map((sg) =>
        sg.student ? (
          <Link
            key={sg.id}
            to={`/estudiantes/${sg.student.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            {sg.student.first_name} {sg.student.last_name}
            <span className="text-brand-500">· {RELATIONSHIP_LABEL[sg.relationship]}</span>
          </Link>
        ) : null,
      )}
    </span>
  )
}

const ICON_TONES = {
  slate: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  red: 'text-red-500 hover:bg-red-50',
} as const

/** Botón de icono de la tabla (escritorio). En el teléfono van en el ActionMenu. */
function IconBtn({
  title,
  onClick,
  children,
  tone = 'slate',
}: {
  title: string
  onClick: () => void
  children: ReactNode
  tone?: keyof typeof ICON_TONES
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn('rounded-lg p-2 transition-colors', ICON_TONES[tone])}
    >
      {children}
    </button>
  )
}
