// One-click publishing to GitHub.
//
// "Publish" commits the results file (and any new photos) straight into the
// site's GitHub repository. The push triggers the existing GitHub Pages
// workflow, and about two minutes later everyone sees the new results.
//
// It needs a GitHub fine-grained access key ("token") for this one
// repository, created by the coach. The key is kept only in this browser on
// this device; it is never part of backups, published files or the code.
// Without the key nobody can publish, whatever they do in their own browser.

import { APP_VERSION, SCHEMA_VERSION } from '../data/defaults.js'
import { BACKUP_FORMAT } from './backup.js'
import { referencedImageIds, blobToDataURL } from '../lib/images.js'
import { getImage, isImageStoreAvailable } from './imageStore.js'
import { formatDateTime } from '../lib/dates.js'

const SETTINGS_KEY = 'bu-woodball:publish'
const API = 'https://api.github.com'
const REPO_DATA_DIR = 'public/data' // in the repository; served as data/ on the site
const PUBLISHED_PHOTO = /^img-[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/

export class PublishError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'PublishError'
    this.status = status
  }
}

// ------------------------------------------------------------- settings

/** Suggests owner/repo from a github.io address, e.g. ronaldronnie.github.io/bugema-woodball/ */
export function guessRepo(loc = typeof window !== 'undefined' ? window.location : null) {
  const m = loc && /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname)
  if (!m) return { owner: '', repo: '' }
  const first = loc.pathname.split('/').filter(Boolean)[0]
  return { owner: m[1], repo: first || `${m[1]}.github.io` }
}

export function readPublishSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return s && s.token && s.owner && s.repo ? { branch: 'main', ...s } : null
  } catch {
    return null
  }
}

export function savePublishSettings({ owner, repo, branch = 'main', token }) {
  const s = { owner: owner.trim(), repo: repo.trim(), branch: (branch || 'main').trim(), token: token.trim() }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  return s
}

export function clearPublishSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}

// ------------------------------------------------------------ GitHub API

function describe(status, detail) {
  if (status === 401) return 'GitHub did not accept the access key. It may be mistyped, expired or revoked — create a new key and save it again.'
  if (status === 403) return `The access key is not allowed to do this. Give it “Contents: Read and write” permission for this repository.${detail ? ` (${detail})` : ''}`
  if (status === 404) return 'Repository or branch not found, or the access key cannot see it. Check the owner and repository name, and that the key was given access to this repository.'
  if (status === 409) return 'The repository is busy or empty. Wait a moment and try again.'
  if (status === 422) return `GitHub rejected the update${detail ? `: ${detail}` : '.'}`
  return `GitHub returned an error (${status})${detail ? `: ${detail}` : ''}.`
}

async function api(settings, path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new PublishError('Could not reach GitHub. Check the internet connection and try again.')
  }
  if (res.ok) return res.status === 204 ? null : res.json()
  let detail = ''
  try {
    detail = (await res.json()).message || ''
  } catch {
    /* no JSON body */
  }
  throw new PublishError(describe(res.status, detail), res.status)
}

const seg = (v) => encodeURIComponent(v)
const repoPath = (s) => `/repos/${seg(s.owner)}/${seg(s.repo)}`
const branchRef = (s) => s.branch.split('/').map(seg).join('/')

/** Checks the settings work: repository reachable, branch exists, writing allowed. */
export async function testConnection(settings) {
  const repo = await api(settings, repoPath(settings))
  if (repo.permissions && !repo.permissions.push) {
    throw new PublishError('This GitHub account can read the repository but not change it.')
  }
  await api(settings, `${repoPath(settings)}/git/ref/heads/${branchRef(settings)}`)
  return { fullName: repo.full_name, isPrivate: repo.private }
}

// --------------------------------------------------------------- publish

function photoExtension(type) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Builds the published file contents (exported for tests). */
export function buildPublishedSnapshot(data, imageFiles, exportedAt) {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    data,
    images: {},
    imageFiles,
  }
}

async function collectPhotos(data) {
  const photos = []
  if (!isImageStoreAvailable()) return photos
  for (const id of referencedImageIds(data)) {
    const blob = await getImage(id).catch(() => null)
    if (blob) photos.push({ id, blob, name: `${id}.${photoExtension(blob.type)}` })
  }
  return photos
}

