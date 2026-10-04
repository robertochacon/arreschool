import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Printer, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { usePermissions } from '@/lib/permissions'
import { MANUAL_TOPICS, normalizeSearch } from './manual'

export function UserManualPage() {
  const [search, setSearch] = useState('')
  const { can } = usePermissions()
  const query = normalizeSearch(search)
  const topics = MANUAL_TOPICS.filter((topic) => normalizeSearch([
    topic.title, topic.description, ...topic.steps, topic.tip,
  ].join(' ')).includes(query))

  return (
    <div>
      <PageHeader title="Manual de usuario" description="Guía paso a paso para trabajar con ArreSchool"
        action={<Button variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />Imprimir / PDF
        </Button>} />
      <Card className="mb-5 p-5 print:shadow-none">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
          <div>
            <h2 className="font-semibold text-slate-900">¿Qué necesitas hacer?</h2>
            <p className="mt-1 text-sm text-slate-600">Busca una tarea o elige un tema. Las acciones disponibles en cada módulo dependen de tu rol en el colegio.</p>
          </div>
        </div>
        <div className="mt-4 print:hidden">
          <label htmlFor="manual-search" className="mb-1.5 block text-sm font-medium text-slate-700">Buscar en el manual</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input id="manual-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej.: inscribir, asistencia, exportar, recibos…" className="pl-10" />
          </div>
          <p className="mt-2 text-xs text-slate-500" role="status">{topics.length} temas encontrados. La impresión incluye los temas mostrados.</p>
        </div>
      </Card>
      {topics.length === 0 ? <Card className="p-8 text-center">
        <h2 className="font-semibold text-slate-800">No encontramos ese tema</h2>
        <p className="mt-2 text-sm text-slate-500">Prueba con otra palabra, como estudiante, pago o año escolar.</p>
        <Button variant="ghost" className="mt-3" onClick={() => setSearch('')}>Ver todos los temas</Button>
      </Card> : <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] print:block">
        <nav aria-label="Temas del manual" className="self-start rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-20 print:hidden">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">En este manual</p>
          {topics.map((topic) => <button key={topic.id} type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-brand-500"
            onClick={() => {
              const heading = document.getElementById(`manual-${topic.id}`)
              heading?.scrollIntoView({ block: 'start' })
              heading?.focus({ preventScroll: true })
            }}>{topic.title}</button>)}
        </nav>
        <div className="min-w-0 space-y-4">
          {topics.map((topic) => <Card key={topic.id} className="p-5 print:overflow-visible print:shadow-none">
            <h2 id={`manual-${topic.id}`} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold text-slate-900">{topic.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{topic.description}</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              {topic.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
            </ol>
            <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm leading-relaxed text-brand-800">{topic.tip}</p>
            {(!topic.permission || can(topic.permission)) && <Link to={topic.path}
              className="mt-4 inline-flex min-h-9 items-center gap-2 rounded text-sm font-medium text-brand-700 hover:underline focus-visible:outline-brand-500 print:hidden">
              Abrir sección<ArrowRight className="h-4 w-4" />
            </Link>}
          </Card>)}
        </div>
      </div>}
    </div>
  )
}
