import {
  FAIRWAY_COUNT,
  collectEntries,
  computeOutcome,
  computeStandings,
  matchesInRange,
  sortMatches,
} from './scoring.js'

/**
 * Summary numbers for a set of player-round entries. Every fairway score
 * entered counts — including rounds still in progress — so statistics
 * update as scores come in. The average is strokes per fairway × 12 (i.e.
 * per round), which compares a part-played round fairly with a full one.
 * Best and highest round need all 12 fairways.
 */
function summarise(entries) {
  const complete = entries.filter((e) => e.complete)
  let fairwaysPlayed = 0
  let totalStrokes = 0
  const fairwaySums = Array(FAIRWAY_COUNT).fill(0)
  const fairwayCounts = Array(FAIRWAY_COUNT).fill(0)
  for (const e of entries) {
    e.fairways.forEach((v, i) => {
      if (v == null) return
      fairwaySums[i] += v
      fairwayCounts[i] += 1
      fairwaysPlayed += 1
      totalStrokes += v
    })
  }
  let best = null
  let worst = null
  for (const e of complete) {
    if (!best || e.total < best.total) best = e
    if (!worst || e.total > worst.total) worst = e
  }
  return {
    matchesPlayed: new Set(entries.map((e) => e.matchId)).size,
    roundsPlayed: entries.length,
    roundsCompleted: complete.length,
    incompleteRounds: entries.length - complete.length,
    fairwaysPlayed,
    totalStrokes,
    avgStrokes: fairwaysPlayed ? (totalStrokes / fairwaysPlayed) * FAIRWAY_COUNT : null,
    bestRound: best,
    worstRound: worst,
    fairwayAverages: fairwaySums.map((s, i) => (fairwayCounts[i] ? s / fairwayCounts[i] : null)),
  }
}

const byNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1) // safe with Infinity

/** Full statistics for one player within a date range. */
export function playerStats(data, playerId, range = null) {
  const entries = collectEntries(matchesInRange(data.matches, range)).filter((e) => e.playerId === playerId)
  return { ...summarise(entries), history: entries }
}

/**
 * Statistics for every player, ranked by average strokes (lower is better).
 * Players need at least the minimum number of rounds played (rounds in
 * progress count) to be ranked; the rest are listed unranked.
 */
export function allPlayerStats(data, range = null, { includeInactive = true } = {}) {
  const entries = collectEntries(matchesInRange(data.matches, range))
  const byPlayer = new Map()
  for (const e of entries) {
    if (!byPlayer.has(e.playerId)) byPlayer.set(e.playerId, [])
    byPlayer.get(e.playerId).push(e)
  }
  const minRounds = Math.max(1, data.settings?.minRoundsForRanking || 1)
  const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))

  const rows = data.players
    .filter((p) => includeInactive || p.active)
    .map((p) => ({
      player: p,
      group: groupsById[p.groupId] || null,
      ...summarise(byPlayer.get(p.id) || []),
    }))

  const isRanked = (r) => r.fairwaysPlayed > 0 && r.roundsPlayed >= minRounds
  const ranked = rows
    .filter(isRanked)
    .sort(
      (a, b) =>
        byNumber(a.avgStrokes, b.avgStrokes) ||
        b.fairwaysPlayed - a.fairwaysPlayed ||
        byNumber(a.bestRound?.total ?? Infinity, b.bestRound?.total ?? Infinity) ||
        a.player.name.localeCompare(b.player.name),
    )
  let prev = null
  ranked.forEach((r, i) => {
    const same = prev && Math.abs(prev.avgStrokes - r.avgStrokes) < 1e-9 && prev.fairwaysPlayed === r.fairwaysPlayed
    r.rank = same ? prev.rank : i + 1
    prev = r
  })
  const unranked = rows
    .filter((r) => !isRanked(r))
    .map((r) => ({ ...r, rank: null }))
    .sort((a, b) => a.player.name.localeCompare(b.player.name))
  return [...ranked, ...unranked]
}

/** Statistics for one group: stroke figures from every session, plus its match log. */
export function groupStats(data, groupId, range = null) {
  const matches = matchesInRange(data.matches, range)
  const entries = collectEntries(matches).filter((e) => e.groupId === groupId)
  const summary = summarise(entries)
  const standings = computeStandings(data, range)
  const standing = standings.find((r) => r.groupId === groupId) || null

  const matchLog = sortMatches(matches, 'desc')
    .filter((m) => m.groupIds.includes(groupId))
    .map((m) => {
      const outcome = computeOutcome(m, data.settings)
      return {
        match: m,
        outcome,
        result: outcome.results[groupId] || null,
        metrics: outcome.metrics[groupId],
      }
    })

  const members = data.players.filter((p) => p.groupId === groupId)
  const memberIds = new Set(members.map((p) => p.id))
  const playerRows = allPlayerStats(data, range).filter((r) => memberIds.has(r.player.id))

  return {
    ...summary,
    playerRounds: summary.roundsCompleted,
    members,
    activeMembers: members.filter((p) => p.active).length,
    standing,
    matchLog,
    playerRows,
  }
}

/** Headline numbers for the whole team. */
export function teamSummary(data, range = null) {
  const matches = matchesInRange(data.matches, range)
  const entries = collectEntries(matches)
  const summary = summarise(entries)
  return {
    ...summary,
    totalPlayers: data.players.length,
    activePlayers: data.players.filter((p) => p.active).length,
    totalGroups: data.groups.length,
    totalSessions: matches.length,
    competitiveMatches: matches.filter((m) => m.type === 'match').length,
    practiceSessions: matches.filter((m) => m.type === 'practice').length,
    playerRounds: summary.roundsCompleted,
  }
}

/**
 * Average strokes per round (per fairway × 12), per group, per session date,
 * from every fairway entered — the data behind the "performance over time" chart.
 */
export function groupTrend(data, range = null) {
  const entries = collectEntries(matchesInRange(data.matches, range))
  const byDate = new Map()
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, {})
    const day = byDate.get(e.date)
    if (!day[e.groupId]) day[e.groupId] = { strokes: 0, fairways: 0 }
    for (const v of e.fairways) {
      if (v == null) continue
      day[e.groupId].strokes += v
      day[e.groupId].fairways += 1
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groups]) => {
      const row = { date }
      for (const [gid, { strokes, fairways }] of Object.entries(groups)) {
        if (fairways) row[gid] = round1((strokes / fairways) * FAIRWAY_COUNT)
      }
      return row
    })
}

export function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10
}

export function formatAvg(n) {
  return n == null ? '—' : n.toFixed(1)
}

/** Which match number this is on its date (1, 2, …), for same-day matches. */
export function sameDayIndex(matches, match) {
  const sameDay = sortMatches(matches.filter((m) => m.date === match.date))
  return { index: sameDay.findIndex((m) => m.id === match.id) + 1, count: sameDay.length }
}
