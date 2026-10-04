export type ReportCell = string | number | null | undefined

/** UTF-8 BOM for Excel; quote fields and neutralize spreadsheet formulas. */
export function reportCsv(rows: ReportCell[][]): string {
  return '\uFEFF' + rows.map((row) => row.map((value) => {
    let text = String(value ?? '')
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text
    return `"${text.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
}

export function downloadReportCsv(filename: string, rows: ReportCell[][]) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
