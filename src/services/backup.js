// JSON backup and restore. The same file format is used for the
// "published results" snapshot that visitors see on GitHub Pages.

import { APP_VERSION, SCHEMA_VERSION } from '../data/defaults.js'
import { migrate, normalizeDataset, validateDataset } from './storage.js'
import { blobToDataURL, dataURLToBlob, isImageDataURL, referencedImageIds } from '../lib/images.js'
import { getImage, putImage, isImageStoreAvailable } from './imageStore.js'

export const BACKUP_FORMAT = 'bu-woodball-backup'
const MAX_BACKUP_BYTES = 60 * 1024 * 1024

export class BackupError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BackupError'
  }
}

/**
 * Builds a backup object. Photos are embedded as data URLs when
 * `includeImages` is true and photo storage is available.
 */
export async function createBackup(data, { includeImages = true, snapshotImages = null } = {}) {
  const images = {}
  let missingImages = 0
  if (includeImages) {
    for (const id of referencedImageIds(data)) {
      try {
        if (snapshotImages?.[id]) {
          images[id] = snapshotImages[id]
          continue
        }
        if (!isImageStoreAvailable()) {
          missingImages++
          continue
        }
        const blob = await getImage(id)
        if (blob) images[id] = await blobToDataURL(blob)
        else missingImages++
      } catch {
        missingImages++
      }
    }
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    images,
    missingImages,
  }
}

export function summariseData(data) {
  const rounds = data.matches.reduce((n, m) => n + m.rounds.length, 0)
  return {
    groups: data.groups.length,
    players: data.players.length,
    matches: data.matches.length,
    rounds,
    updatedAt: data.updatedAt || null,
  }
}

/**
 * Parses and validates backup text. Throws BackupError with a readable
 * message when the content cannot be used. Nothing is saved here.
 */
export function parseBackupText(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not valid JSON. Choose a backup file downloaded from this app.')
  }
  if (!parsed || typeof parsed !== 'object') throw new BackupError('This file does not contain backup data.')

  let rawData
  let images = {}
  let exportedAt = null
  if (parsed.format === BACKUP_FORMAT) {
    rawData = parsed.data
    images = parsed.images && typeof parsed.images === 'object' ? parsed.images : {}
    exportedAt = parsed.exportedAt || null
  } else if (Array.isArray(parsed.players) && Array.isArray(parsed.groups)) {
    rawData = parsed // a bare dataset is accepted too
  } else {
    throw new BackupError('This file is not a Bugema Woodball backup.')
  }

  let data
  try {
    data = normalizeDataset(migrate(rawData))
  } catch (e) {
    throw new BackupError(e.message)
  }
  const errors = validateDataset(data)
  if (errors.length) {
    throw new BackupError(`The backup contains invalid data: ${errors.slice(0, 3).join(' ')}`)
  }

  const cleanImages = {}
  for (const [id, url] of Object.entries(images)) {
    if (typeof id === 'string' && isImageDataURL(url)) cleanImages[id] = url
  }
  return { data, images: cleanImages, exportedAt, summary: summariseData(data) }
}

export async function readBackupFile(file) {
  if (!file) throw new BackupError('No file selected.')
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError('This file is too large to be a backup from this app.')
  const text = await file.text()
  return parseBackupText(text)
}

/**
 * Decodes every photo in a backup up front, so a damaged file fails before
 * anything is changed. Throws BackupError on bad data.
 */
export function decodeImages(images) {
  const decoded = []
  for (const [id, url] of Object.entries(images || {})) {
    try {
      decoded.push([id, dataURLToBlob(url)])
    } catch {
      throw new BackupError(`Photo "${id}" in the backup is damaged. Nothing was changed.`)
    }
  }
  return decoded
}

/**
 * Writes decoded photos into IndexedDB without deleting anything first, so
 * a failure part-way leaves every existing photo in place. Photos no longer
 * used are removed separately, after the new records have been saved.
 * Returns the number of photos written.
 */
export async function writeImages(decoded) {
  if (!decoded.length || !isImageStoreAvailable()) return 0
  for (const [id, blob] of decoded) await putImage(blob, id)
  return decoded.length
}

/** Decode + write in one step (used by tests and simple callers). */
export async function restoreImages(images) {
  return writeImages(decodeImages(images))
}

export function backupFileName(prefix = 'bugema-woodball-backup') {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `${prefix}_${stamp}.json`
}
