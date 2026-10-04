import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Printer } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/misc'
import { errorMessage } from '@/lib/errors'
import { fetchReportDetails, type DetailFilters } from './reportDetailData'
import { downloadReportCsv } from './reportExport'

export function ReportDetails(props: { filters: DetailFilters; title: string; context: string; disabled?: boolean }) {
  // A new filter starts a new report, without showing the previous selection's data.
  return <Details key={JSON.stringify(props.filters)} {...props} />
}

function Details({ filters, title, context, disabled }: { filters: DetailFilters; title: string; context: string; disabled?: boolean }) {
  const { tenant } = useAuth()
  const [requested, setRequested] = useState(false)
  const [exporting, setExporting] = useState(false)
  const report = useQuery({
    queryKey: ['report', 'details', tenant?.id, filters],
    queryFn: () => fetchReportDetails(filters),
    enabled: requested && !disabled,
  })
  const busy = report.isFetching || exporting
  const exportCsv = async () => {
    setRequested(true)
    setExporting(true)
    try {
      const result = await report.refetch()
      if (!result.data || result.error) return
      downloadReportCsv(`reporte-${filters.type}-${new Date().toISOString().slice(0, 10)}.csv`, [
        [tenant?.name ?? '', title], [context],
        ['Generado', new Date().toLocaleString('es-DO')],
        ...(filters.type === 'ingresos' || filters.type === 'cobros' ? [['Moneda', tenant?.currency ?? '']] : []),
        [], result.data.headers, ...result.data.rows,
      ])
    } finally { setExporting(false) }
  }
  return <section className="mb-5 space-y-3">
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button disabled={disabled || busy} onClick={() => setRequested((value) => !value)}>
        <FileText className="h-4 w-4" />{requested ? 'Ocultar detalle' : 'Generar reporte detallado'}
      </Button>
      <Button variant="outline" disabled={disabled || busy} loading={exporting} onClick={() => void exportCsv()}>
        <Download className="h-4 w-4" />Exportar CSV (Excel)
      </Button>
      <Button variant="outline" disabled={disabled || busy || (requested && (!report.data || report.isError))} onClick={() => window.print()}>
        <Printer className="h-4 w-4" />Imprimir / PDF
      </Button>
    </div>
    <p className="hidden text-sm print:block">{tenant?.name} · {title} · {context}</p>
    {requested && <Card className="p-4">
      <h2 className="font-semibold text-slate-900">{title} — detalle</h2>
      <p className="mb-3 text-sm text-slate-500">{context}{(filters.type === 'ingresos' || filters.type === 'cobros') && ` · ${tenant?.currency ?? ''}`}</p>
      {report.isFetching ? <PageLoader label="Generando reporte detallado…" /> : report.isError ?
        <div role="alert" className="text-sm text-red-600">{errorMessage(report.error, 'No se pudo generar el reporte.')} <Button variant="ghost" onClick={() => void report.refetch()}>Reintentar</Button></div> : report.data && <>
          <p className="mb-3 text-sm text-slate-500">{report.data.rows.length} registros · Generado {new Date(report.dataUpdatedAt).toLocaleString('es-DO')}</p>
          {report.data.rows.length === 0 ? <p className="py-4 text-sm text-slate-500">Sin registros para los filtros seleccionados.</p> :
            <div className="max-h-[32rem] overflow-auto print:max-h-none print:overflow-visible">
              <table className="w-full text-left text-sm print:text-[9px]">
                <thead className="bg-slate-50"><tr>{report.data.headers.map((header) => <th key={header} scope="col" className="px-3 py-2 print:px-1">{header}</th>)}</tr></thead>
                <tbody>{report.data.rows.map((row, i) => <tr key={i} className="border-t border-slate-100 break-inside-avoid">{row.map((cell, j) => <td key={j} className="px-3 py-2 [overflow-wrap:anywhere] print:px-1">{cell ?? '—'}</td>)}</tr>)}</tbody>
              </table>
            </div>}
        </>}
    </Card>}
  </section>
}
