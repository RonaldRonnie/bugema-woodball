import { describe, it, expect } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'
import { computeOutcome, computeStandings, lineupProgress, closeBlocker } from '../src/lib/scoring.js'
import { upcomingCardMatches } from '../src/lib/cards.js'
import { reviewCard } from '../src/lib/inbox.js'
import { validateDataset, normalizeDataset } from '../src/services/storage.js'
import { createBackup, parseBackupText } from '../src/services/backup.js'
import { fw } from './helpers.js'

const short7 = [4, 4, 4, 4, 4, 4, 4, null, null, null, null, null]

/**
 * Groups A, B and C: A1 finishes (3 a fairway), A2 does not turn up,
 * B1 stops after 7 fairways (4 a fairway), C1 finishes (5 a fairway).
 */
function setup({ type = 'match', settings = {} } = {}) {
  const data = createSeedData('2026-01-01T00:00:00.000Z')
  Object.assign(data.settings, settings)
  const pick = (g, n) => data.players.filter((p) => p.groupId === g).slice(0, n)
  const [a1, a2] = pick('grp-a', 2)
  const [b1] = pick('grp-b', 1)
  const [c1] = pick('grp-c', 1)
  const participants = [a1, a2, b1, c1].map((p) => ({ playerId: p.id, groupId: p.groupId }))
  const id = A.createMatch(data, { date: '2026-11-14', type, groupIds: ['grp-a', 'grp-b', 'grp-c'], participants, cards: [participants.map((p) => p.playerId)] })
  const match = () => data.matches.find((m) => m.id === id)
  const roundId = match().rounds[0].id
  A.setPlayerRound(data, id, roundId, a1.id, fw(3))
  A.setPlayerRound(data, id, roundId, b1.id, short7)
  A.setPlayerRound(data, id, roundId, c1.id, fw(5))
  return { data, id, match, roundId, a1, a2, b1, c1 }
}

