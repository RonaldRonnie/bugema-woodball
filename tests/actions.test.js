import { describe, it, expect } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'
import { validateDataset } from '../src/services/storage.js'
import { seedWithMatch, fw } from './helpers.js'

describe('player management', () => {
  it('registers a player with a unique ID and validates the result', () => {
    const data = createSeedData()
    const id = A.addPlayer(data, { name: '  New Recruit ', groupId: 'grp-b', role: 'Captain' })
    const p = data.players.find((x) => x.id === id)
    expect(p).toMatchObject({ name: 'New Recruit', groupId: 'grp-b', active: true, role: 'Captain' })
    expect(data.players.filter((x) => x.id === id)).toHaveLength(1)
    expect(validateDataset(data)).toEqual([])
  })

  it('rejects blank and duplicate names', () => {
    const data = createSeedData()
    expect(() => A.addPlayer(data, { name: '   ' })).toThrow(/required/)
    expect(() => A.addPlayer(data, { name: 'nanyondo jane' })).toThrow(/already exists/)
  })

  it('edits, deactivates and reassigns players', () => {
    const data = createSeedData()
    const p = data.players[0]
    A.updatePlayer(data, p.id, { name: 'NANYONDO JANE M.', active: false })
    expect(data.players[0]).toMatchObject({ name: 'NANYONDO JANE M.', active: false })
    A.assignPlayers(data, [data.players[0].id, data.players[1].id], 'grp-c')
    expect(data.players.slice(0, 2).every((x) => x.groupId === 'grp-c')).toBe(true)
    expect(() => A.assignPlayers(data, [p.id], 'grp-zzz')).toThrow(/not found/)
  })

  it('deleting a player also removes their scores, keeping data valid', () => {
    const { data, matchId, pa } = seedWithMatch()
    expect(A.countPlayerScores(data, pa.id)).toBe(1)
    A.deletePlayer(data, pa.id)
    const m = data.matches.find((x) => x.id === matchId)
    expect(m.participants.some((x) => x.playerId === pa.id)).toBe(false)
    expect(m.rounds[0].scores[pa.id]).toBeUndefined()
    expect(validateDataset(data)).toEqual([])
  })
})

describe('group management', () => {
  it('adds a group with the next unused palette colour', () => {
    const data = createSeedData()
    const id = A.addGroup(data, { name: 'Group D' })
    expect(data.groups.find((g) => g.id === id).color).toBe('#eda100')
  })

  it('refuses to delete a group that still has players or matches', () => {
    const data = createSeedData()
    expect(() => A.deleteGroup(data, 'grp-a')).toThrow(/Move or remove/)
    const id = A.addGroup(data, { name: 'Temp' })
    A.deleteGroup(data, id)
    expect(data.groups.some((g) => g.id === id)).toBe(false)
  })
})

describe('match and score recording', () => {
  it('requires two groups for a competitive match but allows single-group practice', () => {
    const data = createSeedData()
    expect(() => A.createMatch(data, { date: '2026-01-01', type: 'match', groupIds: ['grp-a'] })).toThrow(/two groups/)
    expect(() => A.createMatch(data, { date: '2026-01-01', type: 'practice', groupIds: ['grp-a'] })).not.toThrow()
  })

  it('supports several matches and rounds on the same day', () => {
    const data = createSeedData()
    const m1 = A.createMatch(data, { date: '2026-06-01', type: 'match', groupIds: ['grp-a', 'grp-b'] })
    const m2 = A.createMatch(data, { date: '2026-06-01', type: 'match', groupIds: ['grp-b', 'grp-c'] })
    A.addRound(data, m1)
    A.addRound(data, m1)
    expect(data.matches.filter((m) => m.date === '2026-06-01')).toHaveLength(2)
    expect(data.matches.find((m) => m.id === m1).rounds.map((r) => r.number)).toEqual([1, 2, 3])
    expect(m1).not.toBe(m2)
    expect(validateDataset(data)).toEqual([])
  })

  it('accepts fairway scores within the configured limit only', () => {
    const { data, matchId, pa } = seedWithMatch()
    const rid = data.matches.find((m) => m.id === matchId).rounds[0].id
    expect(() => A.setFairwayScore(data, matchId, rid, pa.id, 0, 0)).toThrow(/whole numbers/)
    expect(() => A.setFairwayScore(data, matchId, rid, pa.id, 0, 16)).toThrow(/1 to 15/)
    expect(() => A.setFairwayScore(data, matchId, rid, pa.id, 0, 2.5)).toThrow()
    expect(() => A.setFairwayScore(data, matchId, rid, pa.id, 12, 3)).toThrow(/Invalid fairway/)
    A.setFairwayScore(data, matchId, rid, pa.id, 11, 7)
    expect(data.matches[0].rounds[0].scores[pa.id][11]).toBe(7)
  })

  it('removing a player from the line-up removes their scores', () => {
    const { data, matchId, pa, pb } = seedWithMatch()
    A.updateMatch(data, matchId, { participants: [{ playerId: pb.id, groupId: 'grp-b' }] })
    const m = data.matches.find((x) => x.id === matchId)
    expect(m.rounds[0].scores[pa.id]).toBeUndefined()
    expect(m.rounds[0].scores[pb.id]).toEqual(fw(4))
  })

  it('protects round numbering and the last round', () => {
    const { data, matchId } = seedWithMatch()
    const m = data.matches.find((x) => x.id === matchId)
    expect(() => A.deleteRound(data, matchId, m.rounds[0].id)).toThrow(/at least one round/)
    const r2 = A.addRound(data, matchId)
    expect(() => A.setRoundNumber(data, matchId, r2, 1)).toThrow(/already exists/)
    A.setRoundNumber(data, matchId, r2, 5)
    A.deleteRound(data, matchId, m.rounds[0].id)
    expect(m.rounds.map((r) => r.number)).toEqual([5])
  })
})

describe('settings', () => {
  it('validates tie-breaker lists and limits', () => {
    const data = createSeedData()
    expect(() => A.updateSettings(data, { tieBreakers: [{ key: 'wins', enabled: true }] })).toThrow()
    expect(() => A.updateSettings(data, { maxStrokesPerFairway: 2 })).toThrow()
    A.updateSettings(data, { minRoundsForRanking: 3, outcomeMetric: 'total' })
    expect(data.settings).toMatchObject({ minRoundsForRanking: 3, outcomeMetric: 'total' })
  })
})
