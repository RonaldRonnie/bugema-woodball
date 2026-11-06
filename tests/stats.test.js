import { describe, it, expect } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import { playerStats, allPlayerStats, groupStats, teamSummary, groupTrend } from '../src/lib/stats.js'
import { resolveRange, inRange } from '../src/lib/dates.js'
import * as A from '../src/state/actions.js'
import { fw } from './helpers.js'

function twoRoundMatch() {
  const data = createSeedData()
  const [p1, p2] = data.players.filter((p) => p.groupId === 'grp-a')
  const q = data.players.find((p) => p.groupId === 'grp-b')
  const id = A.createMatch(data, {
    date: '2026-05-04',
    type: 'match',
    groupIds: ['grp-a', 'grp-b'],
    participants: [
      { playerId: p1.id, groupId: 'grp-a' },
      { playerId: p2.id, groupId: 'grp-a' },
      { playerId: q.id, groupId: 'grp-b' },
    ],
  })
  const r2 = A.addRound(data, id)
  const m = data.matches.find((x) => x.id === id)
  const r1 = m.rounds[0].id
  A.setPlayerRound(data, id, r1, p1.id, [2, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3]) // 36
  A.setPlayerRound(data, id, r2, p1.id, fw(4)) // 48
  A.setPlayerRound(data, id, r1, p2.id, fw(3)) // 36
  A.setFairwayScore(data, id, r2, p2.id, 0, 5) // incomplete round
  A.setPlayerRound(data, id, r1, q.id, fw(5)) // 60
  return { data, id, p1, p2, q }
}

describe('individual statistics', () => {
  it('computes matches, rounds, strokes, average, best round and fairway averages', () => {
    const { data, p1 } = twoRoundMatch()
    const s = playerStats(data, p1.id)
    expect(s.matchesPlayed).toBe(1)
    expect(s.roundsCompleted).toBe(2)
    expect(s.totalStrokes).toBe(84)
    expect(s.avgStrokes).toBe(42)
    expect(s.bestRound.total).toBe(36)
    expect(s.bestRound.roundNumber).toBe(1)
    expect(s.fairwayAverages[0]).toBe(3) // (2 + 4) / 2
    expect(s.history).toHaveLength(2)
  })

  it('counts rounds in progress in averages, per fairway scaled to 12', () => {
    const { data, p2 } = twoRoundMatch()
    const s = playerStats(data, p2.id)
    expect(s.roundsCompleted).toBe(1)
    expect(s.incompleteRounds).toBe(1)
    expect(s.fairwaysPlayed).toBe(13) // 12 + 1
    expect(s.totalStrokes).toBe(41) // 36 + 5
    expect(s.avgStrokes).toBeCloseTo((41 / 13) * 12)
    expect(s.bestRound.total).toBe(36) // best round needs all 12 fairways
    expect(s.fairwayAverages[0]).toBe(4) // (3 + 5) / 2
  })

  it('ranks players who have only part-played a round', () => {
    const data = createSeedData()
    const [a, b] = data.players.filter((p) => p.groupId === 'grp-a')
    const id = A.createMatch(data, {
      date: '2026-05-04',
      type: 'practice',
      groupIds: ['grp-a'],
      participants: [
        { playerId: a.id, groupId: 'grp-a' },
        { playerId: b.id, groupId: 'grp-a' },
      ],
    })
    const r = data.matches[0].rounds[0].id
    for (const [i, v] of [4, 4, 4].entries()) A.setFairwayScore(data, id, r, a.id, i, v)
    for (const [i, v] of [2, 3, 2].entries()) A.setFairwayScore(data, id, r, b.id, i, v)
    const rows = allPlayerStats(data)
    expect(rows[0]).toMatchObject({ rank: 1, fairwaysPlayed: 3, roundsCompleted: 0 })
    expect(rows[0].player.id).toBe(b.id)
    expect(rows[0].avgStrokes).toBeCloseTo(28)
    expect(rows[1].player.id).toBe(a.id)
    expect(rows[0].bestRound).toBeNull()
  })

  it('ranks players by average strokes and leaves non-playing players unranked', () => {
    const { data, p1, p2, q } = twoRoundMatch()
    const rows = allPlayerStats(data)
    expect(rows[0].player.id).toBe(p2.id) // 36 avg
    expect(rows[0].rank).toBe(1)
    expect(rows[1].player.id).toBe(p1.id) // 42 avg
    expect(rows[2].player.id).toBe(q.id) // 60 avg
    expect(rows.slice(3).every((r) => r.rank === null)).toBe(true)
  })

  it('filters statistics by date range', () => {
    const { data, p1 } = twoRoundMatch()
    expect(playerStats(data, p1.id, { from: '2026-06-01', to: '2026-06-30' }).roundsCompleted).toBe(0)
    expect(playerStats(data, p1.id, resolveRange({ preset: 'day', ref: '2026-05-04' })).roundsCompleted).toBe(2)
    expect(playerStats(data, p1.id, resolveRange({ preset: 'week', ref: '2026-05-10' })).roundsCompleted).toBe(2)
    expect(playerStats(data, p1.id, resolveRange({ preset: 'month', ref: '2026-05-31' })).roundsCompleted).toBe(2)
  })

  it('keeps a player’s past scores with the group they played for after a transfer', () => {
    const { data, p1 } = twoRoundMatch()
    A.updatePlayer(data, p1.id, { groupId: 'grp-c' })
    expect(groupStats(data, 'grp-a').roundsCompleted).toBe(3) // p1 ×2 + p2 ×1 (p2's second round is in progress)
    expect(groupStats(data, 'grp-c').roundsCompleted).toBe(0)
  })
})

describe('group and team statistics', () => {
  it('derives group performance from player scores', () => {
    const { data } = twoRoundMatch()
    const g = groupStats(data, 'grp-a')
    expect(g.totalStrokes).toBe(36 + 48 + 36 + 5) // includes the round in progress
    expect(g.fairwaysPlayed).toBe(37)
    expect(g.avgStrokes).toBeCloseTo((125 / 37) * 12)
    expect(g.standing.points).toBe(3)
    expect(g.matchLog[0].result).toBe('W')
  })

  it('summarises the whole team', () => {
    const { data } = twoRoundMatch()
    const t = teamSummary(data)
    expect(t.totalPlayers).toBe(45)
    expect(t.totalSessions).toBe(1)
    expect(t.playerRounds).toBe(4)
    expect(groupTrend(data)).toEqual([{ date: '2026-05-04', 'grp-a': 40.5, 'grp-b': 60 }])
  })
})

describe('date ranges', () => {
  it('builds Monday-to-Sunday weeks and calendar months', () => {
    expect(resolveRange({ preset: 'week', ref: '2026-11-05' })).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(resolveRange({ preset: 'month', ref: '2026-02-10' })).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolveRange({ preset: 'custom', from: '2026-05-10', to: '2026-05-01' })).toMatchObject({
      from: '2026-05-01',
      to: '2026-05-10',
    })
    expect(inRange('2026-05-05', { from: '2026-05-01', to: '2026-05-10' })).toBe(true)
    expect(inRange('2026-05-11', { from: '2026-05-01', to: '2026-05-10' })).toBe(false)
  })
})
