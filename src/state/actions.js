// Pure data operations. Each function mutates a *draft copy* of the dataset;
// DataContext.commit() validates the draft and only then saves it, so a
// failed operation never leaves half-written data behind.

import { newId } from '../lib/ids.js'
import { nextGroupColor, isPaletteColor } from '../lib/colors.js'
import { isValidISODate } from '../lib/dates.js'
import { FAIRWAY_COUNT, emptyFairways } from '../lib/scoring.js'
import { TIE_BREAKER_OPTIONS } from '../data/defaults.js'
import { MAX_STROKE_VALUE } from '../services/storage.js'

export class ActionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ActionError'
  }
}

const now = () => new Date().toISOString()
const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function find(list, id, label) {
  const item = list.find((x) => x.id === id)
  if (!item) throw new ActionError(`${label} not found. It may have been removed.`)
  return item
}

// ----------------------------------------------------------------- players

function checkPlayerName(draft, name, exceptId) {
  const n = clean(name, 120)
  if (!n) throw new ActionError('Player name is required.')
  const dup = draft.players.find((p) => p.id !== exceptId && p.name.trim().toLowerCase() === n.toLowerCase())
  if (dup) throw new ActionError(`A player named "${dup.name}" already exists.`)
  return n
}

function checkGroupId(draft, groupId) {
  if (groupId == null || groupId === '') return null
  find(draft.groups, groupId, 'Group')
  return groupId
}

export function addPlayer(draft, input) {
  const t = now()
  const player = {
    id: newId('ply'),
    name: checkPlayerName(draft, input.name),
    groupId: checkGroupId(draft, input.groupId),
    active: input.active ?? true,
    role: clean(input.role, 60),
    studentNo: clean(input.studentNo, 40),
    notes: clean(input.notes, 1000),
    photoId: input.photoId || null,
    createdAt: t,
    updatedAt: t,
  }
  draft.players.push(player)
  return player.id
}

export function updatePlayer(draft, id, patch) {
  const p = find(draft.players, id, 'Player')
  if ('name' in patch) p.name = checkPlayerName(draft, patch.name, id)
  if ('groupId' in patch) p.groupId = checkGroupId(draft, patch.groupId)
  if ('active' in patch) p.active = Boolean(patch.active)
  if ('role' in patch) p.role = clean(patch.role, 60)
  if ('studentNo' in patch) p.studentNo = clean(patch.studentNo, 40)
  if ('notes' in patch) p.notes = clean(patch.notes, 1000)
  if ('photoId' in patch) p.photoId = patch.photoId || null
  p.updatedAt = now()
  return id
}

/** How many score entries a player has (used before deleting). */
export function countPlayerScores(data, playerId) {
  let n = 0
  for (const m of data.matches) for (const r of m.rounds) if (r.scores[playerId]) n++
  return n
}

/** Permanently removes a player and every score they have. Returns their photo ID. */
export function deletePlayer(draft, id) {
  const p = find(draft.players, id, 'Player')
  draft.players = draft.players.filter((x) => x.id !== id)
  for (const m of draft.matches) {
    m.participants = m.participants.filter((x) => x.playerId !== id)
    for (const r of m.rounds) delete r.scores[id]
  }
  return p.photoId
}

// ------------------------------------------------------------------ groups

function checkGroupName(draft, name, exceptId) {
  const n = clean(name, 60)
  if (!n) throw new ActionError('Group name is required.')
  if (draft.groups.some((g) => g.id !== exceptId && g.name.trim().toLowerCase() === n.toLowerCase())) {
    throw new ActionError(`A group named "${n}" already exists.`)
  }
  return n
}

export function addGroup(draft, input) {
  const t = now()
  const group = {
    id: newId('grp'),
    name: checkGroupName(draft, input.name),
    color: isPaletteColor(input.color) ? input.color : nextGroupColor(draft.groups),
    description: clean(input.description, 500),
    photoId: null,
    createdAt: t,
    updatedAt: t,
  }
  draft.groups.push(group)
  return group.id
}

export function updateGroup(draft, id, patch) {
  const g = find(draft.groups, id, 'Group')
  if ('name' in patch) g.name = checkGroupName(draft, patch.name, id)
  if ('color' in patch && isPaletteColor(patch.color)) g.color = patch.color
  if ('description' in patch) g.description = clean(patch.description, 500)
  if ('photoId' in patch) g.photoId = patch.photoId || null
  g.updatedAt = now()
  return id
}

export function deleteGroup(draft, id) {
  const g = find(draft.groups, id, 'Group')
  const members = draft.players.filter((p) => p.groupId === id).length
  if (members) throw new ActionError(`Move or remove the ${members} player(s) in ${g.name} before deleting it.`)
  const matches = draft.matches.filter((m) => m.groupIds.includes(id)).length
  if (matches) throw new ActionError(`${g.name} has ${matches} recorded match(es). Delete those first, or keep the group.`)
  draft.groups = draft.groups.filter((x) => x.id !== id)
  return g.photoId
}

