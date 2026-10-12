import { describe, expect, it } from 'vitest'
import { neutralizeSpreadsheetFormula, serializeCsv } from './csv-export'

describe('CSV export safety and Bengali text', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1)', '  =HYPERLINK("x")', '\t@cmd'])('neutralizes formula-leading spreadsheet input %j', (value) => {
    expect(neutralizeSpreadsheetFormula(value).startsWith("'")).toBe(true)
  })

  it('keeps Bengali text, quotes delimiters, and prefixes UTF-8 BOM', () => {
    const csv = serializeCsv([['কাজের নাম', 'বিবরণ'], ['রিপোর্ট', 'সে বলল "শেষ"']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"কাজের নাম","বিবরণ"')
    expect(csv).toContain('"সে বলল ""শেষ"""')
    expect(csv).toContain('\r\n')
  })
})
