import { FAIRWAY_COUNT, POINTS } from '../data/defaults.js'
import { inRange } from './dates.js'

export { FAIRWAY_COUNT, POINTS }

export function emptyFairways() {
  return Array(FAIRWAY_COUNT).fill(null)
}

/**
 * Interprets typed digits for one fairway. Returns { value, valid, done }:
 * `done` means no further digit could make a valid score, so the cursor
 * should move on (e.g. with a limit of 15, "4" is final but "1" may become 12).
 */
export function interpretStroke(text, max) {
  const t = String(text).replace(/\D/g, '').slice(0, 2)
  if (t === '') return { text: t, value: null, valid: true, done: false }
  const n = parseInt(t, 10)
  const valid = n >= 1 && n <= max
  return { text: t, value: valid ? n : null, valid, done: valid && (t.length >= 2 || n * 10 > max) }
}

export function isStrokeValue(v) {
  return Number.isInteger(v) && v >= 1
}

/** Total strokes for one player's round: the sum of the 12 fairway scores. */
export function roundTotal(fairways) {
  if (!Array.isArray(fairways)) return 0
  return fairways.reduce((sum, v) => (isStrokeValue(v) ? sum + v : sum), 0)
}

export function filledCount(fairways) {
  if (!Array.isArray(fairways)) return 0
  return fairways.filter(isStrokeValue).length
}

/** A round counts towards statistics only when all 12 fairways are scored. */
export function isRoundComplete(fairways) {
  return Array.isArray(fairways) && fairways.length === FAIRWAY_COUNT && fairways.every(isStrokeValue)
}

/** Matches in chronological order (date, then creation time). */
export function sortMatches(matches, direction = 'asc') {
  const sorted = [...matches].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''),
  )
  return direction === 'desc' ? sorted.reverse() : sorted
}

export function matchesInRange(matches, range) {
  return matches.filter((m) => inRange(m.date, range))
}

/**
 * Every player-round in the given matches as a flat list.
 * Entries with no fairway entered at all are skipped.
 */
export function collectEntries(matches) {
  const entries = []
  for (const match of sortMatches(matches)) {
    const rounds = [...match.rounds].sort((a, b) => a.number - b.number)
    for (const round of rounds) {
      for (const participant of match.participants) {
        const fairways = round.scores?.[participant.playerId]
        if (!fairways || filledCount(fairways) === 0) continue
        entries.push({
          matchId: match.id,
          matchTitle: match.title,
          matchType: match.type,
          date: match.date,
          roundId: round.id,
          roundNumber: round.number,
          playerId: participant.playerId,
          groupId: participant.groupId,
          fairways,
          total: roundTotal(fairways),
          complete: isRoundComplete(fairways),
        })
      }
    }
  }
  return entries
}

/**
 * Per-group figures for one match, using EVERY fairway score entered —
 * including rounds still in progress — so results update as scores come in.
 *
 *   fairways      number of fairway scores entered
 *   totalStrokes  sum of those scores
 *   avgStrokes    average strokes per round, i.e. per fairway × 12, so a
 *                 player 3 fairways in compares fairly with a finished round
 *   playerRounds  completed rounds (all 12 fairways)
 *   inProgress    started rounds with fewer than 12 fairways
 */
export function groupMatchMetrics(match) {
  const metrics = {}
  for (const gid of match.groupIds) {
    metrics[gid] = { fairways: 0, totalStrokes: 0, playerRounds: 0, inProgress: 0, avgStrokes: null }
  }
  for (const round of match.rounds) {
    for (const p of match.participants) {
      const f = round.scores?.[p.playerId]
      const m = metrics[p.groupId]
      const n = filledCount(f)
      if (!m || n === 0) continue
      m.fairways += n
      m.totalStrokes += roundTotal(f)
      if (n === FAIRWAY_COUNT) m.playerRounds += 1
      else m.inProgress += 1
    }
  }
  for (const m of Object.values(metrics)) {
    m.avgStrokes = m.fairways ? (m.totalStrokes / m.fairways) * FAIRWAY_COUNT : null
  }
  return metrics
}

const RESULT_RANK = { W: 2, D: 1, L: 0 }

