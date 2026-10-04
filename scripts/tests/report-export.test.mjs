import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load(file) {
  const exports = {}
  const source = readFileSync(new URL(`../../src/features/reports/${file}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } })
  runInNewContext(outputText, { exports, require: () => ({}) })
  return exports
}
const { reportCsv } = load('reportExport.ts')
const { fetchAllRows } = load('reportDetailData.ts')

test('CSV preserves accents, quotes, commas, line breaks and numeric amounts', () => {
  assert.equal(reportCsv([['José, "Peña"', 'Línea\nsegunda', 123.45, null]]), '\uFEFF"José, ""Peña""","Línea\nsegunda","123.45",""')
})
test('CSV neutralizes formulas in text without changing negative numbers', () => {
  assert.equal(reportCsv([['=1+1', ' \t@SUM(A1)', '+123', '-123', -123]]), '\uFEFF"\'=1+1","\' \t@SUM(A1)","\'+123","\'-123","-123"')
})
test('pagination continues past 1000 rows and lower server limits', async () => {
  const source = Array.from({ length: 1251 }, (_, id) => ({ id }))
  const offsets = []
  const result = await fetchAllRows(async (offset) => {
    offsets.push(offset)
    return { data: source.slice(offset, offset + 200), error: null }
  })
  assert.equal(result.length, 1251)
  assert.equal(result[1250].id, 1250)
  assert.deepEqual(offsets, [0, 200, 400, 600, 800, 1000, 1200, 1251])
})
test('pagination rejects partial reports when a later page fails', async () => {
  const failure = new Error('Network failure')
  await assert.rejects(fetchAllRows(async (offset) => offset === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: failure }), /Network failure/)
})
