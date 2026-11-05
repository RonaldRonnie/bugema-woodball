// Published results. LocalStorage lives in one browser only, so visitors to
// the GitHub Pages site would otherwise see an empty app. The coach can
// publish a read-only copy of the results by adding a backup file to the
// repository at public/data/snapshot.json — still fully static hosting.

import { parseBackupText } from './backup.js'

export const SNAPSHOT_PATH = 'data/snapshot.json'

export function snapshotUrl() {
  const base = import.meta.env?.BASE_URL || './'
  return `${base.endsWith('/') ? base : `${base}/`}${SNAPSHOT_PATH}`
}

/** Returns the published snapshot, or null if none is published / reachable. */
export async function fetchPublishedSnapshot() {
  try {
    const res = await fetch(snapshotUrl(), { cache: 'no-cache' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (type.includes('text/html')) return null // dev-server fallback page, not a snapshot
    const text = await res.text()
    return parseBackupText(text)
  } catch {
    return null
  }
}