/** Moves several players to a group in one step. */
export function assignPlayers(draft, playerIds, groupId) {
  const gid = checkGroupId(draft, groupId)
  const t = now()
  for (const pid of playerIds) {
    const p = find(draft.players, pid, 'Player')
    p.groupId = gid
    p.updatedAt = t
  }
}

// ----------------------------------------------------------------- matches

function normaliseMatchInput(draft, input, existing = null) {
  const date = input.date ?? existing?.date
  if (!isValidISODate(date)) throw new ActionError('Please choose a valid match date.')
  const type = input.type ?? existing?.type ?? 'match'
  if (type !== 'match' && type !== 'practice') throw new ActionError('Invalid session type.')

  const groupIds = [...new Set(input.groupIds ?? existing?.groupIds ?? [])]
  if (!groupIds.length) throw new ActionError('Select at least one participating group.')
  for (const gid of groupIds) find(draft.groups, gid, 'Group')
  if (type === 'match' && groupIds.length < 2) {
    throw new ActionError('A competitive match needs at least two groups. Choose "Practice" for a single-group session.')
  }

  const participants = []
  const seen = new Set()
  for (const p of input.participants ?? existing?.participants ?? []) {
    if (seen.has(p.playerId)) continue
    find(draft.players, p.playerId, 'Player')
    if (!groupIds.includes(p.groupId)) continue // group was removed from the match
    seen.add(p.playerId)
    participants.push({ playerId: p.playerId, groupId: p.groupId })
  }

  const outcomeMode = input.outcomeMode ?? existing?.outcomeMode ?? 'auto'
  if (outcomeMode !== 'auto' && outcomeMode !== 'manual') throw new ActionError('Invalid outcome mode.')
  const manualResults = {}
  for (const [gid, r] of Object.entries(input.manualResults ?? existing?.manualResults ?? {})) {
    if (groupIds.includes(gid) && ['W', 'D', 'L'].includes(r)) manualResults[gid] = r
  }

  return {
    date,
    type,
    groupIds,
    participants,
    outcomeMode,
    manualResults,
    title: clean(input.title ?? existing?.title, 120),
    venue: clean(input.venue ?? existing?.venue, 120),
    notes: clean(input.notes ?? existing?.notes, 2000),
  }
}

export function createMatch(draft, input) {
  const t = now()
  const fields = normaliseMatchInput(draft, input)
  const match = {
    id: newId('mat'),
    ...fields,
    rounds: [{ id: newId('rnd'), number: 1, scores: {} }],
    createdAt: t,
    updatedAt: t,
  }
  draft.matches.push(match)
  return match.id
}

export function updateMatch(draft, id, patch) {
  const m = find(draft.matches, id, 'Match')
  const fields = normaliseMatchInput(draft, patch, m)
  const keep = new Set(fields.participants.map((p) => p.playerId))
  Object.assign(m, fields)
  // Scores of players removed from the line-up go with them.
  for (const r of m.rounds) {
    for (const pid of Object.keys(r.scores)) if (!keep.has(pid)) delete r.scores[pid]
  }
  m.updatedAt = now()
  return id
}

export function deleteMatch(draft, id) {
  find(draft.matches, id, 'Match')
  draft.matches = draft.matches.filter((m) => m.id !== id)
}

/** Scores that would be lost if these players left the match line-up. */
export function countScoresForPlayers(match, playerIds) {
  const ids = new Set(playerIds)
  let n = 0
  for (const r of match.rounds) for (const pid of Object.keys(r.scores)) if (ids.has(pid)) n++
  return n
}

// ------------------------------------------------------------------ rounds

export function addRound(draft, matchId) {
  const m = find(draft.matches, matchId, 'Match')
  const number = m.rounds.reduce((max, r) => Math.max(max, r.number), 0) + 1
  const round = { id: newId('rnd'), number, scores: {} }
  m.rounds.push(round)
  m.updatedAt = now()
  return round.id
}

export function setRoundNumber(draft, matchId, roundId, number) {
  const m = find(draft.matches, matchId, 'Match')
  const r = find(m.rounds, roundId, 'Round')
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new ActionError('Round number must be a whole number from 1 to 99.')
  if (m.rounds.some((x) => x.id !== roundId && x.number === n)) throw new ActionError(`Round ${n} already exists in this match.`)
  r.number = n
  m.updatedAt = now()
}

export function deleteRound(draft, matchId, roundId) {
  const m = find(draft.matches, matchId, 'Match')
  find(m.rounds, roundId, 'Round')
  if (m.rounds.length === 1) throw new ActionError('A match needs at least one round. Delete the match instead.')
  m.rounds = m.rounds.filter((r) => r.id !== roundId)
  m.updatedAt = now()
}

function checkStroke(value, max) {
  if (value === null || value === '' || value === undefined) return null
  const n = Number(value)
  const limit = Math.min(max || MAX_STROKE_VALUE, MAX_STROKE_VALUE)
  if (!Number.isInteger(n) || n < 1 || n > limit) {
    throw new ActionError(`Fairway scores must be whole numbers from 1 to ${limit}.`)
  }
  return n
}

