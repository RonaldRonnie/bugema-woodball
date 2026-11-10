import { describe, it, expect, afterEach } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'
import { seedCards } from '../src/lib/cards.js'
import { validateDataset, normalizeDataset } from '../src/services/storage.js'
import { isInboxUrl, cleanInboxUrl, pingInbox, sendCard, fetchCards, rowsToCards, cardPayload, reviewCard, inboxItems, isWaiting, cardsCSV } from '../src/lib/inbox.js'
import { newScorecard, withStroke } from '../src/lib/scorecards.js'
import { loadInboxScript, fetchFor } from './inboxHarness.js'

const URL_OK = `https://script.google.com/macros/s/AKfycbx${'Q'.repeat(40)}/exec`
const fw = (v) => Array(12).fill(v)

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed roster + a three-group match with playing cards, and a scorecard for card 1. */
function setup() {
  const data = createSeedData('2026-01-01T00:00:00.000Z')
  const groupIds = ['grp-a', 'grp-b', 'grp-c']
  const participants = data.players.filter((p) => groupIds.includes(p.groupId) && p.active).map((p) => ({ playerId: p.id, groupId: p.groupId }))
  const matchId = A.createMatch(data, { date: '2026-11-14', type: 'match', groupIds, participants, cards: seedCards(participants, { rng: rng(7) }) })
  const match = data.matches.find((m) => m.id === matchId)
  const playersById = Object.fromEntries(data.players.map((p) => [p.id, p]))
  const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))
  const playerIds = match.cards[0].playerIds
  let sc = newScorecard({ match, round: match.rounds[0], cardNumber: 1, playerIds, playersById, groupsById, scorer: { id: playerIds[0], name: playersById[playerIds[0]].name } })
  playerIds.forEach((pid, n) => {
    for (let i = 0; i < 12; i++) sc = withStroke(sc, pid, i, 3 + ((n + i) % 3))
  })
  return { data, match, sc, playerIds }
}

const card = (script, payload) => {
  const res = script.post(payload)
  expect(res).toMatchObject({ ok: true })
  return res
}

afterEach(() => {
  delete navigator.onLine
})

describe('score inbox address', () => {
  it('accepts Apps Script web app addresses only', () => {
    expect(isInboxUrl(URL_OK)).toBe(true)
    expect(isInboxUrl(`https://script.google.com/a/macros/bugema.ac.ug/s/AKfycbx${'Q'.repeat(40)}/exec`)).toBe(true)
    expect(isInboxUrl(URL_OK.replace('https:', 'http:'))).toBe(false)
    expect(isInboxUrl(URL_OK.replace('/exec', '/dev'))).toBe(false)
    expect(isInboxUrl(`${URL_OK}?x=1`)).toBe(false)
    expect(isInboxUrl(URL_OK.replace('script.google.com', 'script.evil.com'))).toBe(false)
    expect(isInboxUrl('')).toBe(false)
    expect(cleanInboxUrl(`  ${URL_OK}\n`)).toBe(URL_OK)
  })

  it('is a setting that defaults to off and is checked on save and in datasets', () => {
    const data = createSeedData('2026-01-01T00:00:00.000Z')
    expect(data.settings.scoreInboxUrl).toBe('')
    expect(() => A.updateSettings(data, { scoreInboxUrl: 'https://example.com/exec' })).toThrow(/Apps Script/)
    A.updateSettings(data, { scoreInboxUrl: ` ${URL_OK} ` })
    expect(data.settings.scoreInboxUrl).toBe(URL_OK)
    expect(validateDataset(data)).toEqual([])
    A.updateSettings(data, { scoreInboxUrl: '' })
    expect(data.settings.scoreInboxUrl).toBe('')

    const tampered = JSON.parse(JSON.stringify(data))
    tampered.settings.scoreInboxUrl = 'https://attacker.example/collect'
    expect(validateDataset(tampered).join(' ')).toMatch(/score inbox address/)

    const old = JSON.parse(JSON.stringify(data))
    delete old.settings.scoreInboxUrl
    expect(normalizeDataset(old).settings.scoreInboxUrl).toBe('')
  })
})

