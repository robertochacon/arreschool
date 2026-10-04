import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link2, Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import {
  useDeleteTeacher,
  useSaveTeacher,
  useTeachers,
  useTeamMembersWithEmail,
  type TeacherInput,
} from '@/hooks/academic'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { DataField, DataFields, DataList, DataRow } from '@/components/ui/DataList'
import { Avatar, EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { STAFF_STATUS_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import type { StaffStatus, Teacher, TeamMemberWithEmail } from '@/types/db'
import { Notice, orNull } from './shared'

/**
 * Personal docente. Una ficha NO es una cuenta: muchos colegios registran a su
 * personal sin darle acceso. Enlazar la ficha con una cuenta de rol Docente es
 * lo que le permite pasar lista y calificar en SUS secciones.
 */
export function TeachersTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const { data, isLoading, isError, error, refetch } = useTeachers()
  // La lista de cuentas con correo solo la puede pedir Dirección (la RPC lo
  // exige); para el resto ni se pide.
  const members = useTeamMembersWithEmail(canEdit)
  const save = useSaveTeacher()
  const remove = useDeleteTeacher()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ open: boolean; teacher: Teacher | null }>({ open: false, teacher: null })

  const teachers = useMemo(() => data ?? [], [data])
  const emailOf = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.email ?? m.full_name ?? 'Cuenta'])),
    [members.data],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return teachers
    return teachers.filter((t) =>
      `${t.first_name} ${t.last_name} ${t.email ?? ''} ${t.specialty ?? ''}`.toLowerCase().includes(q),
    )
  }, [teachers, search])

  const toggleStatus = async (t: Teacher) => {
    const next: StaffStatus = t.status === 'active' ? 'inactive' : 'active'
    try {
      await save.mutateAsync({ ...toInput(t), id: t.id, status: next })
      toast.success(`${t.first_name} ${t.last_name}: ${STAFF_STATUS_LABEL[next].toLowerCase()}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el estado'))
    }
  }

  const destroy = async (t: Teacher) => {
    if (!window.confirm(`¿Eliminar la ficha de ${t.first_name} ${t.last_name}? Se quitará de sus secciones.`)) return
    try {
      await remove.mutateAsync(t.id)
      toast.success('Docente eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  const actionsFor = (t: Teacher) => [
    { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setForm({ open: true, teacher: t }) },
    t.status === 'active'
      ? {
          label: 'Marcar inactivo',
          icon: <UserX className="h-4 w-4" />,
          onClick: () => void toggleStatus(t),
          hint: 'Deja de poder pasar lista',
        }
      : {
          label: 'Marcar activo',
          icon: <UserCheck className="h-4 w-4" />,
          tone: 'success' as const,
          onClick: () => void toggleStatus(t),
        },
    {
      label: 'Eliminar',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger' as const,
      onClick: () => void destroy(t),
    },
  ]

  if (isLoading) return <PageLoader label="Cargando docentes…" />
  if (isError) {
    return (
      <Card className="space-y-3 p-8 text-center">
        <p className="text-sm text-red-600">{errorMessage(error, 'No se pudieron cargar los docentes.')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </Card>
    )
  }

  const accountLabel = (t: Teacher) => (t.user_id ? (emailOf.get(t.user_id) ?? 'Cuenta enlazada') : 'Sin acceso')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar por nombre, correo o especialidad…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setForm({ open: true, teacher: null })}>
            <Plus className="h-4 w-4" /> Nuevo docente
          </Button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Users className="h-6 w-6" />}
            title={teachers.length === 0 ? 'Todavía no hay docentes' : 'Sin resultados'}
            description={
              teachers.length === 0
                ? 'Registra a tu personal docente y asígnalo a sus secciones.'
                : 'Prueba con otra búsqueda.'
            }
            action={
              canEdit && teachers.length === 0 ? (
                <Button onClick={() => setForm({ open: true, teacher: null })}>
                  <Plus className="h-4 w-4" /> Registrar el primero
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
                    <th className="px-4 py-3 font-medium">Docente</th>
                    <th className="px-4 py-3 font-medium">Contacto</th>
                    <th className="px-4 py-3 font-medium">Especialidad</th>
                    <th className="px-4 py-3 font-medium">Acceso</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${t.first_name} ${t.last_name}`} size="sm" />
                          <span className="font-medium text-slate-800">
                            {t.first_name} {t.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p>{t.phone ?? '—'}</p>
                        {t.email && <p className="text-xs text-slate-400">{t.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.specialty ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={t.user_id ? 'brand' : 'slate'}>
                          {t.user_id && <Link2 className="h-3 w-3" />}
                          {accountLabel(t)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={t.status === 'active' ? 'green' : 'slate'}>{STAFF_STATUS_LABEL[t.status]}</Badge>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <ActionMenu
                            title={`${t.first_name} ${t.last_name}`}
                            label={`Opciones de ${t.first_name}`}
                            items={actionsFor(t)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataList>
              {filtered.map((t) => (
                <DataRow
                  key={t.id}
                  leading={<Avatar name={`${t.first_name} ${t.last_name}`} size="sm" />}
                  title={`${t.first_name} ${t.last_name}`}
                  titleExtra={t.specialty ?? undefined}
                  tone={t.status === 'active' ? undefined : 'muted'}
                  badges={
                    <>
                      <Badge tone={t.status === 'active' ? 'green' : 'slate'}>{STAFF_STATUS_LABEL[t.status]}</Badge>
                      <Badge tone={t.user_id ? 'brand' : 'slate'}>{accountLabel(t)}</Badge>
                    </>
                  }
                  actions={
                    canEdit ? (
                      <ActionMenu
                        title={`${t.first_name} ${t.last_name}`}
                        label={`Opciones de ${t.first_name}`}
                        items={actionsFor(t)}
                      />
                    ) : undefined
                  }
                >
                  <DataFields>
                    <DataField label="Teléfono">{t.phone ?? '—'}</DataField>
                    <DataField label="Correo">{t.email ?? '—'}</DataField>
                  </DataFields>
                </DataRow>
              ))}
            </DataList>
          </>
        )}
      </Card>

      <TeacherFormModal
        open={form.open}
        teacher={form.teacher}
        teachers={teachers}
        accounts={members.data ?? []}
        onClose={() => setForm({ open: false, teacher: null })}
      />
    </div>
  )
}

function toInput(t: Teacher): TeacherInput {
  return {
    first_name: t.first_name,
    last_name: t.last_name,
    document_id: t.document_id,
    email: t.email,
    phone: t.phone,
    specialty: t.specialty,
    hired_on: t.hired_on,
    status: t.status,
    notes: t.notes,
    user_id: t.user_id,
  }
}

const BLANK: TeacherInput = {
  first_name: '',
  last_name: '',
  document_id: null,
  email: null,
  phone: null,
  specialty: null,
  hired_on: null,
  status: 'active',
  notes: null,
  user_id: null,
}

function TeacherFormModal({
  open,
  teacher,
  teachers,
  accounts,
  onClose,
}: {
  open: boolean
  teacher: Teacher | null
  teachers: Teacher[]
  accounts: TeamMemberWithEmail[]
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveTeacher()
  const [v, setV] = useState<TeacherInput>(BLANK)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setV(teacher ? toInput(teacher) : BLANK)
  }, [open, teacher])

  const set = <K extends keyof TeacherInput>(k: K, value: TeacherInput[K]) => setV((p) => ({ ...p, [k]: value }))

  // Una cuenta = una ficha (la base lo exige con un unique): las ya enlazadas a
  // OTRA ficha no se ofrecen, en vez de dejar que el guardado falle.
  const taken = new Set(teachers.filter((t) => t.user_id && t.id !== teacher?.id).map((t) => t.user_id))
  // Solo cuentas con rol Docente… salvo la que ya está enlazada, que se muestra
  // aunque le hayan cambiado el rol: si no, el select la pintaría en blanco.
  const options = accounts.filter((a) => (a.role === 'teacher' || a.id === v.user_id) && !taken.has(a.id))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (v.first_name.trim().length < 2 || v.last_name.trim().length < 2) {
      return setError('Escribe nombre y apellido')
    }
    try {
      await save.mutateAsync({
        id: teacher?.id,
        ...v,
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        document_id: orNull(v.document_id),
        email: orNull(v.email),
        phone: orNull(v.phone),
        specialty: orNull(v.specialty),
        hired_on: v.hired_on || null,
        notes: orNull(v.notes),
      })
      toast.success(teacher ? 'Docente actualizado' : 'Docente registrado')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el docente'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={teacher ? 'Editar docente' : 'Nuevo docente'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="teacher-form" type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input value={v.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </Field>
          <Field label="Apellido" required>
            <Input value={v.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input type="tel" inputMode="tel" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Correo">
            <Input type="email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Cédula / documento">
            <Input value={v.document_id ?? ''} onChange={(e) => set('document_id', e.target.value)} />
          </Field>
          <Field label="Especialidad">
            <Input
              value={v.specialty ?? ''}
              onChange={(e) => set('specialty', e.target.value)}
              placeholder="Ej. Educación inicial"
            />
          </Field>
          <Field label="Fecha de ingreso">
            <Input type="date" value={v.hired_on ?? ''} onChange={(e) => set('hired_on', e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={v.status} onChange={(e) => set('status', e.target.value as StaffStatus)}>
              {(Object.keys(STAFF_STATUS_LABEL) as StaffStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STAFF_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Cuenta de ArreSchool Teacher"
          hint="Le permite pasar lista y calificar en las secciones que tenga asignadas."
        >
          <Select value={v.user_id ?? ''} onChange={(e) => set('user_id', e.target.value || null)}>
            <option value="">Sin acceso a la app</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? 'Sin nombre'} · {a.email ?? ''}
              </option>
            ))}
          </Select>
        </Field>
        {options.length === 0 && (
          <Notice>
            No hay cuentas con rol <strong>Docente</strong> libres. Invita a la persona desde Configuración → Equipo,
            eligiendo el rol Docente; cuando acepte, aparecerá aquí.
          </Notice>
        )}

        <Field label="Notas" hint="Opcional">
          <Textarea rows={2} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
