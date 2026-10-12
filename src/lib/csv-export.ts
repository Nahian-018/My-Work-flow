export function neutralizeSpreadsheetFormula(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const formulaStart = /^[\u0000-\u0020\u00a0\u2000-\u200f\u2028\u2029\ufeff]*[=+\-@]/u
  return formulaStart.test(text) ? `'${text}` : text
}

export function serializeCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map((value) => {
    const safe = neutralizeSpreadsheetFormula(value).replaceAll('"', '""')
    return `"${safe}"`
  }).join(',')).join('\r\n')}`
}

export function downloadCsv(rows: unknown[][], filename: string): void {
  const blob = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
