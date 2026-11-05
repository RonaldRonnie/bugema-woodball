// Photos are kept in IndexedDB, which allows far more space than
// LocalStorage. The dataset only stores image IDs.

import { newId } from '../lib/ids.js'

const DB_NAME = 'bu-woodball-images'
const STORE = 'images'
const VERSION = 1

let dbPromise = null

export function isImageStoreAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDB() {
  if (!isImageStoreAvailable()) return Promise.reject(new Error('Photo storage (IndexedDB) is not available in this browser.'))
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => {
        dbPromise = null
        reject(req.error || new Error('Could not open photo storage.'))
      }
      req.onblocked = () => {
        dbPromise = null
        reject(new Error('Photo storage is blocked by another open tab. Close other tabs of this app and retry.'))
      }
    })
  }
  return dbPromise
}

function tx(mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        let result
        Promise.resolve(run(store, (v) => (result = v))).catch(reject)
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error || new Error('Photo storage operation failed.'))
        t.onabort = () => {
          const e = t.error
          if (e && e.name === 'QuotaExceededError') reject(new Error('Not enough browser storage space for this photo.'))
          else reject(e || new Error('Photo storage operation was cancelled.'))
        }
      }),
  )
}

// Stored as ArrayBuffer + MIME type: the most widely supported form across
// browsers (older Safari versions had trouble persisting Blob objects).
export function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read image data.'))
    reader.readAsArrayBuffer(blob)
  })
}

async function toRecord(id, blob) {
  return { id, type: blob.type || 'image/jpeg', data: await blobToArrayBuffer(blob), savedAt: new Date().toISOString() }
}

function fromRecord(record) {
  return record ? new Blob([record.data], { type: record.type }) : null
}

export async function putImage(blob, id = newId('img')) {
  const record = await toRecord(id, blob)
  await tx('readwrite', (store) => {
    store.put(record)
  })
  return id
}

export function getImage(id) {
  return tx('readonly', (store, done) => {
    const req = store.get(id)
    req.onsuccess = () => done(fromRecord(req.result))
  })
}

export function deleteImage(id) {
  if (!id) return Promise.resolve()
  return tx('readwrite', (store) => {
    store.delete(id)
  })
}

export function listImageIds() {
  return tx('readonly', (store, done) => {
    const req = store.getAllKeys()
    req.onsuccess = () => done(req.result || [])
  })
}

export function getAllImages() {
  return tx('readonly', (store, done) => {
    const req = store.getAll()
    req.onsuccess = () => done((req.result || []).map((r) => ({ id: r.id, blob: fromRecord(r) })))
  })
}

export function clearImages() {
  return tx('readwrite', (store) => {
    store.clear()
  })
}

/**
 * Deletes stored photos that no record refers to any more. With
 * `minAgeMs`, only photos saved at least that long ago are removed (so a
 * photo just picked in a form that is still open is left alone).
 */
export async function removeUnreferencedImages(referencedIds, { minAgeMs = 0 } = {}) {
  let orphans
  if (minAgeMs > 0) {
    const cutoff = Date.now() - minAgeMs
    const meta = await tx('readonly', (store, done) => {
      const req = store.getAll()
      req.onsuccess = () => done((req.result || []).map((r) => ({ id: r.id, savedAt: r.savedAt })))
    })
    orphans = meta.filter((r) => !referencedIds.has(r.id) && (!r.savedAt || Date.parse(r.savedAt) < cutoff)).map((r) => r.id)
  } else {
    orphans = (await listImageIds()).filter((id) => !referencedIds.has(id))
  }
  if (!orphans.length) return 0
  await tx('readwrite', (store) => {
    for (const id of orphans) store.delete(id)
  })
  return orphans.length
}
