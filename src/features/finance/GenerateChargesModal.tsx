import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/auth/AuthProvider'
import { useFeeConcepts, useGenerateCharges } from '@/hooks/finance'
import { sectionLabel, useCurrentPeriod, useGradeLevels, useSections } from '@/hooks/academic'
import { errorMessage } from '@/lib/errors'
import { fmtDate, money, num } from '@/lib/format'
import { isoToday, monthToBilling, parseAmount } from './financeUi'

/**
 * "Cargar la mensualidad de septiembre a todo el colegio" en un paso.
 *
 * La regla de no duplicar vive en la base (`generate_charges`): una inscripción
 * que ya tiene ese concepto —y ese mes, si es mensual— se cuenta como omitida.
 * Por eso repetir la operación tras un error de red es seguro, y el aviso final
 * dice cuántos se crearon y cuántos ya existían.
 */
export function GenerateChargesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { tenant } = useAuth()
  const { data: concepts } = useFeeConcepts()
  const { current } = useCurrentPeriod()
  const { data: grades } = useGradeLevels()
  const { data: sections } = useSections(current?.id)
  const generate = useGenerateCharges()

  const [conceptId, setConceptId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [month, setMonth] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [sectionId, setSectionId] = useState('')

  useEffect(() => {
    if (!open) return
    setConceptId('')
    setAmount('')
    setDescription('')
    setDueDate('')
    setMonth(isoToday().slice(0, 7))
    setGradeId('')
    setSectionId('')
  }, [open])

  const concept = concepts?.find((c) => c.id === conceptId)
  const sectionOptions = useMemo(
    () => (sections ?? []).filter((s) => !gradeId || s.grade_level_id === gradeId),
    [sections, gradeId],
  )

  const pickConcept = (id: string) => {
    setConceptId(id)
    const c = concepts?.find((x) => x.id === id)
    if (c) {
      setAmount(c.default_amount > 0 ? String(c.default_amount) : '')
      setDescription(c.name)
    }
  }

  const parsed = parseAmount(amount)
  const canSubmit = Boolean(conceptId && parsed && current)

  const submit = async () => {
    if (!canSubmit) return
    try {
      const r = await generate.mutateAsync({
        concept_id: conceptId,
        amount: parsed,
        description: description.trim() || null,
        due_date: dueDate || null,
        billing_month: concept?.is_recurring ? monthToBilling(month) : null,
        period_id: current!.id,
        grade_level_id: gradeId || null,
        section_id: sectionId || null,
      })
      if (r.created === 0) {
        toast.info(
          r.skipped > 0
            ? `No se creó ninguno: los ${num(r.skipped)} estudiantes ya tenían este cargo.`
            : 'No hay estudiantes inscritos que coincidan con el filtro.',
        )
      } else {
        toast.success(
          `${num(r.created)} cargos creados` + (r.skipped > 0 ? ` · ${num(r.skipped)} ya existían` : ''),
        )
        onClose()
      }
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron generar los cargos'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generar cargos"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} loading={generate.isPending}>
            Generar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {current ? (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            Se aplica a los estudiantes inscritos en <strong>{current.name}</strong> (
            {fmtDate(current.starts_on)} – {fmtDate(current.ends_on)}).
          </p>
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Todavía no hay un año escolar. Créalo en Académico antes de generar cargos.
          </p>
        )}

        <Field label="Concepto" required>
          <Select value={conceptId} onChange={(e) => pickConcept(e.target.value)}>
            <option value="">Elige un concepto…</option>
            {(concepts ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.default_amount > 0 ? `· ${money(c.default_amount, tenant?.currency)}` : ''}
                </option>
              ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Monto por estudiante" required error={amount && !parsed ? 'Monto inválido' : undefined}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Vence" hint="Opcional">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Descripción" hint="Así sale en el recibo. Ej. Mensualidad septiembre">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {concept?.is_recurring && (
          <Field label="Mes que cubre" hint="No se duplica: quien ya tenga la de ese mes se omite">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grado" hint="Vacío = todo el colegio">
            <Select
              value={gradeId}
              onChange={(e) => {
                setGradeId(e.target.value)
                setSectionId('')
              }}
            >
              <option value="">Todos</option>
              {(grades ?? [])
                .filter((g) => g.active)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Sección">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Todas</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sectionLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  )
}
