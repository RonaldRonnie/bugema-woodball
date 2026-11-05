import { describe, it, expect } from 'vitest'
import { createSeedData, SEED_ROSTER } from '../src/data/seed.js'
import { roundTotal, isRoundComplete, computeOutcome, computeStandings, collectEntries } from '../src/lib/scoring.js'
import * as A from '../src/state/actions.js'
import { seedWithMatch, addMatch, fw } from './helpers.js'

describe('seed roster', () => {
  it('creates groups A, B and C with every supplied name preserved', () => {
    const data = createSeedData()
    expect(data.groups.map((g) => g.name)).toEqual(['Group A', 'Group B', 'Group C'])
    expect(data.players).toHaveLength(17 + 13 + 15)
    const byGroup = (id) => data.players.filter((p) => p.groupId === id).map((p) => p.name)
    expect(byGroup('grp-a')).toEqual(SEED_ROSTER.A)
    expect(byGroup('grp-b')).toEqual(SEED_ROSTER.B)
    expect(byGroup('grp-c')).toEqual(SEED_ROSTER.C)
    expect(byGroup('grp-a')).toContain('MARK WA PARVIN')
    expect(byGroup('grp-b')).toContain('Ssempijja Keneddy')
  })

  it('gives every player a unique internal ID', () => {
    const data = createSeedData()
    expect(new Set(data.players.map((p) => p.id)).size).toBe(data.players.length)
  })
})

describe('stroke calculation', () => {
  it('totals the 12 fairways automatically', () => {
    expect(roundTotal([3, 4, 2, 5, 3, 3, 4, 2, 6, 3, 4, 3])).toBe(42)
  })
  it('ignores empty fairways in a partial total and marks the round incomplete', () => {
    const f = [3, 4, null, null, null, null, null, null, null, null, null, null]
    expect(roundTotal(f)).toBe(7)
    expect(isRoundComplete(f)).toBe(false)
    expect(isRoundComplete(fw(3))).toBe(true)
  })
})

describe('match outcomes and points', () => {
  it('gives the lower-stroke group the win', () => {
    const { data, matchId } = seedWithMatch({ a: 3, b: 4 })
    const o = computeOutcome(data.matches.find((m) => m.id === matchId), data.settings)
    expect(o.status).toBe('decided')
    expect(o.results).toEqual({ 'grp-a': 'W', 'grp-b': 'L' })
  })

  it('records a draw when stroke averages are level', () => {
    const { data, matchId } = seedWithMatch({ a: 4, b: 4 })
    const o = computeOutcome(data.matches.find((m) => m.id === matchId), data.settings)
    expect(o.results).toEqual({ 'grp-a': 'D', 'grp-b': 'D' })
  })

  it('compares averages, so a bigger group is not penalised for more players', () => {
    const data = createSeedData()
    const a = data.players.filter((p) => p.groupId === 'grp-a').slice(0, 3)
    const b = data.players.filter((p) => p.groupId === 'grp-b').slice(0, 1)
    const id = A.createMatch(data, {
      date: '2026-03-01',
      type: 'match',
      groupIds: ['grp-a', 'grp-b'],
      participants: [...a.map((p) => ({ playerId: p.id, groupId: 'grp-a' })), { playerId: b[0].id, groupId: 'grp-b' }],
    })
    const m = data.matches.find((x) => x.id === id)
    for (const p of a) A.setPlayerRound(data, id, m.rounds[0].id, p.id, fw(3)) // 36 each, 108 total
    A.setPlayerRound(data, id, m.rounds[0].id, b[0].id, fw(4)) // 48 total
    expect(computeOutcome(m, data.settings).results['grp-a']).toBe('W')
    expect(computeOutcome(m, { ...data.settings, outcomeMetric: 'total' }).results['grp-a']).toBe('L')
  })

  it('is pending until every group has a completed round', () => {
    const { data, matchId, pb } = seedWithMatch()
    const m = data.matches.find((x) => x.id === matchId)
    A.setFairwayScore(data, matchId, m.rounds[0].id, pb.id, 5, null)
    expect(computeOutcome(m, data.settings).status).toBe('pending')
  })

  it('uses the manual result when the coach sets one', () => {
    const { data, matchId } = seedWithMatch({ a: 3, b: 4 })
    A.updateMatch(data, matchId, { outcomeMode: 'manual', manualResults: { 'grp-a': 'L', 'grp-b': 'W' } })
    const o = computeOutcome(data.matches.find((m) => m.id === matchId), data.settings)
    expect(o.results).toEqual({ 'grp-a': 'L', 'grp-b': 'W' })
  })

  it('awards no points for practice sessions', () => {
    const data = createSeedData()
    addMatch(data, { date: '2026-03-01', groups: ['grp-a'], values: { 'grp-a': 3 }, type: 'practice' })
    const s = computeStandings(data)
    expect(s.every((r) => r.points === 0 && r.played === 0)).toBe(true)
    expect(collectEntries(data.matches)).toHaveLength(1) // still counts for individual stats
  })
})

