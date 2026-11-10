// Score inbox: players' phones send finished playing cards to a small
// Google Apps Script (apps-script/score-inbox.gs) that stores them in the
// coach's Google Sheet, one row per player. The coach's panel reads them
// back, checks them against the results and accepts them. Nothing reaches
// the website until the coach publishes.

import { FAIRWAY_COUNT, filledCount, roundTotal } from './scoring.js'
import { toCSV } from './csv.js'

export { cleanInboxUrl, isInboxUrl } from './inboxAddress.js'

export const INBOX_APP = 'bugema-woodball-inbox'

export class InboxError extends Error {}

const OFFLINE = 'No internet connection right now. Try again when you are online.'

async function call(url, init, fetchImpl) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new InboxError(OFFLINE)
  let res
  try {
    res = await fetchImpl(url, { redirect: 'follow', ...init })
  } catch {
    throw new InboxError(`Could not reach the score inbox. ${OFFLINE}`)
  }
  if (!res.ok) throw new InboxError(`The score inbox answered with an error (${res.status}). The coach should check it in Admin → Settings.`)
  let body
  try {
    body = await res.json()
  } catch {
    throw new InboxError(
      'The score inbox sent back something unexpected. Check that the address ends in /exec and that the script is deployed with “Who has access: Anyone”.',
    )
  }
  if (!body || body.ok !== true) throw new InboxError(body?.error ? `The score inbox did not accept it: ${body.error}` : 'The score inbox did not answer properly.')
  return body
}

/** Checks that an address belongs to a working score inbox script. */
export async function pingInbox(url, fetchImpl = fetch) {
  const body = await call(`${url}?action=ping`, { method: 'GET' }, fetchImpl)
  if (body.app !== INBOX_APP) throw new InboxError('That address answers, but it is not the woodball score inbox script.')
  return body
}

/** Sends one card. Sending the same card ID twice stores it once. */
export async function sendCard(url, payload, fetchImpl = fetch) {
  // A plain-text body keeps this a "simple" request, which Apps Script accepts from any site.
  return call(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }, fetchImpl)
}

/** Every card in the inbox, newest first. */
export async function fetchCards(url, fetchImpl = fetch) {
  const body = await call(`${url}?action=list`, { method: 'GET' }, fetchImpl)
  return rowsToCards(Array.isArray(body.rows) ? body.rows : [])
}

function cleanFairways(list) {
  return Array.from({ length: FAIRWAY_COUNT }, (_, i) => {
    const v = Array.isArray(list) ? list[i] : null
    return Number.isInteger(v) && v > 0 ? v : null
  })
}