/** Exact comparison of two groups' metrics (negative = `a` did better). No rounding errors. */
function compareMetrics(a, b, useTotal) {
  if (useTotal) return a.totalStrokes - b.totalStrokes
  return a.totalStrokes * b.fairways - b.totalStrokes * a.fairways // strokes per fairway, cross-multiplied
}

/** True when the outcome carries a W/D/L result (final or live). */
export function hasResult(outcome) {
  return outcome.status === 'decided' || outcome.status === 'live'
}

/**
 * Decides a match result for each participating group.
 *
 * status: 'practice' — training session, no points
 *         'pending'  — a group has no scores yet (or manual result not chosen)
 *         'live'     — provisional result while scorecards are still being
 *                      filled in; it can change until they are complete
 *         'decided'  — final: every started scorecard has all 12 fairways
 *
 * Automatic mode: the group with the fewest strokes per fairway (shown per
 * round) wins — woodball is scored like golf. Groups level on that measure
 * draw; all others lose. With settings.liveResults === false, matches in
 * progress stay 'pending' until complete.
 */
export function computeOutcome(match, settings = {}) {
  const metrics = groupMatchMetrics(match)
  const base = { metrics, results: {}, mode: match.outcomeMode || 'auto' }
  if (match.type === 'practice' || match.groupIds.length < 2) return { ...base, status: 'practice' }

  if (match.outcomeMode === 'manual') {
    const results = {}
    for (const gid of match.groupIds) {
      const r = match.manualResults?.[gid]
      if (!RESULT_RANK.hasOwnProperty(r)) return { ...base, status: 'pending' }
      results[gid] = r
    }
    return { ...base, results, status: 'decided' }
  }

  const useTotal = settings.outcomeMetric === 'total'
  if (match.groupIds.some((gid) => !metrics[gid].fairways)) return { ...base, status: 'pending' }
  const inProgress = match.groupIds.some((gid) => metrics[gid].inProgress > 0)
  if (inProgress && settings.liveResults === false) return { ...base, status: 'pending', waitingForCompletion: true }

  const best = match.groupIds.reduce((b, gid) => (compareMetrics(metrics[gid], metrics[b], useTotal) < 0 ? gid : b))
  const leaders = match.groupIds.filter((gid) => compareMetrics(metrics[gid], metrics[best], useTotal) === 0)
  const results = {}
  for (const gid of match.groupIds) {
    results[gid] = !leaders.includes(gid) ? 'L' : leaders.length > 1 ? 'D' : 'W'
  }
  return { ...base, results, status: inProgress ? 'live' : 'decided', compared: useTotal ? 'total' : 'average' }
}

/**
 * Compares two groups inside one match with a result: 1 if `a` did better,
 * -1 if worse, 0 if level. Used for head-to-head tie-breaks.
 */
function pairwise(outcome, a, b) {
  if (outcome.mode === 'manual') {
    return Math.sign(RESULT_RANK[outcome.results[a]] - RESULT_RANK[outcome.results[b]])
  }
  const ma = outcome.metrics[a]
  const mb = outcome.metrics[b]
  if (!ma?.fairways || !mb?.fairways) return 0
  return -Math.sign(compareMetrics(ma, mb, outcome.compared === 'total'))
}

function emptyRow(group) {
  return {
    groupId: group.id,
    name: group.name,
    color: group.color,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    live: 0, // matches still in progress counted provisionally
    playerRounds: 0,
    fairways: 0,
    totalStrokes: 0,
    avgStrokes: null,
    bestRound: null,
    form: [], // [{ result: 'W'|'D'|'L', live: boolean }]
  }
}

/** Head-to-head points for each group in `ids`, from matches among them only. */
function headToHeadPoints(ids, decided) {
  const set = new Set(ids)
  const pts = Object.fromEntries(ids.map((id) => [id, 0]))
  for (const { match, outcome } of decided) {
    const inBlock = match.groupIds.filter((g) => set.has(g))
    for (let i = 0; i < inBlock.length; i++) {
      for (let j = i + 1; j < inBlock.length; j++) {
        const cmp = pairwise(outcome, inBlock[i], inBlock[j])
        if (cmp > 0) pts[inBlock[i]] += POINTS.W
        else if (cmp < 0) pts[inBlock[j]] += POINTS.W
        else {
          pts[inBlock[i]] += POINTS.D
          pts[inBlock[j]] += POINTS.D
        }
      }
    }
  }
  return pts
}

