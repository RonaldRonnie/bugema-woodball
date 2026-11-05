import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createSeedData } from '../data/seed.js'
import { DATA_KEY, loadDataset, saveDataset, validateDataset, isStorageAvailable, clearDataset, readMeta, writeMeta } from '../services/storage.js'
import { fetchPublishedSnapshot } from '../services/snapshot.js'
import { decodeImages, writeImages } from '../services/backup.js'
import { removeUnreferencedImages, isImageStoreAvailable } from '../services/imageStore.js'
import { referencedImageIds } from '../lib/images.js'
import * as actions from './actions.js'
import { useToast } from './UIContext.jsx'

const DataContext = createContext(null)

function cloneData(data) {
  return typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data))
}

/**
 * Where the data on screen comes from:
 *  'local'    — saved in this browser (the coach's working copy)
 *  'snapshot' — published results from the website (read-only until copied)
 *  'seed'     — the initial roster; nothing saved yet
 */
function initialState() {
  const { data, warning, unreadable, keptCopy } = loadDataset()
  if (data) return { data, source: 'local', warning: warning || null }
  // If the unreadable data could not be copied aside, block edits so the
  // first save does not overwrite the only copy.
  return {
    data: createSeedData(),
    source: 'seed',
    warning: warning || null,
    unreadable: Boolean(unreadable),
    blocked: Boolean(unreadable && !keptCopy),
  }
}