function scoringContext(draft, matchId, roundId, playerId) {
  const m = find(draft.matches, matchId, 'Match')
  const r = find(m.rounds, roundId, 'Round')
  if (!m.participants.some((p) => p.playerId === playerId)) {
    throw new ActionError('This player is not in the match line-up.')
  }
  return { m, r }
}

/** Sets one fairway score (index 0–11). `null` clears it. */
export function setFairwayScore(draft, matchId, roundId, playerId, index, value) {
  const { m, r } = scoringContext(draft, matchId, roundId, playerId)
  if (!Number.isInteger(index) || index < 0 || index >= FAIRWAY_COUNT) throw new ActionError('Invalid fairway.')
  const v = checkStroke(value, draft.settings.maxStrokesPerFairway)
  const fairways = r.scores[playerId] ? [...r.scores[playerId]] : emptyFairways()
  fairways[index] = v
  if (fairways.every((x) => x === null)) delete r.scores[playerId]
  else r.scores[playerId] = fairways
  m.updatedAt = now()
}

/** Replaces all 12 fairway scores for a player in a round. */
export function setPlayerRound(draft, matchId, roundId, playerId, values) {
  const { m, r } = scoringContext(draft, matchId, roundId, playerId)
  if (!Array.isArray(values) || values.length !== FAIRWAY_COUNT) throw new ActionError(`Enter exactly ${FAIRWAY_COUNT} fairway scores.`)
  const fairways = values.map((v) => checkStroke(v, draft.settings.maxStrokesPerFairway))
  if (fairways.every((x) => x === null)) delete r.scores[playerId]
  else r.scores[playerId] = fairways
  m.updatedAt = now()
}

export function clearPlayerRound(draft, matchId, roundId, playerId) {
  const { m, r } = scoringContext(draft, matchId, roundId, playerId)
  delete r.scores[playerId]
  m.updatedAt = now()
}

// ---------------------------------------------------------------- settings

export function updateSettings(draft, patch) {
  const s = draft.settings
  if ('teamName' in patch) {
    const n = clean(patch.teamName, 100)
    if (!n) throw new ActionError('Team name is required.')
    s.teamName = n
  }
  if ('shortName' in patch) s.shortName = clean(patch.shortName, 30) || s.shortName
  if ('tagline' in patch) s.tagline = clean(patch.tagline, 140)
  if ('logoImageId' in patch) s.logoImageId = patch.logoImageId || null
  if ('outcomeMetric' in patch) {
    if (!['average', 'total'].includes(patch.outcomeMetric)) throw new ActionError('Invalid outcome rule.')
    s.outcomeMetric = patch.outcomeMetric
  }
  if ('liveResults' in patch) s.liveResults = Boolean(patch.liveResults)
  if ('tieBreakers' in patch) {
    const keys = Object.keys(TIE_BREAKER_OPTIONS)
    const list = patch.tieBreakers
    if (!Array.isArray(list) || list.length !== keys.length || !keys.every((k) => list.some((t) => t.key === k))) {
      throw new ActionError('Invalid tie-breaker list.')
    }
    s.tieBreakers = list.map((t) => ({ key: t.key, enabled: Boolean(t.enabled) }))
  }
  if ('minRoundsForRanking' in patch) {
    const n = Number(patch.minRoundsForRanking)
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new ActionError('Minimum rounds must be between 1 and 50.')
    s.minRoundsForRanking = n
  }
  if ('maxStrokesPerFairway' in patch) {
    const n = Number(patch.maxStrokesPerFairway)
    if (!Number.isInteger(n) || n < 5 || n > MAX_STROKE_VALUE) {
      throw new ActionError(`Maximum strokes per fairway must be between 5 and ${MAX_STROKE_VALUE}.`)
    }
    s.maxStrokesPerFairway = n
  }
}

// ------------------------------------------------------------- team photos

export function addTeamPhoto(draft, { imageId, caption }) {
  if (!imageId) throw new ActionError('Photo is missing.')
  const photo = { id: newId('pho'), imageId, caption: clean(caption, 140), createdAt: now() }
  draft.teamPhotos.push(photo)
  return photo.id
}

export function updateTeamPhoto(draft, id, { caption }) {
  const p = find(draft.teamPhotos, id, 'Photo')
  p.caption = clean(caption, 140)
}

export function moveTeamPhoto(draft, id, delta) {
  const i = draft.teamPhotos.findIndex((p) => p.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= draft.teamPhotos.length) return
  const [p] = draft.teamPhotos.splice(i, 1)
  draft.teamPhotos.splice(j, 0, p)
}

export function removeTeamPhoto(draft, id) {
  const p = find(draft.teamPhotos, id, 'Photo')
  draft.teamPhotos = draft.teamPhotos.filter((x) => x.id !== id)
  return p.imageId
}
