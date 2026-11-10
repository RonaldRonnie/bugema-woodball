/**
 * Bugema Woodball — score inbox
 * ------------------------------------------------------------------
 * Players' phones send each finished playing card here, and the coach's
 * panel in the app reads the cards back. Every card is saved in the
 * "Submissions" sheet of this spreadsheet: one row per player with the
 * 12 fairway scores, so you can also download it as a CSV file at any
 * time (File → Download → Comma-separated values).
 *
 * Nothing here changes the team website. The coach checks each card in
 * the app (Admin → Score inbox), accepts it and publishes the results.
 *
 * Set-up steps: in the app, open Admin → Settings → Score inbox.
 *
 * @OnlyCurrentDoc
 */

const SHEET_NAME = 'Submissions'
const FAIRWAYS = 12
const MAX_PLAYERS = 8
const MAX_STROKES = 99
const MAX_BODY_LENGTH = 20000
const TEXT_COLUMNS = 12 // columns A–L hold text; the fairway and total columns hold numbers
const HEADERS = [
  'Submitted at',
  'Submission ID',
  'Match ID',
  'Match',
  'Match date',
  'Round ID',
  'Round',
  'Card',
  'Kept by',
  'Player ID',
  'Player',
  'Group',
]
  .concat(Array.from({ length: FAIRWAYS }, (_, i) => 'F' + (i + 1)))
  .concat(['Total'])

/** The coach's panel reads the cards; `?action=ping` checks the set-up. */
function doGet(e) {
  const params = (e && e.parameter) || {}
  if (params.action === 'ping') return reply_({ ok: true, app: 'bugema-woodball-inbox', version: 1 })
  return reply_({ ok: true, rows: readRows_() })
}

/** A player's phone sends one playing card. */
function doPost(e) {
  let card
  try {
    const body = e && e.postData ? String(e.postData.contents || '') : ''
    if (!body) throw new Error('The card is empty.')
    if (body.length > MAX_BODY_LENGTH) throw new Error('The card is too large.')
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (err) {
      throw new Error('The card could not be read.')
    }
    card = checkCard_(parsed)
  } catch (err) {
    return reply_({ ok: false, error: String((err && err.message) || err) })
  }

  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const sheet = sheet_()
    // A phone may send the same card twice (e.g. after a dropped connection).
    if (hasSubmission_(sheet, card.id)) return reply_({ ok: true, id: card.id, duplicate: true })
    const at = new Date().toISOString()
    const rows = card.players.map((p) =>
      [at, card.id, card.match.id, card.match.title, card.match.date, card.round.id, String(card.round.number), String(card.card), card.scorer, p.id, p.name, p.group]
        .map(safeText_)
        .concat(p.fairways.map((v) => (v == null ? '' : v)))
        .concat([p.fairways.reduce((sum, v) => sum + (v || 0), 0)]),
    )
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
    // Keep IDs and dates as typed (stops Sheets turning "2026-11-14" into a date).
    range.offset(0, 0, rows.length, TEXT_COLUMNS).setNumberFormat('@')
    range.setValues(rows)
    return reply_({ ok: true, id: card.id })
  } finally {
    lock.releaseLock()
  }
}

function checkCard_(c) {
  if (!c || typeof c !== 'object') throw new Error('The card could not be read.')
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
  const id = text(c.id, 64)
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('The card has no valid ID.')
  const match = c.match || {}
  const round = c.round || {}
  const out = {
    id: id,
    match: { id: text(match.id, 64), title: text(match.title, 120), date: text(match.date, 10) },
    round: { id: text(round.id, 64), number: Number(round.number) },
    card: Number(c.card),
    scorer: text(c.scorer, 120),
    players: [],
  }
  if (!out.match.id) throw new Error('The card does not say which match it is for.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.match.date)) throw new Error('The card has an invalid match date.')
  if (!Number.isInteger(out.round.number) || out.round.number < 1 || out.round.number > 99) throw new Error('The card has an invalid round.')
  if (!Number.isInteger(out.card) || out.card < 1 || out.card > 999) throw new Error('The card has an invalid card number.')
  if (!out.scorer) throw new Error('The card does not say who kept score.')
  if (!Array.isArray(c.players) || c.players.length < 1 || c.players.length > MAX_PLAYERS) {
    throw new Error('A card must have between 1 and ' + MAX_PLAYERS + ' players.')
  }
  const seen = {}
  c.players.forEach((p) => {
    const pid = text(p && p.id, 64)
    if (!pid || seen[pid]) throw new Error('The card lists a player twice or without an ID.')
    seen[pid] = true
    const fairways = p.fairways
    if (!Array.isArray(fairways) || fairways.length !== FAIRWAYS) throw new Error('Each player needs exactly ' + FAIRWAYS + ' fairway scores.')
    fairways.forEach((v) => {
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > MAX_STROKES)) throw new Error('Fairway scores must be whole numbers from 1 to ' + MAX_STROKES + '.')
    })
    out.players.push({ id: pid, name: text(p.name, 120), group: text(p.group, 120), fairways: fairways.slice() })
  })
  return out
}

function sheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = book.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME)
    sheet.appendRow(HEADERS)
    sheet.setFrozenRows(1)
  }
  return sheet
}

function hasSubmission_(sheet, id) {
  const last = sheet.getLastRow()
  if (last < 2) return false
  return sheet
    .getRange(2, 2, last - 1, 1)
    .getValues()
    .some((r) => String(r[0]) === id)
}

function readRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  if (!sheet || sheet.getLastRow() < 2) return []
  const str = (v) => (v instanceof Date ? v.toISOString() : String(v == null ? '' : v))
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length)
    .getValues()
    .filter((r) => str(r[1]))
    .map((r) => ({
      submittedAt: str(r[0]),
      id: str(r[1]),
      matchId: str(r[2]),
      match: str(r[3]),
      matchDate: str(r[4]),
      roundId: str(r[5]),
      round: num(r[6]),
      card: num(r[7]),
      scorer: str(r[8]),
      playerId: str(r[9]),
      player: str(r[10]),
      group: str(r[11]),
      fairways: r.slice(TEXT_COLUMNS, TEXT_COLUMNS + FAIRWAYS).map(num),
    }))
}

/** Text that starts like a formula is stored as plain text, never run. */
function safeText_(v) {
  const s = String(v == null ? '' : v)
  return /^[=+\-@]/.test(s) ? "'" + s : s
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
