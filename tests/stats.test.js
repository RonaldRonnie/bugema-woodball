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

  it('excludes incomplete rounds from averages but reports them', () => {
    const { data, p2 } = twoRoundMatch()
    const s = playerStats(data, p2.id)
    expect(s.roundsCompleted).toBe(1)
    expect(s.incompleteRounds).toBe(1)
    expect(s.avgStrokes).toBe(36)
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
    expect(groupStats(data, 'grp-a').roundsCompleted).toBe(3) // p1 ×2 + p2 ×1
    expect(groupStats(data, 'grp-c').roundsCompleted).toBe(0)
  })
})

describe('group and team statistics', () => {
  it('derives group performance from player scores', () => {
    const { data } = twoRoundMatch()
    const g = groupStats(data, 'grp-a')
    expect(g.totalStrokes).toBe(36 + 48 + 36)
    expect(g.avgStrokes).toBe(40)
    expect(g.standing.points).toBe(3)
    expect(g.matchLog[0].result).toBe('W')
  })

  it('summarises the whole team', () => {
    const { data } = twoRoundMatch()
    const t = teamSummary(data)
    expect(t.totalPlayers).toBe(45)
    expect(t.totalSessions).toBe(1)
    expect(t.playerRounds).toBe(4)
    expect(groupTrend(data)).toEqual([{ date: '2026-05-04', 'grp-a': 40, 'grp-b': 60 }])
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
