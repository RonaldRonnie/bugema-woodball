import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyAdminPassword, SESSION_TAG, ADMIN_PASSWORD } from '../src/lib/auth.js'
import { publishResults, guessRepo, testConnection, deployStatus } from '../src/services/publish.js'
import { parseBackupText } from '../src/services/backup.js'
import { putImage } from '../src/services/imageStore.js'
import { seedWithMatch } from './helpers.js'

describe('admin password', () => {
  it('accepts kayirikiti and rejects anything else', async () => {
    expect(await verifyAdminPassword('kayirikiti')).toBe(true)
    expect(await verifyAdminPassword('Kayirikiti')).toBe(false)
    expect(await verifyAdminPassword('kayirikiti ')).toBe(false)
    expect(await verifyAdminPassword('')).toBe(false)
  })

  it('does not contain the plain password in the code', () => {
    expect(JSON.stringify(ADMIN_PASSWORD)).not.toContain('kayirikiti')
    expect(SESSION_TAG).toHaveLength(16)
  })
})

// Minimal fake of the parts of the GitHub API used for publishing.
function fakeGitHub({ existingPhotos = [], failRefUpdateOnce = false, status, readOnly = false } = {}) {
  const calls = []
  let refUpdates = 0
  const json = (body, code = 200) => ({ ok: code < 300, status: code, json: async () => body })
  const fetchImpl = vi.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET'
    const path = url.replace('https://api.github.com', '')
    const body = opts.body ? JSON.parse(opts.body) : null
    calls.push({ method, path, body, auth: opts.headers?.Authorization })
    if (status) return json({ message: 'nope' }, status)
    if (readOnly && method !== 'GET') return json({ message: 'Resource not accessible by personal access token' }, 403)
    if (method === 'GET' && path === '/repos/coach/site') return json({ full_name: 'coach/site', private: false, permissions: { push: true } })
    if (method === 'GET' && path === '/repos/coach/site/git/ref/heads/main') return json({ object: { sha: 'base1' } })
    if (method === 'GET' && path === '/repos/coach/site/git/commits/base1') return json({ tree: { sha: 'tree1' } })
    if (method === 'GET' && path.startsWith('/repos/coach/site/contents/public/data/images')) {
      return existingPhotos.length ? json(existingPhotos.map((name) => ({ name, type: 'file' }))) : json({ message: 'Not Found' }, 404)
    }
    if (method === 'POST' && path === '/repos/coach/site/git/blobs') return json({ sha: `blob${calls.length}` })
    if (method === 'POST' && path === '/repos/coach/site/git/trees') return json({ sha: 'tree2' })
    if (method === 'POST' && path === '/repos/coach/site/git/commits') return json({ sha: 'commit2' })
    if (method === 'PATCH' && path === '/repos/coach/site/git/refs/heads/main') {
      refUpdates++
      if (failRefUpdateOnce && refUpdates === 1) return json({ message: 'Update is not a fast forward' }, 422)
      return json({ object: { sha: 'commit2' } })
    }
    if (method === 'GET' && path.startsWith('/repos/coach/site/actions/runs')) {
      return json({ workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'https://github.com/run/1' }] })
    }
    return json({ message: `unexpected ${method} ${path}` }, 500)
  })
  return { fetchImpl, calls }
}

const SETTINGS = { owner: 'coach', repo: 'site', branch: 'main', token: 'github_pat_test' }