/** Groups the sheet's rows (one per player) back into cards. */
export function rowsToCards(rows) {
  const byId = new Map()
  for (const r of rows) {
    if (!r || !r.id || !r.playerId) continue
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id,
        submittedAt: r.submittedAt || '',
        match: { id: r.matchId, title: r.match || '', date: r.matchDate || '' },
        round: { id: r.roundId, number: Number(r.round) || null },
        card: Number(r.card) || null,
        scorer: r.scorer || '',
        players: [],
      })
    }
    const card = byId.get(r.id)
    if (card.players.some((p) => p.id === r.playerId)) continue
    card.players.push({ id: r.playerId, name: r.player || '', group: r.group || '', fairways: cleanFairways(r.fairways) })
  }
  return [...byId.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

/** What a phone sends for a scorecard (see lib/scorecards.js). */
export function cardPayload(sc, id) {
  return {
    v: 1,
    id,
    match: { id: sc.matchId, title: sc.matchTitle, date: sc.matchDate },
    round: { id: sc.roundId, number: sc.roundNumber },
    card: sc.cardNumber,
    scorer: sc.scorer.name,
    players: sc.players.map((p) => ({ id: p.id, name: p.name, group: p.groupName, fairways: cleanFairways(sc.scores[p.id]) })),
  }
}

/**
 * Compares a card with the results on this device. Each player gets a
 * `change`:
 *   new           — no scores yet for this player in that round
 *   update        — the card changes what is entered
 *   same          — already entered exactly like this
 *   not-in-lineup — the player is no longer in the match line-up (skipped)
 *   blank         — the card has no scores for the player (skipped)
 *   invalid       — a score is above the maximum per fairway (skipped)
 * Fairways the card leaves blank keep what is already entered (`merged`).
 */
export function reviewCard(card, data) {
  const base = { card, match: null, round: null, problem: '', usable: [] }
  const match = data.matches.find((m) => m.id === card.match.id)
  if (!match) {
    return { ...base, state: 'problem', problem: 'This match is not in your results (it may have been deleted), so the card cannot be added.', players: card.players.map((p) => ({ ...p, change: 'skip' })) }
  }
  const round = match.rounds.find((r) => r.id === card.round.id) || match.rounds.find((r) => r.number === card.round.number)
  if (!round) {
    return { ...base, match, state: 'problem', problem: `Round ${card.round.number} is no longer in this match, so the card cannot be added.`, players: card.players.map((p) => ({ ...p, change: 'skip' })) }
  }
  const max = data.settings.maxStrokesPerFairway
  const lineup = new Set(match.participants.map((p) => p.playerId))
  const players = card.players.map((p) => {
    const current = round.scores[p.id] || null
    if (!lineup.has(p.id)) return { ...p, current, change: 'not-in-lineup' }
    if (!filledCount(p.fairways)) return { ...p, current, change: 'blank' }
    if (p.fairways.some((v) => v != null && v > max)) return { ...p, current, change: 'invalid' }
    const merged = p.fairways.map((v, i) => v ?? current?.[i] ?? null)
    const same = current && merged.every((v, i) => v === (current[i] ?? null))
    return { ...p, current, merged, change: same ? 'same' : current ? 'update' : 'new' }
  })
  const usable = players.filter((p) => p.change === 'new' || p.change === 'update')
  if (usable.length) return { ...base, match, round, players, usable, state: 'ready' }
  if (players.some((p) => p.change === 'same')) return { ...base, match, round, players, usable, state: 'entered' }
  return { ...base, match, round, players, usable, state: 'problem', problem: 'Nothing on this card can be added — see the note next to each player.' }
}

const cardSlot = (c) => `${c.match.id}|${c.round.id}|${c.card}`

/**
 * Every card with its review and a `status`:
 *   ready     — has scores to accept
 *   problem   — nothing on it can be added (match or round missing, no scores…)
 *   entered   — everything on it is already in the results
 *   replaced  — the same card was sent again later; the newer copy counts
 *   accepted / dismissed — handled by the coach on this device (`handled`)
 */
export function inboxItems(cards, data, handled = {}) {
  const newest = new Map()
  for (const c of [...cards].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
    if (!newest.has(cardSlot(c))) newest.set(cardSlot(c), c.id)
  }
  return cards.map((c) => {
    const review = reviewCard(c, data)
    const status = handled[c.id] || (newest.get(cardSlot(c)) !== c.id ? 'replaced' : review.state)
    return { ...review, status }
  })
}

export const isWaiting = (item) => item.status === 'ready' || item.status === 'problem'

/** All cards as a spreadsheet: one row per player. */
export function cardsCSV(cards) {
  const header = ['Submitted at', 'Match', 'Match date', 'Round', 'Card', 'Kept by', 'Player', 'Group']
  for (let i = 1; i <= FAIRWAY_COUNT; i++) header.push(`F${i}`)
  header.push('Total')
  const rows = [header]
  for (const c of cards) {
    for (const p of c.players) {
      rows.push([c.submittedAt, c.match.title, c.match.date, c.round.number, c.card, c.scorer, p.name, p.group, ...p.fairways, roundTotal(p.fairways)])
    }
  }
  return toCSV(rows)
}