describe('Apps Script inbox (the real script against a stand-in sheet)', () => {
  it('answers a set-up check', async () => {
    const script = loadInboxScript()
    await expect(pingInbox(URL_OK, fetchFor(script))).resolves.toMatchObject({ app: 'bugema-woodball-inbox' })
  })

  it('stores a card as one row per player and gives it back unchanged', async () => {
    const { sc, playerIds } = setup()
    const script = loadInboxScript()
    const log = []
    const f = fetchFor(script, { log })
    await sendCard(URL_OK, cardPayload(sc, 'card-abc123'), f)

    // A "simple" request (no preflight), as Apps Script needs.
    expect(log[0].init.method).toBe('POST')
    expect(log[0].init.headers['Content-Type']).toMatch(/^text\/plain/)

    const sheet = script.book.getSheetByName('Submissions')
    expect(sheet.rows).toHaveLength(1 + playerIds.length)
    expect(sheet.rows[0].slice(0, 3)).toEqual(['Submitted at', 'Submission ID', 'Match ID'])
    expect(sheet.rows[0].at(-1)).toBe('Total')
    // The match date stays text (Sheets would otherwise turn it into a date).
    expect(sheet.rows[1][4]).toBe('2026-11-14')
    expect(sheet.rows[1].at(-1)).toBe(sc.scores[playerIds[0]].reduce((a, b) => a + b, 0))

    const [back] = await fetchCards(URL_OK, f)
    expect(back).toMatchObject({
      id: 'card-abc123',
      match: { id: sc.matchId, title: sc.matchTitle, date: '2026-11-14' },
      round: { id: sc.roundId, number: 1 },
      card: 1,
      scorer: sc.scorer.name,
    })
    expect(back.players.map((p) => p.id)).toEqual(playerIds)
    for (const p of back.players) expect(p.fairways).toEqual(sc.scores[p.id])
    expect(Date.parse(back.submittedAt)).not.toBeNaN()
  })

  it('stores a card sent twice only once', () => {
    const { sc } = setup()
    const script = loadInboxScript()
    card(script, cardPayload(sc, 'card-twice1'))
    expect(script.post(cardPayload(sc, 'card-twice1'))).toMatchObject({ ok: true, duplicate: true })
    expect(script.get().rows).toHaveLength(sc.players.length)
  })

  it('keeps blank fairways blank', async () => {
    let { sc, playerIds } = setup()
    sc = withStroke(sc, playerIds[1], 5, null)
    const script = loadInboxScript()
    card(script, cardPayload(sc, 'card-blank1'))
    const [back] = await fetchCards(URL_OK, fetchFor(script))
    expect(back.players[1].fairways[5]).toBeNull()
    expect(back.players[1].fairways.filter((v) => v == null)).toHaveLength(1)
  })

  it('refuses cards it cannot trust', () => {
    const { sc } = setup()
    const script = loadInboxScript()
    const good = cardPayload(sc, 'card-good01')
    const bad = (mutate) => {
      const p = JSON.parse(JSON.stringify(good))
      mutate(p)
      return script.post(p)
    }
    expect(script.post('not json')).toMatchObject({ ok: false, error: 'The card could not be read.' })
    expect(script.post('')).toMatchObject({ ok: false })
    expect(script.post('x'.repeat(20001))).toMatchObject({ ok: false, error: 'The card is too large.' })
    expect(bad((p) => (p.id = 'x'))).toMatchObject({ ok: false })
    expect(bad((p) => (p.players[0].fairways[0] = 0))).toMatchObject({ ok: false })
    expect(bad((p) => (p.players[0].fairways[0] = 100))).toMatchObject({ ok: false })
    expect(bad((p) => (p.players[0].fairways[0] = 2.5))).toMatchObject({ ok: false })
    expect(bad((p) => p.players[0].fairways.push(3))).toMatchObject({ ok: false })
    expect(bad((p) => (p.scorer = ' '))).toMatchObject({ ok: false })
    expect(bad((p) => (p.match.date = '14/11/2026'))).toMatchObject({ ok: false })
    expect(bad((p) => (p.players = Array.from({ length: 9 }, (_, i) => ({ ...p.players[0], id: `p${i}` }))))).toMatchObject({ ok: false })
    expect(bad((p) => (p.players[1].id = p.players[0].id))).toMatchObject({ ok: false })
    expect(script.book.getSheetByName('Submissions')).toBeNull()
  })

  it('stores names that look like formulas as plain text', async () => {
    const { sc } = setup()
    const script = loadInboxScript()
    const p = cardPayload(sc, 'card-formula')
    p.scorer = '=HYPERLINK("http://x")'
    p.players[0].name = '+256 700 000000'
    card(script, p)
    expect(script.book.getSheetByName('Submissions').formulas).toBe(0)
    const [back] = await fetchCards(URL_OK, fetchFor(script))
    expect(back.scorer).toBe('=HYPERLINK("http://x")')
    expect(back.players[0].name).toBe('+256 700 000000')
  })

  it('lists nothing when no card has arrived yet', async () => {
    await expect(fetchCards(URL_OK, fetchFor(loadInboxScript()))).resolves.toEqual([])
  })
})