describe('publishing to GitHub', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('commits results and new photos in one commit, reusing and pruning photo files', async () => {
    const { data } = seedWithMatch()
    const keep = await putImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    const fresh = await putImage(new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' }))
    data.players[0].photoId = keep
    data.players[1].photoId = fresh
    const gh = fakeGitHub({ existingPhotos: [`${keep}.jpg`, 'img-old0000000000.jpg', 'README.md'] })
    vi.stubGlobal('fetch', gh.fetchImpl)

    const res = await publishResults(data, SETTINGS, { includePhotos: true })
    expect(res.commitSha).toBe('commit2')
    expect(res.uploadedPhotos).toBe(1) // only the new photo is uploaded
    expect(gh.calls.every((c) => c.auth === 'Bearer github_pat_test')).toBe(true)

    const tree = gh.calls.find((c) => c.path.endsWith('/git/trees')).body
    expect(tree.base_tree).toBe('tree1')
    const paths = Object.fromEntries(tree.tree.map((t) => [t.path, t.sha]))
    expect(paths[`public/data/images/${fresh}.png`]).toMatch(/^blob/)
    expect(paths['public/data/images/img-old0000000000.jpg']).toBeNull() // unused photo removed
    expect('public/data/images/README.md' in paths).toBe(false) // unrelated files untouched
    expect(paths['public/data/snapshot.json']).toMatch(/^blob/)

    const commit = gh.calls.find((c) => c.path.endsWith('/git/commits') && c.method === 'POST').body
    expect(commit.parents).toEqual(['base1'])
    expect(commit.message).toMatch(/^Publish results/)
    expect(gh.calls.find((c) => c.method === 'PATCH').body).toEqual({ sha: 'commit2', force: false })

    // The published file is a valid snapshot with photo file paths.
    const snapBody = gh.calls.filter((c) => c.path.endsWith('/git/blobs')).pop().body
    expect(snapBody.encoding).toBe('utf-8')
    const parsed = parseBackupText(snapBody.content)
    expect(parsed.summary.matches).toBe(1)
    expect(parsed.imageFiles).toEqual({ [keep]: `data/images/${keep}.jpg`, [fresh]: `data/images/${fresh}.png` })
  })

  it('can publish without photos (and removes previously published ones)', async () => {
    const { data } = seedWithMatch()
    const gh = fakeGitHub({ existingPhotos: ['img-aaaa.jpg'] })
    vi.stubGlobal('fetch', gh.fetchImpl)
    const res = await publishResults(data, SETTINGS, { includePhotos: false })
    expect(res.photos).toBe(0)
    const tree = gh.calls.find((c) => c.path.endsWith('/git/trees')).body.tree
    expect(tree.find((t) => t.path === 'public/data/images/img-aaaa.jpg').sha).toBeNull()
  })

  it('retries once when the branch moved during publishing', async () => {
    const { data } = seedWithMatch()
    const gh = fakeGitHub({ failRefUpdateOnce: true })
    vi.stubGlobal('fetch', gh.fetchImpl)
    await publishResults(data, SETTINGS, { includePhotos: false })
    expect(gh.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2)
  })

  it('explains a rejected or missing access key', async () => {
    const { data } = seedWithMatch()
    vi.stubGlobal('fetch', fakeGitHub({ status: 401 }).fetchImpl)
    await expect(publishResults(data, SETTINGS)).rejects.toThrow(/did not accept the access key/)
    await expect(publishResults(data, { ...SETTINGS, token: '' })).rejects.toThrow(/not set up/)
    vi.stubGlobal('fetch', fakeGitHub({ status: 404 }).fetchImpl)
    await expect(testConnection(SETTINGS)).rejects.toThrow(/not found/)
  })

  it('catches a read-only access key when saving it, before any publish', async () => {
    const gh = fakeGitHub({ readOnly: true })
    vi.stubGlobal('fetch', gh.fetchImpl)
    await expect(testConnection(SETTINGS)).rejects.toThrow(/not allowed to change it.*Contents to “Read and write”/s)
    // the check only creates an unattached blob: no tree, commit or branch change
    expect(gh.calls.some((c) => /git\/(trees|commits|refs)/.test(c.path) && c.method !== 'GET')).toBe(false)
  })

  it('checks the connection and reports the website update', async () => {
    vi.stubGlobal('fetch', fakeGitHub().fetchImpl)
    expect(await testConnection(SETTINGS)).toEqual({ fullName: 'coach/site', isPrivate: false })
    expect((await deployStatus(SETTINGS, 'commit2')).state).toBe('live')
    vi.stubGlobal('fetch', fakeGitHub({ status: 403 }).fetchImpl)
    expect((await deployStatus(SETTINGS, 'commit2')).state).toBe('unknown') // key without Actions access
  })

  it('suggests the repository from the github.io address', () => {
    expect(guessRepo({ hostname: 'ronaldronnie.github.io', pathname: '/bugema-woodball/' })).toEqual({ owner: 'ronaldronnie', repo: 'bugema-woodball' })
    expect(guessRepo({ hostname: 'localhost', pathname: '/' })).toEqual({ owner: '', repo: '' })
  })
})

describe('published photo paths', () => {
  it('accepts only plain files inside data/images/', () => {
    const { data } = seedWithMatch()
    const text = JSON.stringify({
      format: 'bu-woodball-backup',
      data,
      imageFiles: {
        a: 'data/images/img-a.jpg',
        b: '../secret.jpg',
        c: 'https://evil.example/x.jpg',
        d: 'data/images/sub/x.png',
      },
    })
    expect(parseBackupText(text).imageFiles).toEqual({ a: 'data/images/img-a.jpg' })
  })
})
