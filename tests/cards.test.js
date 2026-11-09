import { describe, it, expect } from 'vitest'
import { seedCards, syncCards, describeCards, cardsText, cardNumberOf, upcomingCardMatches } from '../src/lib/cards.js'
import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'
import { validateDataset, normalizeDataset } from '../src/services/storage.js'
import { createBackup, parseBackupText } from '../src/services/backup.js'

// Small deterministic random number generator so failures can be replayed.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lineupOf = (data, groupIds = ['grp-a', 'grp-b', 'grp-c']) =>
  data.players.filter((p) => groupIds.includes(p.groupId)).map((p) => ({ playerId: p.id, groupId: p.groupId }))

/** Per card: the sorted counts of players per group, e.g. "2,1,1". */
function shapes(cards, lineup) {
  const groupOf = new Map(lineup.map((p) => [p.playerId, p.groupId]))
  return cards.map((card) => {
    const counts = {}
    for (const pid of card) counts[groupOf.get(pid)] = (counts[groupOf.get(pid)] || 0) + 1
    return Object.values(counts)
      .sort((a, b) => b - a)
      .join(',')
  })
}

function expectEveryoneOnce(cards, lineup) {
  const all = cards.flat()
  expect(all).toHaveLength(lineup.length)
  expect(new Set(all)).toEqual(new Set(lineup.map((p) => p.playerId)))
}

describe('seeding playing cards', () => {
  it('seeds the full squad (17 + 13 + 15) into cards of 2 + 1 + 1, with 3-player cards for the remainder', () => {
    const lineup = lineupOf(createSeedData())
    expect(lineup).toHaveLength(45)
    for (let seed = 1; seed <= 100; seed++) {
      const cards = seedCards(lineup, { rng: rng(seed) })
      expectEveryoneOnce(cards, lineup)
      expect(cards.map((c) => c.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3])
      const s = shapes(cards, lineup)
      expect(s.slice(0, 9).every((x) => x === '2,1,1')).toBe(true)
      expect(s.slice(9).every((x) => x === '1,1,1')).toBe(true)
    }
  })

  it('follows the 2 + 1 + 1 rule for any line-up where every group can fill each card', () => {
    const data = createSeedData()
    const r = rng(42)
    for (let trial = 0; trial < 300; trial++) {
      // Random attendance: drop some players from each group.
      const lineup = lineupOf(data).filter(() => r() > 0.3)
      const cardCount = Math.ceil(lineup.length / 4)
      const sizes = ['grp-a', 'grp-b', 'grp-c'].map((g) => lineup.filter((p) => p.groupId === g).length)
      if (sizes.some((n) => n < cardCount)) continue // a small group cannot reach every card
      const cards = seedCards(lineup, { rng: r })
      expectEveryoneOnce(cards, lineup)
      for (const [i, shape] of shapes(cards, lineup).entries()) {
        expect(shape).toBe(cards[i].length === 4 ? '2,1,1' : '1,1,1')
      }
    }
  })

  it('pairs two groups 2 + 2 and handles small or lopsided line-ups', () => {
    const data = createSeedData()
    const two = lineupOf(data, ['grp-a', 'grp-c']).filter((p, i, list) => list.filter((q) => q.groupId === p.groupId).indexOf(p) < 8)
    expect(shapes(seedCards(two, { rng: rng(3) }), two).every((x) => x === '2,2')).toBe(true)

    for (const n of [1, 2, 3, 5, 6, 7]) {
      const lineup = lineupOf(data).slice(0, n)
      const cards = seedCards(lineup, { rng: rng(n) })
      expectEveryoneOnce(cards, lineup)
      expect(Math.max(...cards.map((c) => c.length))).toBeLessThanOrEqual(4)
      expect(Math.max(...cards.map((c) => c.length)) - Math.min(...cards.map((c) => c.length))).toBeLessThanOrEqual(1)
    }
    expect(seedCards([])).toEqual([])

    // 12 from one group, 2 each from the others: the few are spread over different cards.
    const lopsided = [
      ...lineupOf(data, ['grp-a']).slice(0, 12),
      ...lineupOf(data, ['grp-b']).slice(0, 2),
      ...lineupOf(data, ['grp-c']).slice(0, 2),
    ]
    const cards = seedCards(lopsided, { rng: rng(9) })
    expectEveryoneOnce(cards, lopsided)
    expect(shapes(cards, lopsided).every((x) => x === '3,1')).toBe(true)
  })

  it('is random: a reshuffle gives different cards', () => {
    const lineup = lineupOf(createSeedData())
    const a = JSON.stringify(seedCards(lineup, { rng: rng(1) }))
    const b = JSON.stringify(seedCards(lineup, { rng: rng(2) }))
    expect(a).not.toBe(b)
    expect(JSON.stringify(seedCards(lineup, { rng: rng(1) }))).toBe(a)
  })
})

