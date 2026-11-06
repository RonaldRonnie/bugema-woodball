import { FAIRWAY_COUNT, POINTS, computeOutcome, computeStandings, collectEntries, hasResult, matchesInRange, sortMatches } from './scoring.js'
import { allPlayerStats, playerStats, groupStats, teamSummary } from './stats.js'

const FAIRWAY_HEADERS = Array.from({ length: FAIRWAY_COUNT }, (_, i) => `F${i + 1}`)
const fmt = (n, digits = 2) => (n == null ? '' : Number(n.toFixed(digits)))

/**
 * Escapes one CSV cell. Text starting with = + - @ is prefixed with an
 * apostrophe so spreadsheet programs never run it as a formula.
 */
export function escapeCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV(rows) {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

function rangeLine(range) {
  return ['Period', range?.label || 'All time']
}

function names(data) {
  return {
    player: Object.fromEntries(data.players.map((p) => [p.id, p.name])),
    group: Object.fromEntries(data.groups.map((g) => [g.id, g.name])),
  }
}

/** One player's round-by-round history with all 12 fairway scores. */
export function playerHistoryCSV(data, playerId, range) {
  const player = data.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not found.')
  const n = names(data)
  const s = playerStats(data, playerId, range)
  const rows = [
    ['Player', player.name],
    ['Group', n.group[player.groupId] || 'Unassigned'],
    rangeLine(range),
    ['Matches played', s.matchesPlayed],
    ['Rounds completed', s.roundsCompleted],
    ['Rounds in progress', s.incompleteRounds],
    ['Fairways played', s.fairwaysPlayed],
    ['Total strokes', s.totalStrokes],
    ['Average strokes per round (per fairway x 12)', fmt(s.avgStrokes)],
    ['Best round', s.bestRound ? s.bestRound.total : ''],
    [],
    ['Date', 'Match', 'Type', 'Round', 'Played for', ...FAIRWAY_HEADERS, 'Total strokes', 'Complete'],
    ...s.history.map((e) => [
      e.date,
      e.matchTitle,
      e.matchType,
      e.roundNumber,
      n.group[e.groupId] || '',
      ...e.fairways.map((v) => v ?? ''),
      e.total,
      e.complete ? 'Yes' : 'No',
    ]),
  ]
  return toCSV(rows)
}

/** Every player's summary, ranked by average strokes. */
export function playerSummaryCSV(data, range) {
  const rows = allPlayerStats(data, range)
  return toCSV([
    rangeLine(range),
    [],
    [
      'Rank',
      'Player',
      'Group',
      'Status',
      'Matches played',
      'Rounds completed',
      'Fairways played',
      'Total strokes',
      'Average strokes per round',
      'Best round',
      ...FAIRWAY_HEADERS.map((f) => `Avg ${f}`),
    ],
    ...rows.map((r) => [
      r.rank ?? '',
      r.player.name,
      r.group?.name || 'Unassigned',
      r.player.active ? 'Active' : 'Inactive',
      r.matchesPlayed,
      r.roundsCompleted,
      r.fairwaysPlayed,
      r.totalStrokes,
      fmt(r.avgStrokes),
      r.bestRound?.total ?? '',
      ...r.fairwayAverages.map((v) => fmt(v)),
    ]),
  ])
}

/** Leaderboard plus stroke figures and match log for every group. */
export function groupPerformanceCSV(data, range) {
  const standings = computeStandings(data, range)
  const rows = [
    rangeLine(range),
    [],
    [
      'Rank',
      'Group',
      'Played',
      'Won',
      'Drawn',
      'Lost',
      'Points',
      'Completed rounds (all sessions)',
      'Fairways played (all sessions)',
      'Total strokes (all sessions)',
      'Average strokes per round (all sessions)',
      'Best round',
      'Active players',
    ],
  ]
  for (const s of standings) {
    const g = groupStats(data, s.groupId, range)
    rows.push([
      s.rank,
      s.name,
      s.played,
      s.won,
      s.drawn,
      s.lost,
      s.points,
      g.roundsCompleted,
      g.fairwaysPlayed,
      g.totalStrokes,
      fmt(g.avgStrokes),
      g.bestRound?.total ?? '',
      g.activeMembers,
    ])
  }
  rows.push([], ['Match log'], ['Date', 'Match', 'Group', 'Result', 'Points', 'Fairways', 'Total strokes', 'Average strokes per round'])
  const n = names(data)
  for (const m of sortMatches(matchesInRange(data.matches, range))) {
    if (m.type !== 'match') continue
    const o = computeOutcome(m, data.settings)
    for (const gid of m.groupIds) {
      const r = o.results[gid]
      rows.push([
        m.date,
        m.title,
        n.group[gid] || '',
        hasResult(o) ? (o.status === 'live' ? `${r} (live)` : r) : 'Pending',
        hasResult(o) ? POINTS[r] : '',
        o.metrics[gid]?.fairways ?? 0,
        o.metrics[gid]?.totalStrokes ?? 0,
        fmt(o.metrics[gid]?.avgStrokes),
      ])
    }
  }
  return toCSV(rows)
}

/** Whole-team overview: standings, then every player's summary. */
export function teamPerformanceCSV(data, range) {
  const standings = computeStandings(data, range)
  const players = allPlayerStats(data, range)
  const t = teamSummary(data, range)
  return toCSV([
    ['Team', data.settings.teamName],
    rangeLine(range),
    ['Players', data.players.length],
    ['Sessions recorded', matchesInRange(data.matches, range).length],
    ['Completed player rounds', t.roundsCompleted],
    ['Player rounds in progress', t.incompleteRounds],
    ['Fairways played', t.fairwaysPlayed],
    ['Team average strokes per round', fmt(t.avgStrokes)],
    [],
    ['Group standings'],
    ['Rank', 'Group', 'Played', 'Won', 'Drawn', 'Lost', 'Points', 'Live matches', 'Average strokes per round (matches)'],
    ...standings.map((s) => [s.rank, s.name, s.played, s.won, s.drawn, s.lost, s.points, s.live, fmt(s.avgStrokes)]),
    [],
    ['Player rankings'],
    ['Rank', 'Player', 'Group', 'Matches played', 'Rounds completed', 'Fairways played', 'Total strokes', 'Average strokes per round', 'Best round'],
    ...players.map((r) => [
      r.rank ?? '',
      r.player.name,
      r.group?.name || 'Unassigned',
      r.matchesPlayed,
      r.roundsCompleted,
      r.fairwaysPlayed,
      r.totalStrokes,
      fmt(r.avgStrokes),
      r.bestRound?.total ?? '',
    ]),
  ])
}

/** Every recorded score row, with match details and outcome. */
export function matchHistoryCSV(data, range) {
  const n = names(data)
  const rows = [
    rangeLine(range),
    [],
    [
      'Date',
      'Match',
      'Type',
      'Groups',
      'Outcome',
      'Venue',
      'Notes',
      'Round',
      'Player',
      'Played for',
      ...FAIRWAY_HEADERS,
      'Total strokes',
      'Complete',
    ],
  ]
  for (const m of sortMatches(matchesInRange(data.matches, range))) {
    const o = computeOutcome(m, data.settings)
    const outcome =
      o.status === 'practice'
        ? 'Practice'
        : o.status === 'pending'
          ? 'Pending'
          : `${o.status === 'live' ? 'Live: ' : ''}${m.groupIds.map((g) => `${n.group[g]}: ${o.results[g]}`).join('; ')}`
    const head = [m.date, m.title, m.type, m.groupIds.map((g) => n.group[g]).join(' vs '), outcome, m.venue, m.notes]
    const entries = collectEntries([m])
    if (!entries.length) rows.push([...head, '', '', '', ...Array(FAIRWAY_COUNT).fill(''), '', ''])
    for (const e of entries) {
      rows.push([
        ...head,
        e.roundNumber,
        n.player[e.playerId] || '',
        n.group[e.groupId] || '',
        ...e.fairways.map((v) => v ?? ''),
        e.total,
        e.complete ? 'Yes' : 'No',
      ])
    }
  }
  return toCSV(rows)
}