describe('leaderboard', () => {
  it('awards 3 / 1 / 0 points and ranks by points', () => {
    const data = createSeedData()
    addMatch(data, { date: '2026-03-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 3, 'grp-b': 4 } }) // A W
    addMatch(data, { date: '2026-03-02', groups: ['grp-b', 'grp-c'], values: { 'grp-b': 4, 'grp-c': 4 } }) // draw
    addMatch(data, { date: '2026-03-03', groups: ['grp-a', 'grp-c'], values: { 'grp-a': 5, 'grp-c': 4 } }) // C W
    const s = computeStandings(data)
    const pts = Object.fromEntries(s.map((r) => [r.name, r.points]))
    expect(pts).toEqual({ 'Group A': 3, 'Group B': 1, 'Group C': 4 })
    expect(s.map((r) => r.name)).toEqual(['Group C', 'Group A', 'Group B'])
    expect(s[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0 })
  })

  it('recalculates when a result is edited or deleted', () => {
    const data = createSeedData()
    const id = addMatch(data, { date: '2026-03-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 3, 'grp-b': 4 } })
    expect(computeStandings(data)[0].name).toBe('Group A')

    const m = data.matches.find((x) => x.id === id)
    const pa = m.participants.find((p) => p.groupId === 'grp-a').playerId
    A.setPlayerRound(data, id, m.rounds[0].id, pa, fw(6))
    expect(computeStandings(data)[0].name).toBe('Group B')

    A.deleteMatch(data, id)
    expect(computeStandings(data).every((r) => r.points === 0)).toBe(true)
  })

  it('applies tie-breakers in the configured order', () => {
    const data = createSeedData()
    // A beats B, B beats C, C beats A → all on 3 points, 1 win each.
    addMatch(data, { date: '2026-03-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 3, 'grp-b': 4 } })
    addMatch(data, { date: '2026-03-02', groups: ['grp-b', 'grp-c'], values: { 'grp-b': 3, 'grp-c': 5 } })
    addMatch(data, { date: '2026-03-03', groups: ['grp-c', 'grp-a'], values: { 'grp-c': 2, 'grp-a': 3 } })
    // Average strokes in matches: A (36+36)/2=36, B (48+36)/2=42, C (60+24)/2=42

    data.settings.tieBreakers = [
      { key: 'avgStrokes', enabled: true },
      { key: 'wins', enabled: true },
      { key: 'headToHead', enabled: false },
      { key: 'fewerLosses', enabled: false },
      { key: 'bestRound', enabled: true },
    ]
    let s = computeStandings(data)
    expect(s.map((r) => r.name)).toEqual(['Group A', 'Group C', 'Group B']) // C's best round 24 beats B's 36
    expect(s.map((r) => r.rank)).toEqual([1, 2, 3])

    data.settings.tieBreakers = data.settings.tieBreakers.map((t) => ({ ...t, enabled: false }))
    s = computeStandings(data)
    expect(s.every((r) => r.rank === 1 && r.tied)).toBe(true) // shared rank when nothing separates them
  })

  it('uses head-to-head between tied groups', () => {
    const data = createSeedData()
    addMatch(data, { date: '2026-03-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 4, 'grp-b': 3 } }) // B beats A
    addMatch(data, { date: '2026-03-02', groups: ['grp-a', 'grp-c'], values: { 'grp-a': 3, 'grp-c': 4 } }) // A beats C
    addMatch(data, { date: '2026-03-03', groups: ['grp-b', 'grp-c'], values: { 'grp-b': 4, 'grp-c': 3 } }) // C beats B
    addMatch(data, { date: '2026-03-04', groups: ['grp-a', 'grp-c'], values: { 'grp-a': 3, 'grp-c': 3 } }) // A-C draw
    addMatch(data, { date: '2026-03-05', groups: ['grp-b', 'grp-c'], values: { 'grp-b': 3, 'grp-c': 3 } }) // B-C draw
    // A: W1 D1 L1 = 4, B: W1 D1 L1 = 4, C: W1 D2 L1 = 5
    data.settings.tieBreakers = [
      { key: 'headToHead', enabled: true },
      { key: 'wins', enabled: false },
      { key: 'avgStrokes', enabled: false },
      { key: 'fewerLosses', enabled: false },
      { key: 'bestRound', enabled: false },
    ]
    const s = computeStandings(data)
    expect(s.map((r) => [r.name, r.points])).toEqual([
      ['Group C', 5],
      ['Group B', 4], // B beat A head-to-head
      ['Group A', 4],
    ])
  })

  it('respects the date filter', () => {
    const data = createSeedData()
    addMatch(data, { date: '2026-03-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 3, 'grp-b': 4 } })
    addMatch(data, { date: '2026-04-01', groups: ['grp-a', 'grp-b'], values: { 'grp-a': 5, 'grp-b': 4 } })
    const march = computeStandings(data, { from: '2026-03-01', to: '2026-03-31' })
    expect(march.find((r) => r.name === 'Group A').points).toBe(3)
    expect(computeStandings(data).find((r) => r.name === 'Group A').points).toBe(3)
    expect(computeStandings(data).find((r) => r.name === 'Group B').points).toBe(3)
  })
})
