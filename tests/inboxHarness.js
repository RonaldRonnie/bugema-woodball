// Runs apps-script/score-inbox.gs in Node with a small stand-in for Google
// Sheets, so the real script can be tested without a Google account.
// The fake follows the Sheets behaviour that matters here: text that looks
// like a date or number is converted unless the cell is formatted as plain
// text ('@'), a leading apostrophe marks plain text, and "=…" is a formula.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Under the browser-like test environment import.meta.url is not a file URL.
const ROOT = import.meta.url.startsWith('file:') ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') : process.cwd()
const SCRIPT = readFileSync(path.join(ROOT, 'apps-script', 'score-inbox.gs'), 'utf8')

function makeBook(CtxDate) {
  const sheets = new Map()

  function convert(value, format, sheet) {
    if (typeof value !== 'string') return value
    if (value.startsWith("'")) return value.slice(1) // apostrophe = plain text, not stored
    if (value.startsWith('=')) {
      sheet.formulas++
      return '#FORMULA'
    }
    if (format === '@') return value
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new CtxDate(`${value}T00:00:00+03:00`) // Sheets turns it into a date
    if (value !== '' && !isNaN(Number(value))) return Number(value)
    return value
  }

  function makeSheet(name) {
    const sheet = {
      name,
      rows: [],
      formats: [],
      formulas: 0,
      frozen: 0,
      getLastRow: () => sheet.rows.length,
      setFrozenRows: (n) => {
        sheet.frozen = n
      },
      appendRow: (values) => {
        const r = sheet.rows.length
        sheet.rows.push(values.map((v, c) => convert(v, sheet.formats[r]?.[c], sheet)))
      },
      getRange: (row, col, numRows = 1, numCols = 1) => makeRange(sheet, row, col, numRows, numCols),
    }
    return sheet
  }

  function makeRange(sheet, row, col, numRows, numCols) {
    const range = {
      setNumberFormat: (fmt) => {
        for (let r = 0; r < numRows; r++) {
          const fr = (sheet.formats[row - 1 + r] ||= [])
          for (let c = 0; c < numCols; c++) fr[col - 1 + c] = fmt
        }
        return range
      },
      setValues: (values) => {
        if (values.length !== numRows || values.some((v) => v.length !== numCols)) throw new Error('setValues: size mismatch')
        values.forEach((vals, r) => {
          const rr = row - 1 + r
          const target = (sheet.rows[rr] ||= [])
          vals.forEach((v, c) => {
            target[col - 1 + c] = convert(v, sheet.formats[rr]?.[col - 1 + c], sheet)
          })
        })
        return range
      },
      getValues: () =>
        Array.from({ length: numRows }, (_, r) => Array.from({ length: numCols }, (_, c) => sheet.rows[row - 1 + r]?.[col - 1 + c] ?? '')),
      offset: (rOff, cOff, nr = numRows, nc = numCols) => makeRange(sheet, row + rOff, col + cOff, nr, nc),
    }
    return range
  }

  return {
    sheets,
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => {
      const s = makeSheet(name)
      sheets.set(name, s)
      return s
    },
  }
}

/** Loads the inbox script. Returns { post(body), get(params), book }. */
export function loadInboxScript() {
  const ctx = vm.createContext({
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, mime: null, setMimeType(m) { this.mime = m; return this }, getContent() { return this.text } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  })
  const book = makeBook(vm.runInContext('Date', ctx))
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => book }
  vm.runInContext(SCRIPT, ctx, { filename: 'score-inbox.gs' })
  const run = (fn, e) => {
    const out = vm.runInContext(fn, ctx)(e)
    if (out.mime !== 'application/json') throw new Error('The script must answer with JSON')
    return JSON.parse(out.getContent())
  }
  return {
    book,
    post: (body) => run('doPost', { postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } }),
    get: (parameter = {}) => run('doGet', { parameter }),
  }
}

/** A fetch() that talks to the loaded script, like the browser would. */
export function fetchFor(script, { log = [] } = {}) {
  return async (url, init = {}) => {
    log.push({ url, init })
    const params = Object.fromEntries(new URL(url).searchParams)
    const body = init.method === 'POST' ? script.post(init.body) : script.get(params)
    return { ok: true, status: 200, json: async () => body }
  }
}
