// Published results. Records live in the coach's browser, so visitors see
// the results the coach has PUBLISHED: a file in the repository at
// public/data/snapshot.json (photos as separate files in public/data/images/).
// The site is still fully static — visitors only download files.

import { parseBackupText } from './backup.js'
import { fetchImageBlob } from '../lib/images.js'

export const SNAPSHOT_PATH = 'data/snapshot.json'

function siteBase() {
  const base = import.meta.env?.BASE_URL || './'
  return base.endsWith('/') ? base : `${base}/`
}

export function snapshotUrl() {
  return `${siteBase()}${SNAPSHOT_PATH}`
}

/** Site URLs for published photo files, keyed by image ID. */
export function imageFileUrls(imageFiles = {}) {
  const base = siteBase()
  return Object.fromEntries(Object.entries(imageFiles).map(([id, path]) => [id, `${base}${path}`]))
}

/**
 * Returns the published snapshot, or null if none is published or reachable.
 * `displayImages` maps image IDs to something an <img> can show.
 * `fresh: true` always asks the website (never the copy kept for offline use),
 * e.g. before publishing over it.
 */
export async function fetchPublishedSnapshot({ fresh = false } = {}) {
  try {
    // "?fresh=" also tells the offline support (src/offline/sw-template.js) not to answer from its copy.
    const res = await fetch(fresh ? `${snapshotUrl()}?fresh=${Date.now()}` : snapshotUrl(), { cache: fresh ? 'no-store' : 'no-cache' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (type.includes('text/html')) return null // dev-server fallback page, not a snapshot
    const parsed = parseBackupText(await res.text())
    return { ...parsed, displayImages: { ...parsed.images, ...imageFileUrls(parsed.imageFiles) } }
  } catch {
    return null
  }
}

/** Downloads every published photo file; throws if any is missing. */
export async function fetchSnapshotImageBlobs(snapshot) {
  const out = []
  for (const [id, url] of Object.entries(imageFileUrls(snapshot.imageFiles))) {
    out.push([id, await fetchImageBlob(url)])
  }
  return out
}
