import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import {
  useGuardians,
  useLinkGuardian,
  useUpdateStudentGuardian,
  type StudentGuardianInput,
  type StudentGuardianRow,
} from '@/hooks/students'
import { RELATIONSHIP_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { GuardianFormModal } from './GuardianFormModal'
import type { Guardian, GuardianRelationship } from '@/types/db'

const DEFAULT_FLAGS: StudentGuardianInput = {
  relationship: 'mother',
  is_primary: false,
  lives_with: true,
  can_pickup: true,
  is_emergency_contact: true,
  is_financial_responsible: false,
}

/** Las banderas del vínculo, con la pregunta que responden en el día a día. */
const FLAGS: { key: keyof Omit<StudentGuardianInput, 'relationship'>; label: string; hint: string }[] = [
  { key: 'is_primary', label: 'Contacto principal', hint: 'Sale en listados y recibos' },
  { key: 'can_pickup', label: 'Puede recogerlo', hint: 'Autorizado a la salida' },
  { key: 'is_emergency_contact', label: 'Contacto de emergencia', hint: 'A quién se llama primero' },
  { key: 'is_financial_responsible', label: 'Responsable de pagos', hint: 'A nombre de quién van los cobros' },
  { key: 'lives_with', label: 'Vive con el estudiante', hint: '' },
]

/**
 * Vincula un familiar a un estudiante (existente o nuevo) o edita el vínculo.
 *
 * Buscar primero entre los familiares YA registrados no es comodidad: es lo que
 * evita duplicar a la madre de dos hermanos, que luego tendría dos teléfonos
 * distintos según por qué hijo se la busque.
 */
export function LinkGuardianModal({
  open,
  onClose,
  studentId,
  link,
  linkedIds,
  hasPrimary,
}: {
  open: boolean
  onClose: () => void
  studentId: string
  /** Vínculo a editar; `null` = vincular a alguien. */
  link: StudentGuardianRow | null
  /** Familiares ya vinculados: no se ofrecen otra vez. */
  linkedIds: string[]
  /** El estudiante ya tiene contacto principal (para sugerir marcarlo en el primero). */
  hasPrimary: boolean
}) {
  const toast = useToast()
  const { data: guardians } = useGuardians()
  const linkGuardian = useLinkGuardian()
  const updateLink = useUpdateStudentGuardian()

  const [guardianId, setGuardianId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Guardian | null>(null)
  const [search, setSearch] = useState('')
  const [flags, setFlags] = useState<StudentGuardianInput>(DEFAULT_FLAGS)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    if (link) {
      setGuardianId(link.guardian_id)
      setPicked(link.guardian)
      setFlags({
        relationship: link.relationship,
        is_primary: link.is_primary,
        lives_with: link.lives_with,
        can_pickup: link.can_pickup,
        is_emergency_contact: link.is_emergency_contact,
        is_financial_responsible: link.is_financial_responsible,
      })
    } else {
      setGuardianId(null)
      setPicked(null)
      // El primer familiar que se vincula es, casi siempre, el principal.
      setFlags({ ...DEFAULT_FLAGS, is_primary: !hasPrimary, is_financial_responsible: !hasPrimary })
    }
  }, [open, link, hasPrimary])

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (guardians ?? [])
      .filter((g) => !linkedIds.includes(g.id))
      .filter(
        (g) =>
          !q ||
          `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
          (g.phone ?? '').includes(q) ||
          (g.document_id ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [guardians, linkedIds, search])

  const save = async () => {
    if (!guardianId) {
      toast.error('Elige un familiar o registra uno nuevo')
      return
    }
    try {
      if (link) {
        await updateLink.mutateAsync({ id: link.id, student_id: studentId, ...flags })
        toast.success('Vínculo actualizado')
      } else {
        await linkGuardian.mutateAsync({ student_id: studentId, guardian_id: guardianId, ...flags })
        toast.success('Familiar vinculado')
      }
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar el vínculo'))
    }
  }

  const busy = linkGuardian.isPending || updateLink.isPending

  return (
    <>
      <Modal
        open={open && !creating}
        onClose={onClose}
        title={link ? 'Editar vínculo' : 'Vincular familiar'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!guardianId}>
              {link ? 'Guardar' : 'Vincular'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">
                  {picked.first_name} {picked.last_name}
                </p>
                <p className="truncate text-xs text-slate-500">{picked.phone ?? 'Sin teléfono'}</p>
              </div>
              {!link && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPicked(null)
                    setGuardianId(null)
                  }}
                >
                  Cambiar
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  className="pl-9"
                  placeholder="Buscar familiar ya registrado…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {candidates.length > 0 ? (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {candidates.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setGuardianId(g.id)
                          setPicked(g)
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {g.first_name} {g.last_name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {g.phone ?? 'Sin teléfono'}
                            {g.student_guardians.length > 0 &&
                              ` · ${g.student_guardians.length} hijo(s) en el colegio`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-sm text-slate-500">
                  {search ? 'Nadie coincide con esa búsqueda.' : 'Aún no hay otros familiares registrados.'}
                </p>
              )}
              <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" /> Registrar familiar nuevo
              </Button>
            </div>
          )}

          <Field label="Parentesco">
            <Select
              value={flags.relationship}
              onChange={(e) => setFlags((f) => ({ ...f, relationship: e.target.value as GuardianRelationship }))}
            >
              {(Object.keys(RELATIONSHIP_LABEL) as GuardianRelationship[]).map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-1">
            {FLAGS.map((f) => (
              <label
                key={f.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50',
                  flags[f.key] && 'bg-slate-50',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={flags[f.key]}
                  onChange={(e) => setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-700">{f.label}</span>
                  {f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* Se apila en vez de anidarse: dos diálogos abiertos a la vez bloquean el
          fondo dos veces y el segundo cierre lo dejaba desbloqueado a medias. */}
      <GuardianFormModal
        open={open && creating}
        onClose={() => setCreating(false)}
        guardian={null}
        onSaved={(g) => {
          setGuardianId(g.id)
          setPicked(g)
        }}
      />
    </>
  )
}