async function commitOnce(settings, { snapshotText, photos, message, onProgress }) {
  const rp = repoPath(settings)
  onProgress('Contacting GitHub…')
  const ref = await api(settings, `${rp}/git/ref/heads/${branchRef(settings)}`)
  const baseSha = ref.object.sha
  const baseCommit = await api(settings, `${rp}/git/commits/${baseSha}`)

  let existing = []
  try {
    const list = await api(settings, `${rp}/contents/${REPO_DATA_DIR}/images?ref=${seg(settings.branch)}`)
    existing = Array.isArray(list) ? list.filter((f) => f.type === 'file').map((f) => f.name) : []
  } catch (e) {
    if (e.status !== 404) throw e // 404 = no photos published yet
  }

  const tree = []
  const wanted = new Set(photos.map((p) => p.name))
  const toUpload = photos.filter((p) => !existing.includes(p.name)) // photo IDs never change, so existing files are reused
  for (let i = 0; i < toUpload.length; i++) {
    onProgress(`Uploading photos (${i + 1} of ${toUpload.length})…`)
    const base64 = (await blobToDataURL(toUpload[i].blob)).split(',')[1]
    const blob = await api(settings, `${rp}/git/blobs`, { method: 'POST', body: { content: base64, encoding: 'base64' } })
    tree.push({ path: `${REPO_DATA_DIR}/images/${toUpload[i].name}`, mode: '100644', type: 'blob', sha: blob.sha })
  }
  // Remove published photos that are no longer used (or when photos are not published).
  for (const name of existing) {
    if (!wanted.has(name) && PUBLISHED_PHOTO.test(name)) {
      tree.push({ path: `${REPO_DATA_DIR}/images/${name}`, mode: '100644', type: 'blob', sha: null })
    }
  }

  onProgress('Uploading results…')
  const snap = await api(settings, `${rp}/git/blobs`, { method: 'POST', body: { content: snapshotText, encoding: 'utf-8' } })
  tree.push({ path: `${REPO_DATA_DIR}/snapshot.json`, mode: '100644', type: 'blob', sha: snap.sha })

  const newTree = await api(settings, `${rp}/git/trees`, { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree } })
  const commit = await api(settings, `${rp}/git/commits`, { method: 'POST', body: { message, tree: newTree.sha, parents: [baseSha] } })
  onProgress('Saving on GitHub…')
  await api(settings, `${rp}/git/refs/heads/${branchRef(settings)}`, { method: 'PATCH', body: { sha: commit.sha, force: false } })
  return { commitSha: commit.sha, uploadedPhotos: toUpload.length }
}

/**
 * Publishes the current results. Everything goes into ONE commit, so the
 * site never shows half-published results.
 */
export async function publishResults(data, settings, { includePhotos = true, onProgress = () => {} } = {}) {
  if (!settings?.token) throw new PublishError('Publishing is not set up on this device yet.')
  onProgress('Preparing…')
  const photos = includePhotos ? await collectPhotos(data) : []
  const imageFiles = Object.fromEntries(photos.map((p) => [p.id, `data/images/${p.name}`]))
  const exportedAt = new Date().toISOString()
  const snapshotText = JSON.stringify(buildPublishedSnapshot(data, imageFiles, exportedAt))
  const message = `Publish results (${formatDateTime(exportedAt)})`

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await commitOnce(settings, { snapshotText, photos, message, onProgress })
      return { ...res, exportedAt, imageFiles, photos: photos.length }
    } catch (e) {
      // 422 on the final step = someone else changed the branch meanwhile; retry once on top of it.
      if (e.status === 422 && attempt === 1) continue
      throw e
    }
  }
}

/**
 * Status of the website update triggered by a publish:
 * 'waiting' | 'running' | 'live' | 'failed' | 'unknown' (key lacks Actions access).
 */
export async function deployStatus(settings, commitSha) {
  try {
    const runs = await api(settings, `${repoPath(settings)}/actions/runs?head_sha=${seg(commitSha)}&per_page=5`)
    const run = runs?.workflow_runs?.[0]
    if (!run) return { state: 'waiting' }
    if (run.status !== 'completed') return { state: 'running', url: run.html_url }
    return { state: run.conclusion === 'success' ? 'live' : 'failed', url: run.html_url }
  } catch (e) {
    if (e.status === 403 || e.status === 404) return { state: 'unknown' }
    throw e
  }
}