export function DataProvider({ children }) {
  const toast = useToast()
  const [state, setState] = useState(initialState)
  const [snapshot, setSnapshot] = useState(null) // published snapshot, if any
  const [meta, setMeta] = useState(readMeta) // e.g. when the last backup was made
  const [imagesVersion, setImagesVersion] = useState(0) // bumped when photos are restored

  /** Records that a backup was made (drives the backup reminder). */
  const recordBackup = useCallback((patch) => setMeta(writeMeta(patch)), [])
  const dataRef = useRef(state.data)
  const sourceRef = useRef(state.source)
  const blockedRef = useRef(false)
  dataRef.current = state.data
  sourceRef.current = state.source
  blockedRef.current = Boolean(state.blocked)

  const storageOk = useMemo(() => isStorageAvailable(), [])

  // Look for published results; show them when this browser has no data.
  useEffect(() => {
    let cancelled = false
    fetchPublishedSnapshot().then((snap) => {
      if (cancelled || !snap) return
      setSnapshot(snap)
      if (sourceRef.current === 'seed' && !state.unreadable) {
        setState((s) => (s.source === 'seed' ? { ...s, data: snap.data, source: 'snapshot' } : s))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once per start-up, delete stored photos that no record uses any more
  // (e.g. a photo picked in a form that was then dismissed).
  useEffect(() => {
    if (sourceRef.current !== 'local' || !isImageStoreAvailable()) return
    removeUnreferencedImages(referencedImageIds(dataRef.current), { minAgeMs: 60 * 60 * 1000 }).catch(() => {})
  }, [])

  // Keep several open tabs in step: reload when another tab saves.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== DATA_KEY) return
      const { data } = loadDataset()
      if (data) setState((s) => ({ ...s, data, source: 'local' }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /**
   * Applies a change safely: the mutator edits a copy, the copy is
   * validated and saved, and only then does the screen update. If any step
   * fails the previous data stays in place and the user is told why.
   */
  const commit = useCallback(
    (mutator, { success, quiet = false } = {}) => {
      if (blockedRef.current) {
        toast.error('Saved data could not be read and no safety copy could be made, so editing is paused to protect it. Go to Admin → Backup & data to download the unreadable data or restore a backup.')
        return { ok: false }
      }
      if (sourceRef.current === 'snapshot') {
        toast.error('You are viewing published results. Copy them into this browser before editing (Admin → Backup & data).')
        return { ok: false }
      }
      const current = dataRef.current
      const draft = cloneData(current)
      let value
      try {
        value = mutator(draft)
      } catch (e) {
        if (!quiet) toast.error(e.message || 'That change could not be made.')
        return { ok: false, error: e.message }
      }
      draft.revision = (current.revision || 0) + 1
      draft.updatedAt = new Date().toISOString()
      const errors = validateDataset(draft)
      if (errors.length) {
        toast.error(`Change not saved: ${errors[0]}`)
        return { ok: false, error: errors[0] }
      }
      try {
        saveDataset(draft)
      } catch (e) {
        toast.error(e.message)
        return { ok: false, error: e.message }
      }
      dataRef.current = draft
      sourceRef.current = 'local'
      setState((s) => ({ ...s, data: draft, source: 'local', warning: null }))
      if (success) toast.success(success)
      return { ok: true, value }
    },
    [toast],
  )

  /**
   * Replaces everything with a restored backup. Order matters so that a
   * failure never leaves records pointing at deleted photos:
   * check everything → add the new photos (nothing deleted) → save the
   * records → only then remove photos that are no longer used.
   */
  const replaceAll = useCallback(async ({ data, images }) => {
    const errors = validateDataset(data)
    if (errors.length) throw new Error(errors[0])
    const decoded = decodeImages(images)
    const restoredImages = await writeImages(decoded)
    saveDataset(data)
    dataRef.current = data
    sourceRef.current = 'local'
    setState((s) => ({ ...s, data, source: 'local', warning: null, unreadable: false, blocked: false }))
    setImagesVersion((v) => v + 1)
    if (isImageStoreAvailable()) removeUnreferencedImages(referencedImageIds(data)).catch(() => {})
    return { restoredImages }
  }, [])

  /** Copies the published snapshot (with its photos) into this browser for editing. */
  const adoptSnapshot = useCallback(async () => {
    if (!snapshot) throw new Error('No published results are available.')
    return replaceAll({ data: snapshot.data, images: snapshot.images })
  }, [snapshot, replaceAll])

  /** Starts again from the initial roster (after the user has confirmed). Returns success. */
  const resetToSeed = useCallback(() => {
    const seed = createSeedData()
    try {
      saveDataset(seed)
    } catch (e) {
      toast.error(e.message)
      return false
    }
    dataRef.current = seed
    sourceRef.current = 'local'
    setState((s) => ({ ...s, data: seed, source: 'local', warning: null, unreadable: false, blocked: false }))
    if (isImageStoreAvailable()) removeUnreferencedImages(new Set()).catch(() => {})
    return true
  }, [toast])

  /** Removes this browser's copy so the published results show again. */
  const discardLocal = useCallback(() => {
    try {
      clearDataset()
    } catch (e) {
      toast.error(e.message)
      return false
    }
    const next = snapshot ? { data: snapshot.data, source: 'snapshot' } : { data: createSeedData(), source: 'seed' }
    dataRef.current = next.data
    sourceRef.current = next.source
    setState((s) => ({ ...s, ...next, warning: null, unreadable: false, blocked: false }))
    return true
  }, [snapshot, toast])

  const value = useMemo(
    () => ({
      data: state.data,
      source: state.source,
      warning: state.warning,
      storageOk,
      snapshot,
      snapshotImages: state.source === 'snapshot' ? snapshot?.images || null : null,
      imagesVersion,
      blocked: Boolean(state.blocked),
      meta,
      recordBackup,
      commit,
      actions,
      replaceAll,
      adoptSnapshot,
      resetToSeed,
      discardLocal,
    }),
    [state, storageOk, snapshot, imagesVersion, meta, recordBackup, commit, replaceAll, adoptSnapshot, resetToSeed, discardLocal],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

/** Convenience lookups that most pages need. */
export function useLookups() {
  const { data } = useData()
  return useMemo(
    () => ({
      groupsById: Object.fromEntries(data.groups.map((g) => [g.id, g])),
      playersById: Object.fromEntries(data.players.map((p) => [p.id, p])),
      matchesById: Object.fromEntries(data.matches.map((m) => [m.id, m])),
    }),
    [data],
  )
}