describe('keeping cards in step with the line-up', () => {
  const g = (playerId, groupId) => ({ playerId, groupId })

  it('removes players who left, drops empty cards and places newcomers sensibly', () => {
    const lineup = [g('a1', 'A'), g('a2', 'A'), g('b1', 'B'), g('c1', 'C'), g('a3', 'A'), g('b2', 'B'), g('c2', 'C')]
    const cards = [
      ['a1', 'a2', 'b1', 'c1'],
      ['a3', 'b2', 'c2'],
      ['gone'],
    ]
    // a newcomer joins the card that still has room
    const next = syncCards(cards, [...lineup, g('b3', 'B')])
    expect(next).toEqual([
      ['a1', 'a2', 'b1', 'c1'],
      ['a3', 'b2', 'c2', 'b3'],
    ])
    // when every card is full, a new card is started
    expect(syncCards(next, [...lineup, g('b3', 'B'), g('c3', 'C')]).at(-1)).toEqual(['c3'])
    // the card with the fewest players from the newcomer's group wins
    const pick = syncCards(
      [
        ['a1', 'a2', 'b1'],
        ['b2', 'c1', 'c2'],
      ],
      [g('a1', 'A'), g('a2', 'A'), g('b1', 'B'), g('b2', 'B'), g('c1', 'C'), g('c2', 'C'), g('a3', 'A')],
    )
    expect(pick[1]).toContain('a3')
    // a player listed twice keeps only the first place
    expect(syncCards([['a1'], ['a1', 'b1']], [g('a1', 'A'), g('b1', 'B')])).toEqual([['a1'], ['b1']])
  })
})

