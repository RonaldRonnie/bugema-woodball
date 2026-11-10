// Scorecards kept on a player's phone: one player keeps score for the whole
// playing card, fairway by fairway. Every change is saved on the phone at
// once, so nothing is lost without internet or if the browser closes.
// Each scorecard copies the names it needs, so it can be finished offline.

import { FAIRWAY_COUNT } from './scoring.js'

const PREFIX = 'bu-woodball:scorecard:'

function store() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const scorecardKey = (matchId, roundId, cardNumber) => `${matchId}|${roundId}|${cardNumber}`

export function matchLabel(match, groupsById) {
  return match.title || match.groupIds.map((g) => groupsById[g]?.name || 'Group').join(' vs ')
}

/** A new, empty scorecard for one playing card of a match round. */
export function newScorecard({ match, round, cardNumber, playerIds, playersById, groupsById, scorer, now = new Date().toISOString() }) {
  const groupOf = new Map(match.participants.map((p) => [p.playerId, p.groupId]))
  return {
    v: 1,
    key: scorecardKey(match.id, round.id, cardNumber),
    matchId: match.id,
    matchTitle: matchLabel(match, groupsById),
    matchDate: match.date,
    roundId: round.id,
    roundNumber: round.number,
    cardNumber,
    players: playerIds.map((id) => {
      const groupId = groupOf.get(id) ?? null
      const group = groupsById[groupId]
      return { id, name: playersById[id]?.name || 'Unknown player', groupId, groupName: group?.name || '', color: group?.color || null }
    }),
    scorer: { id: scorer?.id ?? null, name: String(scorer?.name ?? '').trim().slice(0, 120) },
    scores: Object.fromEntries(playerIds.map((id) => [id, Array(FAIRWAY_COUNT).fill(null)])),
    fairway: 0,
    startedAt: now,
    updatedAt: now,
    sent: null, // { id, at, scores } once sent to the coach
  }
}

function isScorecard(sc) {
  return Boolean(sc && sc.v === 1 && sc.key && Array.isArray(sc.players) && sc.scores && typeof sc.scores === 'object')
}

export function loadScorecard(key) {
  try {
    const sc = JSON.parse(store()?.getItem(PREFIX + key) || 'null')
    return isScorecard(sc) ? sc : null
  } catch {
    return null
  }
}

/** Saves a scorecard; returns false if this browser cannot store it. */
export function saveScorecard(sc) {
  try {
    const s = store()
    if (!s) return false
    s.setItem(PREFIX + sc.key, JSON.stringify(sc))
    return true
  } catch {
    return false
  }
}

export function removeScorecard(key) {
  try {
    store()?.removeItem(PREFIX + key)
  } catch {
    /* nothing to remove */
  }
}

/** Scorecards saved on this phone (optionally for one match), latest first. */
export function listScorecards(matchId) {
  const s = store()
  if (!s) return []
  const out = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    const sc = loadScorecard(k.slice(PREFIX.length))
    if (sc && (!matchId || sc.matchId === matchId)) out.push(sc)
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function withStroke(sc, playerId, index, value, now = new Date().toISOString()) {
  const row = [...(sc.scores[playerId] || Array(FAIRWAY_COUNT).fill(null))]
  row[index] = value
  return { ...sc, scores: { ...sc.scores, [playerId]: row }, updatedAt: now }
}

export const fairwayDone = (sc, i) => sc.players.every((p) => sc.scores[p.id]?.[i] != null)

export function hasAnyScore(sc) {
  return sc.players.some((p) => (sc.scores[p.id] || []).some((v) => v != null))
}

/** Missing scores as [{ player, index }]. */
export function missingScores(sc) {
  const out = []
  for (let i = 0; i < FAIRWAY_COUNT; i++) {
    for (const p of sc.players) if (sc.scores[p.id]?.[i] == null) out.push({ player: p, index: i })
  }
  return out
}

/** 'unsent', 'sent', or 'changed' (scores edited after sending). */
export function sendState(sc) {
  if (!sc.sent) return 'unsent'
  return sc.sent.scores === JSON.stringify(sc.scores) ? 'sent' : 'changed'
}

export function markSent(sc, { id, at }) {
  return { ...sc, sent: { id, at, scores: JSON.stringify(sc.scores) } }
}