describe('closing a match with missing scores', () => {
  it('turns a live result into a final one, even with live results switched off', () => {
    const { data, id, match } = setup()
    expect(computeOutcome(match(), data.settings).status).toBe('live')
    expect(computeOutcome(match(), { ...data.settings, liveResults: false })).toMatchObject({ status: 'pending', waitingForCompletion: true })

    A.closeMatch(data, id)
    expect(match().closedAt).toEqual(expect.any(String))
    expect(validateDataset(data)).toEqual([])
    for (const settings of [data.settings, { ...data.settings, liveResults: false }]) {
      const o = computeOutcome(match(), settings)
      expect(o.status).toBe('decided')
      expect(o.results).toEqual({ 'grp-a': 'W', 'grp-b': 'L', 'grp-c': 'L' })
    }
    // The 7 fairways B1 played still count, the absent A2 adds nothing.
    expect(computeOutcome(match(), data.settings).metrics['grp-b']).toMatchObject({ fairways: 7, totalStrokes: 28 })
    expect(computeOutcome(match(), data.settings).metrics['grp-a']).toMatchObject({ fairways: 12, playerRounds: 1 })
  })

  it('makes the standings count it as final', () => {
    const { data, id } = setup()
    const rowA = () => computeStandings(data).find((r) => r.groupId === 'grp-a')
    expect(rowA()).toMatchObject({ won: 1, points: 3, live: 1 })
    A.closeMatch(data, id)
    expect(rowA()).toMatchObject({ won: 1, points: 3, live: 0 })
  })

  it('lists who did not play and who stopped early', () => {
    const { match, a2, b1 } = setup()
    expect(lineupProgress(match())).toEqual({ absent: [a2.id], short: [{ playerId: b1.id, roundNumber: 1, fairways: 7 }], complete: 2 })
  })

  it('refuses to close a match that has no result yet', () => {
    const { data, id, roundId, c1 } = setup()
    A.clearPlayerRound(data, id, roundId, c1.id) // Group C has no scores now
    const name = (gid) => data.groups.find((g) => g.id === gid).name
    expect(closeBlocker(data.matches[0], data.settings, name)).toMatch(new RegExp(`^${name('grp-c')} has no scores`))
    expect(() => A.closeMatch(data, id)).toThrow(/has no scores/)
    expect(data.matches[0].closedAt).toBeNull()

    // A manual result that is not set yet also blocks closing…
    A.updateMatch(data, id, { outcomeMode: 'manual', manualResults: { 'grp-a': 'W' } })
    expect(() => A.closeMatch(data, id)).toThrow(/Set the result for every group/)
    // …and a complete manual result allows it.
    A.updateMatch(data, id, { manualResults: { 'grp-a': 'W', 'grp-b': 'L', 'grp-c': 'L' } })
    A.closeMatch(data, id)
    expect(data.matches[0].closedAt).toEqual(expect.any(String))
  })

  it('closes practice sessions without a result', () => {
    const { data, id, match } = setup({ type: 'practice' })
    expect(closeBlocker(match(), data.settings)).toBe('')
    A.closeMatch(data, id)
    expect(computeOutcome(match(), data.settings).status).toBe('practice')
  })

  it('locks scores, rounds and the line-up until reopened', () => {
    const { data, id, match, roundId, a2, b1 } = setup()
    A.closeMatch(data, id)
    const locked = /closed/
    expect(() => A.setFairwayScore(data, id, roundId, b1.id, 8, 4)).toThrow(locked)
    expect(() => A.setPlayerRound(data, id, roundId, a2.id, fw(3))).toThrow(locked)
    expect(() => A.clearPlayerRound(data, id, roundId, b1.id)).toThrow(locked)
    expect(() => A.addRound(data, id)).toThrow(locked)
    expect(() => A.setRoundNumber(data, id, roundId, 2)).toThrow(locked)
    expect(() => A.acceptCardScores(data, { matchId: id, roundId, players: [{ playerId: a2.id, fairways: fw(3) }] })).toThrow(locked)
    expect(() => A.updateMatch(data, id, { participants: match().participants.filter((p) => p.playerId !== a2.id) })).toThrow(/line-up/)
    expect(() => A.updateMatch(data, id, { groupIds: ['grp-a', 'grp-b'] })).toThrow(/line-up/)
    // Details can still change, and the same line-up in another order is not a change.
    A.updateMatch(data, id, { title: 'League week 3', venue: 'Main course', participants: [...match().participants].reverse() })
    expect(match()).toMatchObject({ title: 'League week 3', venue: 'Main course' })
    expect(match().closedAt).toEqual(expect.any(String))

    A.reopenMatch(data, id)
    expect(match().closedAt).toBeNull()
    A.setFairwayScore(data, id, roundId, b1.id, 7, 4)
    expect(computeOutcome(match(), data.settings).status).toBe('live')
    expect(validateDataset(data)).toEqual([])
  })

  it('takes the match off "playing cards are out" and refuses phone cards for it', () => {
    const { data, id, match, roundId, a2 } = setup()
    expect(upcomingCardMatches(data.matches, '2026-11-14')).toHaveLength(1)
    A.closeMatch(data, id)
    expect(upcomingCardMatches(data.matches, '2026-11-14')).toHaveLength(0)

    const card = { id: 'card-x', submittedAt: '2026-11-14T12:00:00Z', match: { id, title: 'M', date: '2026-11-14' }, round: { id: roundId, number: 1 }, card: 1, scorer: 'S', players: [{ id: a2.id, name: 'A2', group: 'A', fairways: fw(3) }] }
    const r = reviewCard(card, data)
    expect(r.state).toBe('problem')
    expect(r.problem).toMatch(/closed/)
    expect(r.usable).toEqual([])
    A.reopenMatch(data, id)
    expect(reviewCard(card, data).state).toBe('ready')
    expect(match().closedAt).toBeNull()
  })

  it('keeps the closing time through saving, backups and older data', async () => {
    const { data, id } = setup()
    A.closeMatch(data, id)
    const back = parseBackupText(JSON.stringify(await createBackup(data, { includeImages: false })))
    expect(back.data.matches[0].closedAt).toBe(data.matches[0].closedAt)

    const old = JSON.parse(JSON.stringify(data))
    delete old.matches[0].closedAt
    expect(normalizeDataset(old).matches[0].closedAt).toBeNull()

    const bad = JSON.parse(JSON.stringify(data))
    bad.matches[0].closedAt = 'yesterday-ish'
    expect(validateDataset(bad).join(' ')).toMatch(/invalid closing time/)
  })
})