describe('cards on a match', () => {
  function setup() {
    const data = createSeedData('2026-01-01T00:00:00.000Z')
    const lineup = lineupOf(data)
    const cards = seedCards(lineup, { rng: rng(5) })
    const id = A.createMatch(data, { date: '2026-11-14', groupIds: ['grp-a', 'grp-b', 'grp-c'], participants: lineup, cards })
    return { data, lineup, cards, match: data.matches.find((m) => m.id === id) }
  }

  it('saves the seeded cards with the match', () => {
    const { data, cards, match } = setup()
    expect(match.cards.map((c) => c.playerIds)).toEqual(cards)
    expect(validateDataset(data)).toEqual([])
    expect(cardNumberOf(match, cards[2][0])).toBe(3)
    expect(cardNumberOf(match, 'nobody')).toBeNull()
  })

  it('matches without cards stay without cards', () => {
    const data = createSeedData()
    const id = A.createMatch(data, { date: '2026-11-14', groupIds: ['grp-a', 'grp-b'], participants: lineupOf(data, ['grp-a', 'grp-b']) })
    expect(data.matches.find((m) => m.id === id).cards).toEqual([])
    expect(validateDataset(data)).toEqual([])
  })

  it('cleans cards: only line-up players, everyone placed once', () => {
    const data = createSeedData()
    const lineup = lineupOf(data, ['grp-a', 'grp-b']).slice(0, 6)
    const ids = lineup.map((p) => p.playerId)
    const outsider = data.players.find((p) => p.groupId === 'grp-c').id
    const id = A.createMatch(data, {
      date: '2026-11-14',
      groupIds: ['grp-a', 'grp-b'],
      participants: lineup,
      cards: [{ playerIds: [ids[0], ids[1], outsider] }, [ids[1], ids[2]], []],
    })
    const m = data.matches.find((x) => x.id === id)
    expect(m.cards.flatMap((c) => c.playerIds).sort()).toEqual([...ids].sort())
    expect(m.cards[0].playerIds.slice(0, 2)).toEqual([ids[0], ids[1]])
    expect(() => A.createMatch(data, { date: '2026-11-14', groupIds: ['grp-a', 'grp-b'], participants: lineup, cards: 'nope' })).toThrow(/Invalid playing cards/)
  })

  it('follows line-up changes and player deletion without reshuffling everyone', () => {
    const { data, match } = setup()
    const leaving = match.cards[0].playerIds[0]
    const before = match.cards.slice(1).map((c) => c.playerIds)
    A.updateMatch(data, match.id, { participants: match.participants.filter((p) => p.playerId !== leaving) })
    expect(match.cards[0].playerIds).not.toContain(leaving)
    expect(match.cards.slice(1).map((c) => c.playerIds)).toEqual(before)
    expect(validateDataset(data)).toEqual([])

    // a coach's own arrangement replaces the cards
    A.updateMatch(data, match.id, { cards: [match.participants.map((p) => p.playerId)] })
    expect(match.cards).toHaveLength(1)

    // deleting a player takes them off their card; an emptied card disappears
    const solo = match.participants[0].playerId
    A.updateMatch(data, match.id, { cards: [[solo], match.participants.slice(1).map((p) => p.playerId)] })
    A.deletePlayer(data, solo)
    expect(match.cards).toHaveLength(1)
    expect(validateDataset(data)).toEqual([])
  })

  it('rejects cards that point at the wrong players', () => {
    const { data, match } = setup()
    const p = match.cards[0].playerIds[0]
    match.cards[1].playerIds.push(p)
    expect(validateDataset(data).some((e) => /two playing cards/.test(e))).toBe(true)
    match.cards[1].playerIds.pop()
    match.cards[1].playerIds.push('ply-zzz')
    expect(validateDataset(data).some((e) => /not in the line-up/.test(e))).toBe(true)
    match.cards[1].playerIds.pop()
    match.cards.push({ playerIds: [] })
    expect(validateDataset(data).some((e) => /empty or invalid playing card/.test(e))).toBe(true)
  })

  it('cards travel with backups and the published results file', async () => {
    const { data, cards, match } = setup()
    const backup = await createBackup(data, { includeImages: false })
    const parsed = parseBackupText(JSON.stringify(backup))
    expect(parsed.data.matches.find((m) => m.id === match.id).cards.map((c) => c.playerIds)).toEqual(cards)
  })

  it('older saved matches get an empty card list', () => {
    const { data, match } = setup()
    delete match.cards
    const n = normalizeDataset(data)
    expect(n.matches[0].cards).toEqual([])
    expect(validateDataset(n)).toEqual([])
  })
})

describe('showing cards', () => {
  it('lists players by group then name, as text for sharing, and finds upcoming matches', () => {
    const data = createSeedData()
    const byId = Object.fromEntries(data.players.map((p) => [p.id, p]))
    const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))
    const lineup = lineupOf(data).slice(0, 3).concat(lineupOf(data, ['grp-b']).slice(0, 1), lineupOf(data, ['grp-c']).slice(0, 1))
    const [a1, a2, a3] = lineup
    const b1 = lineup[3]
    const c1 = lineup[4]
    const match = {
      title: '',
      groupIds: ['grp-c', 'grp-a', 'grp-b'],
      participants: lineup,
      cards: [{ playerIds: [b1.playerId, a2.playerId, c1.playerId, a1.playerId] }],
    }
    const { cards, unplaced } = describeCards(match, byId)
    expect(cards[0].players.map((e) => e.groupId)).toEqual(['grp-c', 'grp-a', 'grp-a', 'grp-b'])
    expect(unplaced.map((e) => e.playerId)).toEqual([a3.playerId])

    const text = cardsText(match, { playersById: byId, groupsById, dateLabel: 'Sat 14 Nov 2026' })
    expect(text.split('\n')[0]).toBe('Group C vs Group A vs Group B — Sat 14 Nov 2026')
    expect(text).toMatch(new RegExp(`^Card 1: ${byId[c1.playerId].name} \\(Group C\\), `, 'm'))
    expect(text).toMatch(/^Not on a card yet: /m)

    const m = (id, date, createdAt, cards = [{ playerIds: ['x'] }]) => ({ id, date, createdAt, cards })
    const list = [m('old', '2026-11-01', '1'), m('late', '2026-11-20', '1'), m('second', '2026-11-14', '2'), m('first', '2026-11-14', '1'), m('none', '2026-11-15', '1', [])]
    expect(upcomingCardMatches(list, '2026-11-10').map((x) => x.id)).toEqual(['first', 'second', 'late'])
  })
})
