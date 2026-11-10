import { describe, it, expect, vi } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'
import {
  newScorecard,
  saveScorecard,
  loadScorecard,
  listScorecards,
  removeScorecard,
  scorecardKey,
  withStroke,
  fairwayDone,
  missingScores,
  hasAnyScore,
  sendState,
  markSent,
} from '../src/lib/scorecards.js'

function setup() {
  const data = createSeedData('2026-01-01T00:00:00.000Z')
  const groupIds = ['grp-a', 'grp-b']
  const participants = data.players.filter((p) => groupIds.includes(p.groupId)).slice(0, 8).map((p) => ({ playerId: p.id, groupId: p.groupId }))
  const id = A.createMatch(data, { date: '2026-11-14', type: 'match', groupIds, participants, cards: [participants.slice(0, 4).map((p) => p.playerId)] })
  const match = data.matches.find((m) => m.id === id)
  const playersById = Object.fromEntries(data.players.map((p) => [p.id, p]))
  const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))
  const playerIds = match.cards[0].playerIds
  const sc = newScorecard({ match, round: match.rounds[0], cardNumber: 1, playerIds, playersById, groupsById, scorer: { id: null, name: '  Coach Sam ' }, now: '2026-11-14T08:00:00.000Z' })
  return { data, match, sc, playerIds, playersById, groupsById }
}

describe('scorecards on a phone', () => {
  it('starts empty and carries everything needed to finish offline', () => {
    const { match, sc, playerIds, playersById, groupsById } = setup()
    expect(sc.key).toBe(scorecardKey(match.id, match.rounds[0].id, 1))
    expect(sc.matchTitle).toBe(`${groupsById['grp-a'].name} vs ${groupsById['grp-b'].name}`)
    expect(sc.matchDate).toBe('2026-11-14')
    expect(sc.roundNumber).toBe(1)
    expect(sc.scorer).toEqual({ id: null, name: 'Coach Sam' })
    expect(sc.players.map((p) => p.name)).toEqual(playerIds.map((id) => playersById[id].name))
    expect(sc.players[0]).toMatchObject({ groupName: expect.any(String), color: expect.any(String) })
    for (const id of playerIds) expect(sc.scores[id]).toEqual(Array(12).fill(null))
    expect(hasAnyScore(sc)).toBe(false)
    expect(missingScores(sc)).toHaveLength(48)
    expect(sendState(sc)).toBe('unsent')
  })

  it('saves, lists, reloads and deletes', () => {
    const { sc, match } = setup()
    expect(saveScorecard(sc)).toBe(true)
    localStorage.setItem('bu-woodball:scorecard:junk', '{not json')
    localStorage.setItem('bu-woodball:scorecard:other', JSON.stringify({ v: 2 }))
    localStorage.setItem('bu-woodball:dataset', '{}')
    expect(loadScorecard(sc.key)).toEqual(sc)
    expect(listScorecards().map((s) => s.key)).toEqual([sc.key])
    expect(listScorecards(match.id)).toHaveLength(1)
    expect(listScorecards('another-match')).toHaveLength(0)
    removeScorecard(sc.key)
    expect(loadScorecard(sc.key)).toBeNull()
  })

  it('reports when the phone cannot store the card', () => {
    const { sc } = setup()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveScorecard(sc)).toBe(false)
    spy.mockRestore()
  })

  it('records strokes fairway by fairway without changing earlier copies', () => {
    const { sc, playerIds } = setup()
    let next = sc
    for (const id of playerIds) next = withStroke(next, id, 0, 4, '2026-11-14T08:10:00.000Z')
    expect(sc.scores[playerIds[0]][0]).toBeNull()
    expect(fairwayDone(next, 0)).toBe(true)
    expect(fairwayDone(next, 1)).toBe(false)
    expect(next.updatedAt).toBe('2026-11-14T08:10:00.000Z')
    expect(missingScores(next)).toHaveLength(44)
    expect(missingScores(next)[0]).toMatchObject({ index: 1, player: { id: playerIds[0] } })
    expect(hasAnyScore(next)).toBe(true)
  })

  it('knows whether the coach has the latest scores', () => {
    const { sc, playerIds } = setup()
    const filled = withStroke(sc, playerIds[0], 0, 3)
    const sent = markSent(filled, { id: 'card-1', at: '2026-11-14T10:00:00.000Z' })
    expect(sendState(sent)).toBe('sent')
    expect(sent.sent).toMatchObject({ id: 'card-1', at: '2026-11-14T10:00:00.000Z' })
    const changed = withStroke(sent, playerIds[0], 0, 5)
    expect(sendState(changed)).toBe('changed')
    expect(sendState(withStroke(changed, playerIds[0], 0, 3))).toBe('sent')
  })
})