describe('closing a round', () => {
  it('stops its unfinished scorecards keeping the match live', () => {
    const { data, id, match, roundId } = setup()
    expect(computeOutcome(match(), data.settings).status).toBe('live')
    A.closeRound(data, id, roundId)
    expect(match().rounds[0].closedAt).toEqual(expect.any(String))
    expect(match().closedAt).toBeNull()
    expect(validateDataset(data)).toEqual([])
    const o = computeOutcome(match(), { ...data.settings, liveResults: false })
    expect(o.status).toBe('decided')
    expect(o.results).toEqual({ 'grp-a': 'W', 'grp-b': 'L', 'grp-c': 'L' })
    expect(computeStandings(data).find((r) => r.groupId === 'grp-a')).toMatchObject({ points: 3, live: 0 })
  })

  it('keeps the match live while another round is still being played', () => {
    const { data, id, match, roundId, b1 } = setup()
    A.closeRound(data, id, roundId)
    const r2 = A.addRound(data, id)
    expect(match().rounds.find((r) => r.id === r2).closedAt).toBeNull()
    A.setPlayerRound(data, id, r2, b1.id, short7)
    expect(computeOutcome(match(), data.settings).status).toBe('live')
    A.closeRound(data, id, r2)
    expect(computeOutcome(match(), data.settings).status).toBe('decided')
  })

  it('lists who did not play in that round only', () => {
    const { data, id, match, roundId, a1, b1, c1 } = setup()
    const r2 = A.addRound(data, id)
    A.setPlayerRound(data, id, r2, a1.id, fw(3))
    const progress = lineupProgress(match(), r2)
    expect(progress.absent.sort()).toEqual(match().participants.map((p) => p.playerId).filter((pid) => pid !== a1.id).sort())
    expect(progress.short).toEqual([])
    expect(lineupProgress(match(), roundId).short).toEqual([{ playerId: b1.id, roundNumber: 1, fairways: 7 }])
    expect(lineupProgress(match(), roundId).absent).not.toContain(c1.id)
  })

  it('locks only that round, until it is reopened', () => {
    const { data, id, match, roundId, a2, b1 } = setup()
    const r2 = A.addRound(data, id)
    A.closeRound(data, id, roundId)
    const locked = /Round 1 is closed/
    expect(() => A.setFairwayScore(data, id, roundId, b1.id, 8, 4)).toThrow(locked)
    expect(() => A.setPlayerRound(data, id, roundId, a2.id, fw(3))).toThrow(locked)
    expect(() => A.clearPlayerRound(data, id, roundId, b1.id)).toThrow(locked)
    expect(() => A.setRoundNumber(data, id, roundId, 5)).toThrow(locked)
    expect(() => A.deleteRound(data, id, roundId)).toThrow(locked)
    expect(() => A.acceptCardScores(data, { matchId: id, roundId, players: [{ playerId: a2.id, fairways: fw(3) }] })).toThrow(locked)
    // Round 2 is still open.
    A.setPlayerRound(data, id, r2, a2.id, fw(3))
    // Taking a player with scores in the closed round out of the line-up would delete them.
    expect(() => A.updateMatch(data, id, { participants: match().participants.filter((p) => p.playerId !== b1.id) })).toThrow(/closed round 1/)
    // A player with no scores in the closed round can still leave.
    const withoutA2 = match().participants.filter((p) => p.playerId !== a2.id)
    A.clearPlayerRound(data, id, r2, a2.id)
    A.updateMatch(data, id, { participants: withoutA2 })
    expect(match().participants).toHaveLength(3)

    A.reopenRound(data, id, roundId)
    A.setFairwayScore(data, id, roundId, b1.id, 7, 4)
    expect(match().rounds.find((r) => r.id === roundId).scores[b1.id][7]).toBe(4)
  })

  it('needs a score in the round, and an open match', () => {
    const { data, id, roundId } = setup()
    const r2 = A.addRound(data, id)
    expect(() => A.closeRound(data, id, r2)).toThrow(/Round 2 has no scores yet/)
    A.closeMatch(data, id)
    expect(() => A.closeRound(data, id, roundId)).toThrow(/match is closed/)
    expect(() => A.reopenRound(data, id, roundId)).toThrow(/match is closed/)
  })

  it('refuses phone cards for it and keeps the closing time in backups', async () => {
    const { data, id, roundId, a2 } = setup()
    A.closeRound(data, id, roundId)
    const card = { id: 'card-r', submittedAt: '2026-11-14T12:00:00Z', match: { id, title: 'M', date: '2026-11-14' }, round: { id: roundId, number: 1 }, card: 1, scorer: 'S', players: [{ id: a2.id, name: 'A2', group: 'A', fairways: fw(3) }] }
    expect(reviewCard(card, data)).toMatchObject({ state: 'problem', usable: [] })
    expect(reviewCard(card, data).problem).toMatch(/Round 1 is closed/)

    const back = parseBackupText(JSON.stringify(await createBackup(data, { includeImages: false })))
    expect(back.data.matches[0].rounds[0].closedAt).toBe(data.matches[0].rounds[0].closedAt)
    const old = JSON.parse(JSON.stringify(data))
    delete old.matches[0].rounds[0].closedAt
    expect(normalizeDataset(old).matches[0].rounds[0].closedAt).toBeNull()
    const bad = JSON.parse(JSON.stringify(data))
    bad.matches[0].rounds[0].closedAt = 42
    expect(validateDataset(bad).join(' ')).toMatch(/round with an invalid closing time/)
  })
})