describe('reading the inbox in the app', () => {
  const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body })

  it('explains failures in plain words', async () => {
    await expect(pingInbox(URL_OK, ok({ ok: true, app: 'something-else' }))).rejects.toThrow(/not the woodball score inbox/)
    await expect(fetchCards(URL_OK, async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') }))).rejects.toThrow(/ends in \/exec/)
    await expect(fetchCards(URL_OK, async () => ({ ok: false, status: 500 }))).rejects.toThrow(/error \(500\)/)
    await expect(sendCard(URL_OK, {}, ok({ ok: false, error: 'The card has no valid ID.' }))).rejects.toThrow(/did not accept it: The card has no valid ID/)
    await expect(
      fetchCards(URL_OK, async () => {
        throw new TypeError('Failed to fetch')
      }),
    ).rejects.toThrow(/Could not reach the score inbox/)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    let called = false
    await expect(
      sendCard(URL_OK, {}, async () => {
        called = true
      }),
    ).rejects.toThrow(/No internet/)
    expect(called).toBe(false)
  })

  it('groups rows into cards, newest first, ignoring incomplete rows', () => {
    const row = (id, at, playerId, fairways = fw(3)) => ({ id, submittedAt: at, matchId: 'm', match: 'M', matchDate: '2026-11-14', roundId: 'r', round: 1, card: 2, scorer: 'S', playerId, player: playerId, group: 'G', fairways })
    const cards = rowsToCards([
      row('a', '2026-11-14T10:00:00Z', 'p1'),
      row('a', '2026-11-14T10:00:00Z', 'p2', [4, null, 'x', -1, 2.5, 3, 3, 3, 3, 3, 3]),
      row('b', '2026-11-14T11:00:00Z', 'p1'),
      { id: 'c' },
      row('a', '2026-11-14T10:00:00Z', 'p2'),
    ])
    expect(cards.map((c) => c.id)).toEqual(['b', 'a'])
    expect(cards[1].players).toHaveLength(2)
    expect(cards[1].players[1].fairways).toEqual([4, null, null, null, null, 3, 3, 3, 3, 3, 3, null])
  })

  it('downloads every card as CSV, one row per player', () => {
    const { sc } = setup()
    const cards = rowsToCards(loadInboxScript().get().rows)
    expect(cards).toEqual([])
    const script = loadInboxScript()
    card(script, cardPayload(sc, 'card-csv001'))
    const csv = cardsCSV(rowsToCards(script.get().rows))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Submitted at,Match,Match date,Round,Card,Kept by,Player,Group,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12,Total')
    expect(lines).toHaveLength(1 + sc.players.length)
    expect(lines[1]).toContain(sc.players[0].name)
  })
})

