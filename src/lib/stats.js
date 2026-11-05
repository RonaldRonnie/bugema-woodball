import {
  FAIRWAY_COUNT,
  collectEntries,
  computeOutcome,
  computeStandings,
  matchesInRange,
  sortMatches,
} from './scoring.js'

/** Summary numbers for a set of completed player-round entries. */
function summarise(entries) {
  const complete = entries.filter((e) => e.complete)
  const totalStrokes = complete.reduce((s, e) => s + e.total, 0)
  let best = null
  let worst = null
  for (const e of complete) {
    if (!best || e.total < best.total) best = e
    if (!worst || e.total > worst.total) worst = e
  }
  const fairwaySums = Array(FAIRWAY_COUNT).fill(0)
  for (const e of complete) e.fairways.forEach((v, i) => (fairwaySums[i] += v))
  return {
    matchesPlayed: new Set(entries.map((e) => e.matchId)).size,
    roundsCompleted: complete.length,
    incompleteRounds: entries.length - complete.length,
    totalStrokes,
    avgStrokes: complete.length ? totalStrokes / complete.length : null,
    bestRound: best,
    worstRound: worst,
    fairwayAverages: fairwaySums.map((s) => (complete.length ? s / complete.length : null)),
  }
}

/** Full statistics for one player within a date range. */
export function playerStats(data, playerId, range = null) {
  const entries = collectEntries(matchesInRange(data.matches, range)).filter((e) => e.playerId === playerId)
  return { ...summarise(entries), history: entries }
}

/**
 * Statistics for every player, ranked by average strokes (lower is better).
 * Players below the minimum number of completed rounds are left unranked.
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

  const ranked = rows
    .filter((r) => r.roundsCompleted >= minRounds)
    .sort(
      (a, b) =>
        a.avgStrokes - b.avgStrokes ||
        b.roundsCompleted - a.roundsCompleted ||
        a.bestRound.total - b.bestRound.total ||
        a.player.name.localeCompare(b.player.name),
    )
  let prev = null
  ranked.forEach((r, i) => {
    const same = prev && Math.abs(prev.avgStrokes - r.avgStrokes) < 1e-9 && prev.roundsCompleted === r.roundsCompleted
    r.rank = same ? prev.rank : i + 1
    prev = r
  })
  const unranked = rows
    .filter((r) => r.roundsCompleted < minRounds)
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
 * Average strokes per completed player round, per group, per session date —
 * the data behind the "performance over time" chart.
 */
export function groupTrend(data, range = null) {
  const entries = collectEntries(matchesInRange(data.matches, range)).filter((e) => e.complete)
  const byDate = new Map()
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, {})
    const day = byDate.get(e.date)
    if (!day[e.groupId]) day[e.groupId] = { sum: 0, n: 0 }
    day[e.groupId].sum += e.total
    day[e.groupId].n += 1
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groups]) => {
      const row = { date }
      for (const [gid, { sum, n }] of Object.entries(groups)) row[gid] = round1(sum / n)
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
