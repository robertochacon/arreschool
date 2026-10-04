import { useRef, useState } from 'react'
import { ExternalLink, FileText, Trash2, Upload } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, PageLoader } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import {
  openStudentDocument,
  useDeleteStudentDocument,
  useStudentDocuments,
  useUploadStudentDocument,
} from '@/hooks/students'
import { DOCUMENT_KIND_LABEL } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { fmtDateShort } from '@/lib/format'
import type { DocumentKind, Student, StudentDocument } from '@/types/db'

/**
 * Tope de tamaño en el cliente. No es seguridad (Storage aplica el suyo): es
 * para no dejar a alguien esperando la subida de un video de 200 MB por datos
 * móviles y que falle al final.
 */
const MAX_BYTES = 10 * 1024 * 1024

function fileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Pestaña "Documentos": acta, vacunas, certificados… en el bucket privado. */
export function StudentDocumentsTab({
  student,
  canManage,
}: {
  student: Pick<Student, 'id' | 'tenant_id'>
  canManage: boolean
}) {
  const toast = useToast()
  const { data, isLoading, isError, error } = useStudentDocuments(student.id)
  const upload = useUploadStudentDocument()
  const remove = useDeleteStudentDocument()

  const [kind, setKind] = useState<DocumentKind>('birth_certificate')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const docs = data ?? []

  const submit = async () => {
    if (!file) {
      toast.error('Elige un archivo')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('El archivo pasa de 10 MB. Prueba con una foto o un PDF más liviano.')
      return
    }
    try {
      await upload.mutateAsync({
        student,
        file,
        kind,
        // Sin título se usa el tipo: "Acta de nacimiento" ya dice lo que es.
        title: title.trim() || DOCUMENT_KIND_LABEL[kind],
        notes: null,
      })
      toast.success('Documento guardado')
      setTitle('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo subir el documento'))
    }
  }

  const open = async (doc: StudentDocument) => {
    try {
      await openStudentDocument(doc)
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo abrir el documento'))
    }
  }

  const destroy = async (doc: StudentDocument) => {
    if (!window.confirm(`¿Eliminar "${doc.title}"? El archivo se borra para siempre.`)) return
    try {
      await remove.mutateAsync(doc)
      toast.success('Documento eliminado')
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar'))
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader title="Subir documento" subtitle="Foto o PDF, hasta 10 MB. Solo lo ve el personal del colegio." />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                  {(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Título" hint="Opcional">
                <Input
                  placeholder={DOCUMENT_KIND_LABEL[kind]}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                ref={fileRef}
                type="file"
                // `capture` no: en el teléfono deja elegir entre cámara y archivos.
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
              />
              <Button onClick={() => void submit()} loading={upload.isPending} disabled={!file} className="shrink-0">
                <Upload className="h-4 w-4" /> Subir
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <PageLoader label="Cargando documentos…" />
        ) : isError ? (
          <p className="p-6 text-center text-sm text-red-600">{errorMessage(error)}</p>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Sin documentos"
            description="Acta de nacimiento, tarjeta de vacunas y certificados médicos quedan aquí, a mano."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void open(d)}
                    className="block max-w-full truncate text-left font-medium text-slate-800 hover:text-brand-600"
                  >
                    {d.title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Badge tone="slate">{DOCUMENT_KIND_LABEL[d.kind]}</Badge>
                    <span>{fmtDateShort(d.created_at)}</span>
                    {d.size_bytes != null && <span>· {fileSize(d.size_bytes)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void open(d)}
                  title="Abrir"
                  aria-label={`Abrir ${d.title}`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void destroy(d)}
                    title="Eliminar"
                    aria-label={`Eliminar ${d.title}`}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