// Every criterion yields a number where HIGHER is better.
function criterionValues(key, block, decided) {
  switch (key) {
    case 'points':
      return Object.fromEntries(block.map((r) => [r.groupId, r.points]))
    case 'wins':
      return Object.fromEntries(block.map((r) => [r.groupId, r.won]))
    case 'fewerLosses':
      return Object.fromEntries(block.map((r) => [r.groupId, -r.lost]))
    case 'avgStrokes':
      return Object.fromEntries(block.map((r) => [r.groupId, r.avgStrokes == null ? -Infinity : -round2(r.avgStrokes)]))
    case 'bestRound':
      return Object.fromEntries(block.map((r) => [r.groupId, r.bestRound == null ? -Infinity : -r.bestRound]))
    case 'headToHead':
      return headToHeadPoints(
        block.map((r) => r.groupId),
        decided,
      )
    default:
      return Object.fromEntries(block.map((r) => [r.groupId, 0]))
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** Splits rows into ordered tie-blocks by applying criteria in sequence. */
function resolveBlocks(block, chain, index, decided) {
  if (block.length <= 1 || index >= chain.length) return [block]
  const values = criterionValues(chain[index], block, decided)
  const sorted = [...block].sort((a, b) => values[b.groupId] - values[a.groupId])
  const subBlocks = []
  for (const row of sorted) {
    const last = subBlocks[subBlocks.length - 1]
    if (last && values[last[0].groupId] === values[row.groupId]) last.push(row)
    else subBlocks.push([row])
  }
  return subBlocks.flatMap((sub) => resolveBlocks(sub, chain, index + 1, decided))
}

/**
 * Builds the group leaderboard for matches within `range`.
 * Points (W 3 · D 1 · L 0) always rank first; the enabled tie-breakers from
 * settings are then applied in order. Groups still level share a rank.
 * Matches in progress count with their current (live) result, so the table
 * updates as scores are entered. Stroke figures come from competitive
 * matches only and include every fairway entered.
 */
export function computeStandings(data, range = null) {
  const settings = data.settings || {}
  const rows = Object.fromEntries(data.groups.map((g) => [g.id, emptyRow(g)]))
  const decided = []

  for (const match of sortMatches(matchesInRange(data.matches, range))) {
    const outcome = computeOutcome(match, settings)
    if (!hasResult(outcome)) continue
    const live = outcome.status === 'live'
    decided.push({ match, outcome })
    for (const gid of match.groupIds) {
      const row = rows[gid]
      if (!row) continue
      const res = outcome.results[gid]
      row.played += 1
      if (live) row.live += 1
      if (res === 'W') row.won += 1
      else if (res === 'D') row.drawn += 1
      else row.lost += 1
      row.points += POINTS[res]
      row.form.push({ result: res, live })
      const m = outcome.metrics[gid]
      if (m) {
        row.playerRounds += m.playerRounds
        row.fairways += m.fairways
        row.totalStrokes += m.totalStrokes
      }
    }
    for (const round of match.rounds) {
      for (const p of match.participants) {
        const f = round.scores?.[p.playerId]
        const row = rows[p.groupId]
        if (!row || !isRoundComplete(f)) continue
        const t = roundTotal(f)
        if (row.bestRound == null || t < row.bestRound) row.bestRound = t
      }
    }
  }

  const list = Object.values(rows).map((r) => ({
    ...r,
    avgStrokes: r.fairways ? (r.totalStrokes / r.fairways) * FAIRWAY_COUNT : null,
    form: r.form.slice(-5),
  }))

  const chain = ['points', ...(settings.tieBreakers || []).filter((t) => t.enabled).map((t) => t.key)]
  const blocks = resolveBlocks(list, chain, 0, decided)
  const ranked = []
  for (const block of blocks) {
    const rank = ranked.length + 1
    const ordered = [...block].sort((a, b) => a.name.localeCompare(b.name))
    for (const row of ordered) ranked.push({ ...row, rank, tied: block.length > 1 })
  }
  return ranked
}
