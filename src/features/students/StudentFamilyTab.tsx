import { useState } from 'react'
import { Link2Off, Pencil, UserPlus, UserRoundPen, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useStudentGuardians, useUnlinkGuardian, type StudentGuardianRow } from '@/hooks/students'
import { RELATIONSHIP_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { ContactLinks } from '@/features/families/ContactLinks'
import { GuardianFormModal } from '@/features/families/GuardianFormModal'
import { LinkGuardianModal } from '@/features/families/LinkGuardianModal'

/** Pestaña "Familia" de la ficha: quién es quién para este estudiante. */
export function StudentFamilyTab({ studentId, canManage }: { studentId: string; canManage: boolean }) {
  const toast = useToast()
  const { data, isLoading, isError, error } = useStudentGuardians(studentId)
  const unlink = useUnlinkGuardian()

  const [linkOpen, setLinkOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<StudentGuardianRow | null>(null)
  const [editingGuardian, setEditingGuardian] = useState<StudentGuardianRow | null>(null)

  const links = data ?? []

  const openLink = (l: StudentGuardianRow | null) => {
    setEditingLink(l)
    setLinkOpen(true)
  }

  const doUnlink = async (l: StudentGuardianRow) => {
    const name = l.guardian ? `${l.guardian.first_name} ${l.guardian.last_name}` : 'este familiar'
    // Desvincular no borra la ficha del familiar: puede seguir ligado a hermanos.
    if (!window.confirm(`¿Desvincular a ${name} de este estudiante? Su ficha se conserva.`)) return
    try {
      await unlink.mutateAsync(l.id)
      toast.success('Familiar desvinculado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo desvincular'))
    }
  }

  if (isLoading) return <PageLoader label="Cargando familia…" />
  if (isError) return <p className="p-6 text-center text-sm text-red-600">{errorMessage(error)}</p>

  return (
    <div className="space-y-3">
      {canManage && links.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openLink(null)}>
            <UserPlus className="h-4 w-4" /> Vincular familiar
          </Button>
        </div>
      )}

      {links.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Sin familiares vinculados"
            description="Registra a la madre, el padre o el tutor: son los contactos de emergencia y a quienes se cobra."
            action={
              canManage ? (
                <Button onClick={() => openLink(null)}>
                  <UserPlus className="h-4 w-4" /> Vincular familiar
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {links.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">
                    {l.guardian ? `${l.guardian.first_name} ${l.guardian.last_name}` : '—'}
                  </p>
                  <p className="text-sm text-slate-500">{RELATIONSHIP_LABEL[l.relationship]}</p>
                </div>
                {canManage && (
                  <ActionMenu
                    title={l.guardian ? `${l.guardian.first_name} ${l.guardian.last_name}` : 'Familiar'}
                    label="Opciones del familiar"
                    items={[
                      {
                        label: 'Editar vínculo',
                        icon: <Pencil className="h-4 w-4" />,
                        hint: 'Parentesco, contacto principal, recogida…',
                        onClick: () => openLink(l),
                      },
                      {
                        label: 'Editar datos del familiar',
                        icon: <UserRoundPen className="h-4 w-4" />,
                        onClick: () => setEditingGuardian(l),
                      },
                      {
                        label: 'Desvincular',
                        icon: <Link2Off className="h-4 w-4" />,
                        tone: 'danger',
                        onClick: () => void doUnlink(l),
                      },
                    ]}
                  />
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.is_primary && <Badge tone="brand">Principal</Badge>}
                {l.is_emergency_contact && <Badge tone="red">Emergencia</Badge>}
                {l.can_pickup ? <Badge tone="green">Puede recogerlo</Badge> : <Badge tone="amber">No recoge</Badge>}
                {l.is_financial_responsible && <Badge tone="slate">Responsable de pagos</Badge>}
                {l.lives_with && <Badge tone="slate">Vive con el estudiante</Badge>}
              </div>

              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                {l.guardian?.phone ? (
                  <ContactLinks phone={l.guardian.phone} />
                ) : (
                  <p className="text-slate-400">Sin teléfono</p>
                )}
                {l.guardian?.phone_alt && <ContactLinks phone={l.guardian.phone_alt} />}
                {l.guardian?.email && <p className="truncate px-2 text-slate-600">{l.guardian.email}</p>}
                {l.guardian?.document_id && (
                  <p className="px-2 text-xs text-slate-500">Documento: {l.guardian.document_id}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <LinkGuardianModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        studentId={studentId}
        link={editingLink}
        linkedIds={links.map((l) => l.guardian_id)}
        hasPrimary={links.some((l) => l.is_primary)}
      />
      <GuardianFormModal
        open={Boolean(editingGuardian?.guardian)}
        onClose={() => setEditingGuardian(null)}
        guardian={editingGuardian?.guardian ?? null}
      />
    </div>
  )
}
