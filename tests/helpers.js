import { createSeedData } from '../src/data/seed.js'
import * as A from '../src/state/actions.js'

export const clone = (v) => JSON.parse(JSON.stringify(v))

/** Fills 12 fairways with the same stroke value (or a provided list). */
export const fw = (v) => (Array.isArray(v) ? v : Array(12).fill(v))

/** Seed data plus one decided match between two groups. */
export function seedWithMatch({ date = '2026-03-02', a = 3, b = 4, type = 'match', groups = ['grp-a', 'grp-b'] } = {}) {
  const data = createSeedData('2026-01-01T00:00:00.000Z')
  const pa = data.players.find((p) => p.groupId === groups[0])
  const pb = data.players.find((p) => p.groupId === groups[1])
  const id = A.createMatch(data, {
    date,
    type,
    groupIds: groups,
    participants: [
      { playerId: pa.id, groupId: groups[0] },
      { playerId: pb.id, groupId: groups[1] },
    ],
  })
  const m = data.matches.find((x) => x.id === id)
  A.setPlayerRound(data, id, m.rounds[0].id, pa.id, fw(a))
  A.setPlayerRound(data, id, m.rounds[0].id, pb.id, fw(b))
  return { data, matchId: id, pa, pb }
}

export function addMatch(data, { date, groups, values, type = 'match' }) {
  // values: { groupId: strokesPerFairway } — uses the first player of each group
  const participants = groups.map((g) => ({ playerId: data.players.find((p) => p.groupId === g).id, groupId: g }))
  const id = A.createMatch(data, { date, type, groupIds: groups, participants })
  const m = data.matches.find((x) => x.id === id)
  for (const p of participants) A.setPlayerRound(data, id, m.rounds[0].id, p.playerId, fw(values[p.groupId]))
  return id
}