describe('checking cards against the results', () => {
  const asCard = (sc, id, submittedAt = '2026-11-14T12:00:00.000Z') => ({ ...rowsToCards([])[0], ...cardPayload(sc, id), submittedAt })

  it('offers new scores, then shows them as entered once accepted', () => {
    const { data, sc } = setup()
    const c = asCard(sc, 'card-1')
    const review = reviewCard(c, data)
    expect(review.state).toBe('ready')
    expect(review.players.map((p) => p.change)).toEqual(['new', 'new', 'new', 'new'])

    A.acceptCardScores(data, { matchId: review.match.id, roundId: review.round.id, players: review.usable.map((p) => ({ playerId: p.id, fairways: p.merged })) })
    expect(validateDataset(data)).toEqual([])
    for (const p of sc.players) expect(data.matches[0].rounds[0].scores[p.id]).toEqual(sc.scores[p.id])

    const again = reviewCard(c, data)
    expect(again.state).toBe('entered')
    expect(again.players.every((p) => p.change === 'same')).toBe(true)
  })

  it('shows changes, and keeps entered scores where the card is blank', () => {
    const { data, sc, playerIds } = setup()
    const round = data.matches[0].rounds[0]
    A.setPlayerRound(data, data.matches[0].id, round.id, playerIds[0], fw(6))
    let edited = withStroke(sc, playerIds[0], 0, null)
    const r = reviewCard(asCard(edited, 'card-2'), data)
    const first = r.players[0]
    expect(first.change).toBe('update')
    expect(first.merged[0]).toBe(6) // blank on the card: the entered 6 stays
    expect(first.merged.slice(1)).toEqual(sc.scores[playerIds[0]].slice(1))
  })

  it('skips players it cannot add, and flags missing matches', () => {
    const { data, sc, playerIds, match } = setup()
    // Player 1 leaves the line-up; player 2 has a blank card; player 3 has a score over the maximum.
    A.updateMatch(data, match.id, { participants: match.participants.filter((p) => p.playerId !== playerIds[0]) })
    let edited = sc
    for (let i = 0; i < 12; i++) edited = withStroke(edited, playerIds[1], i, null)
    edited = withStroke(edited, playerIds[2], 3, 40)
    const r = reviewCard(asCard(edited, 'card-3'), data)
    expect(r.players.map((p) => p.change)).toEqual(['not-in-lineup', 'blank', 'invalid', 'new'])
    expect(r.usable.map((p) => p.id)).toEqual([playerIds[3]])

    let empty = sc
    for (const p of sc.players) for (let i = 0; i < 12; i++) empty = withStroke(empty, p.id, i, null)
    const blank = reviewCard(asCard(empty, 'card-blank'), data)
    expect(blank.state).toBe('problem') // waits for the coach to dismiss it
    expect(blank.problem).toMatch(/Nothing on this card/)

    const gone = reviewCard(asCard(sc, 'card-4'), { ...data, matches: [] })
    expect(gone.state).toBe('problem')
    expect(gone.problem).toMatch(/not in your results/)
    expect(gone.usable).toEqual([])
  })

  it('finds the round by number if its ID changed', () => {
    const { data, sc } = setup()
    const c = { ...asCard(sc, 'card-5'), round: { id: 'rnd-old', number: 1 } }
    expect(reviewCard(c, data).round.id).toBe(data.matches[0].rounds[0].id)
    expect(reviewCard({ ...c, round: { id: 'rnd-old', number: 2 } }, data).state).toBe('problem')
  })

  it('counts only the newest copy of a card and remembers what the coach handled', () => {
    const { data, sc } = setup()
    const older = asCard(sc, 'card-old', '2026-11-14T12:00:00.000Z')
    const newer = asCard(sc, 'card-new', '2026-11-14T12:05:00.000Z')
    let items = inboxItems([newer, older], data)
    expect(items.map((i) => i.status)).toEqual(['ready', 'replaced'])
    expect(items.filter(isWaiting)).toHaveLength(1)

    items = inboxItems([newer, older], data, { 'card-new': 'dismissed' })
    expect(items.map((i) => i.status)).toEqual(['dismissed', 'replaced'])
    expect(items.filter(isWaiting)).toHaveLength(0)
  })

  it('refuses to add a card for a match that is gone or with no scores', () => {
    const { data } = setup()
    expect(() => A.acceptCardScores(data, { matchId: 'nope', roundId: 'x', players: [{ playerId: 'p', fairways: fw(3) }] })).toThrow(/Match/)
    expect(() => A.acceptCardScores(data, { matchId: data.matches[0].id, roundId: data.matches[0].rounds[0].id, players: [] })).toThrow(/no scores/)
  })
})
