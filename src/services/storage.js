// Centralised LocalStorage persistence. React components never touch
// localStorage directly — they go through this module (via DataContext).

import { SCHEMA_VERSION, DEFAULT_SETTINGS, FAIRWAY_COUNT, TIE_BREAKER_OPTIONS } from '../data/defaults.js'
import { isValidISODate } from '../lib/dates.js'

export const DATA_KEY = 'bu-woodball:data'
export const META_KEY = 'bu-woodball:meta'
const CORRUPT_PREFIX = 'bu-woodball:unreadable:'

export const MAX_STROKE_VALUE = 99

export class StorageError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    if (cause) this.cause = cause
  }
}

function getStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    // Some browsers throw when storage is disabled (e.g. blocked cookies).
    return null
  }
}

export function isStorageAvailable() {
  const store = getStore()
  if (!store) return false
  try {
    const probe = '__bu_woodball_probe__'
    store.setItem(probe, '1')
    store.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function isQuotaError(err) {
  return (
    err &&
    (err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014)
  )
}

// ---------------------------------------------------------------------------
// Migrations: MIGRATIONS[n] upgrades a dataset from version n to n + 1.
// Add an entry here (and bump SCHEMA_VERSION) when the data shape changes.
// ---------------------------------------------------------------------------
const MIGRATIONS = {
  // Example for the future:
  // 1: (data) => ({ ...data, schemaVersion: 2, newField: [] }),
}

export function migrate(input) {
  if (!input || typeof input !== 'object') throw new StorageError('Data is not an object.', { code: 'invalid' })
  let data = input
  let version = Number(data.schemaVersion)
  if (!Number.isInteger(version) || version < 1) {
    throw new StorageError('Data has no recognisable version number.', { code: 'invalid' })
  }
  if (version > SCHEMA_VERSION) {
    throw new StorageError(
      `This data was saved by a newer version of the app (data version ${version}, app supports ${SCHEMA_VERSION}). Update the app before loading it.`,
      { code: 'too-new' },
    )
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new StorageError(`No migration from data version ${version}.`, { code: 'invalid' })
    data = step(data)
    version = data.schemaVersion
  }
  return data
}

/** Fills in optional fields with defaults so older/partial data stays usable. */
export function normalizeDataset(data) {
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
  // Keep tie-breakers to known keys, add any new ones (disabled) at the end.
  const known = Object.keys(TIE_BREAKER_OPTIONS)
  const seen = new Set()
  const tieBreakers = (Array.isArray(settings.tieBreakers) ? settings.tieBreakers : [])
    .filter((t) => t && known.includes(t.key) && !seen.has(t.key) && seen.add(t.key))
    .map((t) => ({ key: t.key, enabled: Boolean(t.enabled) }))
  for (const key of known) if (!seen.has(key)) tieBreakers.push({ key, enabled: false })
  settings.tieBreakers = tieBreakers

  return {
    ...data,
    revision: Number.isInteger(data.revision) ? data.revision : 0,
    settings,
    groups: (data.groups || []).map((g) => ({ description: '', photoId: null, ...g })),
    players: (data.players || []).map((p) => ({
      role: '',
      studentNo: '',
      notes: '',
      photoId: null,
      active: true,
      ...p,
    })),
    matches: (data.matches || []).map((m) => ({
      title: '',
      venue: '',
      notes: '',
      outcomeMode: 'auto',
      manualResults: {},
      ...m,
    })),
    teamPhotos: data.teamPhotos || [],
  }
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * Checks the dataset's structure and that every reference points at a
 * record that exists. Returns a list of problems (empty when valid).
 */
export function validateDataset(data) {
  const errors = []
  const err = (msg) => errors.length < 25 && errors.push(msg)

  if (!data || typeof data !== 'object') return ['Dataset is missing.']
  for (const key of ['groups', 'players', 'matches', 'teamPhotos']) {
    if (!Array.isArray(data[key])) err(`"${key}" must be a list.`)
  }
  if (!data.settings || typeof data.settings !== 'object') err('"settings" is missing.')
  if (errors.length) return errors

  const uniqueIds = (list, label) => {
    const ids = new Set()
    for (const item of list) {
      if (!item || !isNonEmptyString(item.id)) err(`A ${label} has no ID.`)
      else if (ids.has(item.id)) err(`Duplicate ${label} ID "${item.id}".`)
      else ids.add(item.id)
    }
    return ids
  }

  const groupIds = uniqueIds(data.groups, 'group')
  const playerIds = uniqueIds(data.players, 'player')
  uniqueIds(data.matches, 'match')
  uniqueIds(data.teamPhotos, 'team photo')

  for (const g of data.groups) {
    if (!isNonEmptyString(g.name)) err(`Group "${g.id}" has no name.`)
  }
  for (const p of data.players) {
    if (!isNonEmptyString(p.name)) err(`Player "${p.id}" has no name.`)
    else if (p.name.length > 120) err(`Player name "${p.name.slice(0, 30)}…" is too long.`)
    if (p.groupId != null && !groupIds.has(p.groupId)) err(`Player "${p.name}" belongs to a group that does not exist.`)
    if (typeof p.active !== 'boolean') err(`Player "${p.name}" has an invalid status.`)
  }

  for (const m of data.matches) {
    const label = `Match on ${m.date || '?'}`
    if (!isValidISODate(m.date)) err(`${label} has an invalid date.`)
    if (m.type !== 'match' && m.type !== 'practice') err(`${label} has an invalid type.`)
    if (!Array.isArray(m.groupIds) || m.groupIds.length === 0) {
      err(`${label} has no participating groups.`)
      continue
    }
    if (new Set(m.groupIds).size !== m.groupIds.length) err(`${label} lists a group twice.`)
    for (const gid of m.groupIds) if (!groupIds.has(gid)) err(`${label} refers to a missing group.`)
    if (m.type === 'match' && m.groupIds.length < 2) err(`${label} needs at least two groups to be a competitive match.`)
    if (!['auto', 'manual'].includes(m.outcomeMode)) err(`${label} has an invalid outcome mode.`)
    if (m.manualResults && typeof m.manualResults === 'object') {
      for (const [gid, r] of Object.entries(m.manualResults)) {
        if (!['W', 'D', 'L'].includes(r)) err(`${label} has an invalid manual result.`)
        if (!m.groupIds.includes(gid)) err(`${label} has a manual result for a non-participating group.`)
      }
    }

    if (!Array.isArray(m.participants)) {
      err(`${label} has no participant list.`)
      continue
    }
    const participantIds = new Set()
    for (const p of m.participants) {
      if (!playerIds.has(p.playerId)) err(`${label} refers to a missing player.`)
      if (participantIds.has(p.playerId)) err(`${label} lists a player twice.`)
      participantIds.add(p.playerId)
      if (!m.groupIds.includes(p.groupId)) err(`${label} has a player in a group that is not playing.`)
    }

    if (!Array.isArray(m.rounds) || m.rounds.length === 0) {
      err(`${label} has no rounds.`)
      continue
    }
    const roundNumbers = new Set()
    const roundIds = new Set()
    for (const r of m.rounds) {
      if (!isNonEmptyString(r.id) || roundIds.has(r.id)) err(`${label} has a round with a missing or duplicate ID.`)
      roundIds.add(r.id)
      if (!Number.isInteger(r.number) || r.number < 1) err(`${label} has an invalid round number.`)
      else if (roundNumbers.has(r.number)) err(`${label} has two rounds numbered ${r.number}.`)
      roundNumbers.add(r.number)
      if (!r.scores || typeof r.scores !== 'object') {
        err(`${label}, round ${r.number} has no scores object.`)
        continue
      }
      for (const [pid, fairways] of Object.entries(r.scores)) {
        if (!participantIds.has(pid)) err(`${label}, round ${r.number} has scores for a non-participant.`)
        if (!Array.isArray(fairways) || fairways.length !== FAIRWAY_COUNT) {
          err(`${label}, round ${r.number} must have exactly ${FAIRWAY_COUNT} fairway scores per player.`)
          continue
        }
        for (const v of fairways) {
          if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= MAX_STROKE_VALUE)) {
            err(`${label}, round ${r.number} has an invalid fairway score (${JSON.stringify(v)}).`)
            break
          }
        }
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/**
 * Reads the saved dataset.
 * Returns { data, warning }. `data` is null when nothing usable is stored.
 * Unreadable data is never silently discarded: a copy is kept under a
 * separate key so it can be recovered.
 */
export function loadDataset() {
  const store = getStore()
  if (!store) return { data: null, warning: 'This browser is blocking local storage, so changes cannot be saved.' }
  let raw
  try {
    raw = store.getItem(DATA_KEY)
  } catch (e) {
    return { data: null, warning: `Saved data could not be read: ${e.message}` }
  }
  if (raw == null) return { data: null }
  try {
    const data = normalizeDataset(migrate(JSON.parse(raw)))
    const errors = validateDataset(data)
    if (errors.length) throw new StorageError(errors[0], { code: 'invalid' })
    return { data }
  } catch (e) {
    let keptAs = listUnreadableCopies().find((k) => store.getItem(k) === raw)
    if (!keptAs) {
      try {
        const key = `${CORRUPT_PREFIX}${Date.now()}`
        store.setItem(key, raw)
        keptAs = key
      } catch {
        /* not enough space for a copy; the original stays under DATA_KEY and edits are blocked */
      }
    }
    return {
      data: null,
      warning: keptAs
        ? `Saved data in this browser could not be loaded (${e.message}). A copy was kept as "${keptAs}". Restore a backup to continue.`
        : `Saved data in this browser could not be loaded (${e.message}). Editing is paused so it is not overwritten — download it from Admin → Publish & backup, or restore a backup.`,
      unreadable: true,
      keptCopy: Boolean(keptAs),
    }
  }
}

/** Saves the dataset. Throws StorageError (code "quota") when the browser is full. */
export function saveDataset(data) {
  const store = getStore()
  if (!store) throw new StorageError('Local storage is not available in this browser.', { code: 'unavailable' })
  let json
  try {
    json = JSON.stringify(data)
  } catch (e) {
    throw new StorageError('Data could not be converted for saving.', { cause: e })
  }
  try {
    store.setItem(DATA_KEY, json)
  } catch (e) {
    if (isQuotaError(e)) {
      throw new StorageError(
        'Browser storage is full. Download a backup, then remove old photos or records to free space.',
        { code: 'quota', cause: e },
      )
    }
    throw new StorageError(`Saving failed: ${e.message}`, { cause: e })
  }
  return json.length
}

export function clearDataset() {
  getStore()?.removeItem(DATA_KEY)
}

/** Approximate bytes used by the saved dataset (UTF-16 → 2 bytes per char). */
export function datasetSizeBytes() {
  const raw = getStore()?.getItem(DATA_KEY)
  return raw ? raw.length * 2 : 0
}

export function listUnreadableCopies() {
  const store = getStore()
  if (!store) return []
  const keys = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(CORRUPT_PREFIX)) keys.push(k)
  }
  return keys
}

export function readMeta() {
  try {
    return JSON.parse(getStore()?.getItem(META_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function writeMeta(patch) {
  const next = { ...readMeta(), ...patch }
  try {
    getStore()?.setItem(META_KEY, JSON.stringify(next))
  } catch {
    /* meta is non-essential */
  }
  return next
}

/** Small per-device preferences (e.g. keypad on/off). */
export function readPref(key, fallback) {
  try {
    const v = getStore()?.getItem(`bu-woodball:pref:${key}`)
    return v == null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

export function writePref(key, value) {
  try {
    getStore()?.setItem(`bu-woodball:pref:${key}`, JSON.stringify(value))
  } catch {
    /* preferences are non-essential */
  }
}
