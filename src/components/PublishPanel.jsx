import { useEffect, useRef, useState } from 'react'
import { useData } from '../state/DataContext.jsx'
import { useToast, useConfirm } from '../state/UIContext.jsx'
import { Banner } from './common.jsx'
import Icon from './Icons.jsx'
import {
  readPublishSettings,
  savePublishSettings,
  clearPublishSettings,
  guessRepo,
  testConnection,
  publishResults,
  deployStatus,
} from '../services/publish.js'
import { fetchPublishedSnapshot } from '../services/snapshot.js'
import { readPref, writePref } from '../services/storage.js'
import { formatDateTime } from '../lib/dates.js'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/** True when this device holds results the team has not been shown yet. */
export function hasUnpublishedChanges({ data, meta, snapshot, source }) {
  if (source !== 'local') return false
  if (meta?.lastPublishedDataAt && meta.lastPublishedDataAt === data.updatedAt) return false
  if (snapshot?.data?.updatedAt && snapshot.data.updatedAt === data.updatedAt) return false
  return true
}

function siteAddress() {
  return `${window.location.origin}${window.location.pathname}`
}

function SetupForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const guess = guessRepo()
  const [form, setForm] = useState({
    owner: initial?.owner || guess.owner,
    repo: initial?.repo || guess.repo,
    branch: initial?.branch || 'main',
    token: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const settings = { ...form, token: form.token.trim() || initial?.token || '' }
    if (!settings.owner.trim() || !settings.repo.trim()) return setError('Enter the GitHub account name and repository name.')
    if (!settings.token) return setError('Paste the access key from GitHub.')
    setBusy(true)
    try {
      const info = await testConnection({ ...settings, owner: settings.owner.trim(), repo: settings.repo.trim(), branch: settings.branch.trim() || 'main' })
      const saved = savePublishSettings(settings)
      toast.success(`Connected to ${info.fullName}. You can publish from this device now.`)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <details className="table-toggle" open={!initial}>
        <summary>How to create the access key (one time, about 3 minutes)</summary>
        <ol className="small">
          <li>
            On a computer, open{' '}
            <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
              GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
            </a>{' '}
            (sign in to GitHub first).
          </li>
          <li>
            <strong>Token name:</strong> “Woodball publishing”. <strong>Expiration:</strong> choose a date (up to 1 year) — you will need a new key after it
            expires.
          </li>
          <li>
            <strong>Repository access:</strong> “Only select repositories” → choose <code>{form.repo || 'your repository'}</code>.
          </li>
          <li>
            <strong>Permissions → Repository permissions:</strong> set <strong>Contents</strong> to <em>Read and write</em>, and <strong>Actions</strong> to{' '}
            <em>Read-only</em> (lets the app show when the website has updated).
          </li>
          <li>Click <strong>Generate token</strong>, copy it (it starts with <code>github_pat_</code>) and paste it below.</li>
        </ol>
      </details>
      <div className="form-grid mt-1">
        <div className="field">
          <label htmlFor="pub-owner">GitHub account</label>
          <input id="pub-owner" className="input" value={form.owner} onChange={set('owner')} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="pub-repo">Repository</label>
          <input id="pub-repo" className="input" value={form.repo} onChange={set('repo')} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field full">
          <label htmlFor="pub-token">Access key (token)</label>
          <input
            id="pub-token"
            className="input"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={initial?.token ? 'Leave empty to keep the saved key' : 'github_pat_…'}
            value={form.token}
            onChange={set('token')}
            aria-invalid={Boolean(error)}
            aria-describedby="pub-token-hint"
          />
          <span id="pub-token-hint" className="field-hint">
            Saved only in this browser on this device. It is never included in backups or published files. Do not set this up on a shared device.
          </span>
        </div>
        <details className="table-toggle full">
          <summary>Advanced: branch</summary>
          <div className="field mt-1">
            <label htmlFor="pub-branch">Branch</label>
            <input id="pub-branch" className="input" style={{ maxWidth: 200 }} value={form.branch} onChange={set('branch')} autoCapitalize="none" />
          </div>
        </details>
      </div>
      {error && (
        <p className="field-error mt-1" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking with GitHub…' : 'Check and save'}
        </button>
      </div>
    </form>
  )
}

function DeployLine({ deploy }) {
  if (!deploy) return null
  const map = {
    waiting: ['info', 'Published. Waiting for the website to start updating…'],
    running: ['info', 'Published. The website is updating (usually 1–2 minutes)…'],
    live: ['success', 'The website is updated — everyone can see the new results now.'],
    failed: ['danger', 'Published, but the website update failed. Open the details on GitHub, or publish again.'],
    unknown: ['success', 'Published. The website will show the new results in about 2 minutes.'],
  }
  const [kind, text] = map[deploy.state] || map.unknown
  return (
    <Banner kind={kind}>
      <p>
        {text}{' '}
        {deploy.state === 'live' && (
          <a href={siteAddress()} target="_blank" rel="noreferrer">
            Open the website
          </a>
        )}
        {deploy.url && deploy.state !== 'live' && (
          <a href={deploy.url} target="_blank" rel="noreferrer">
            Details
          </a>
        )}
      </p>
    </Banner>
  )
}

/** The main "Publish results" card for the coach. */
export default function PublishPanel() {
  const { data, source, meta, snapshot, notePublished } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const [settings, setSettings] = useState(readPublishSettings)
  const [editing, setEditing] = useState(false)
  const [includePhotos, setIncludePhotosState] = useState(() => readPref('publishPhotos', true))
  const [progress, setProgress] = useState('')
  const [deploy, setDeploy] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  const setIncludePhotos = (v) => {
    setIncludePhotosState(v)
    writePref('publishPhotos', v)
  }

  const watchDeploy = (commitSha) => {
    clearInterval(pollRef.current)
    const started = Date.now()
    setDeploy({ state: 'waiting' })
    const tick = async () => {
      try {
        const st = await deployStatus(settings, commitSha)
        setDeploy(st)
        if (['live', 'failed', 'unknown'].includes(st.state) || Date.now() - started > 8 * 60 * 1000) clearInterval(pollRef.current)
      } catch {
        clearInterval(pollRef.current)
        setDeploy({ state: 'unknown' })
      }
    }
    pollRef.current = setInterval(tick, 10000)
    setTimeout(tick, 4000)
  }

  const publish = async () => {
    // Guard against overwriting newer results published from another device.
    const online = await fetchPublishedSnapshot({ fresh: true })
    if (online && online.data.updatedAt > data.updatedAt && online.exportedAt !== meta.lastPublishedAt) {
      const overwrite = await confirm({
        title: 'The website has newer results',
        danger: true,
        confirmLabel: 'Publish anyway',
        message: (
          <p>
            The results on the website (published {formatDateTime(online.exportedAt)}) include changes made after the data on this device (last changed{' '}
            {formatDateTime(data.updatedAt)}). Publishing from here would replace them. To continue from the website’s results instead, cancel and use “Load
            the published results into this browser”.
          </p>
        ),
      })
      if (!overwrite) return
    } else {
      const ok = await confirm({
        title: 'Publish results?',
        confirmLabel: 'Publish',
        message: (
          <p>
            Everyone who opens the website will see these results ({data.matches.length} matches, {data.players.length} players
            {includePhotos ? ', with photos' : ', without photos'}) in about 2 minutes.
          </p>
        ),
      })
      if (!ok) return
    }

    setProgress('Preparing…')
    setDeploy(null)
    try {
      const res = await publishResults(data, settings, { includePhotos, onProgress: setProgress })
      notePublished({ data, exportedAt: res.exportedAt, imageFiles: res.imageFiles, commitSha: res.commitSha })
      toast.success('Results published.')
      watchDeploy(res.commitSha)
    } catch (e) {
      toast.error(`Publishing failed — nothing was changed on the website. ${e.message}`)
    } finally {
      setProgress('')
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Remove publishing from this device?',
      message: 'The saved GitHub access key will be deleted from this browser. You can set it up again at any time. (To fully cancel the key, delete it on GitHub too.)',
      confirmLabel: 'Remove',
    })
    if (ok) {
      clearPublishSettings()
      setSettings(null)
      toast.success('Publishing removed from this device.')
    }
  }

  const unpublished = hasUnpublishedChanges({ data, meta, snapshot, source })

  return (
    <section className="card span-2" id="publish">
      <div className="card-header">
        <div>
          <h2>
            <Icon name="upload" width="20" height="20" style={{ verticalAlign: '-3px' }} /> Publish results for everyone
          </h2>
          <p className="card-sub">
            Results you record stay on this device until you publish them. Publishing updates the website for everyone, wherever they are.
          </p>
        </div>
      </div>

      {!settings || editing ? (
        <>
          {!settings && (
            <p className="small">
              <strong>One-time setup on this device:</strong> connect the app to the website’s GitHub repository with an access key that only you have. Without
              the key nobody can change what the team sees.
            </p>
          )}
          <SetupForm
            initial={editing ? settings : null}
            onSaved={(s) => {
              setSettings(s)
              setEditing(false)
            }}
            onCancel={editing ? () => setEditing(false) : null}
          />
        </>
      ) : (
        <>
          <p className="small mb-0">
            Connected to <strong>{settings.owner}/{settings.repo}</strong>.{' '}
            {meta.lastPublishedAt ? `Last published from this device ${formatDateTime(meta.lastPublishedAt)}.` : 'Not published from this device yet.'}
          </p>
          {source === 'snapshot' ? (
            <Banner kind="info">This browser is showing the published results. Copy them into this browser (below) before making and publishing changes.</Banner>
          ) : (
            <>
              <p className={`small mt-1 ${unpublished ? '' : 'muted'}`}>
                {unpublished ? (
                  <span className="tag tag-warn">Changes not yet published</span>
                ) : (
                  <span className="tag tag-ok">Website is up to date with this device</span>
                )}
              </p>
              <label className="check small">
                <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
                Include photos (they become public on the website)
              </label>
              <button type="button" className="btn btn-accent mt-1" onClick={publish} disabled={Boolean(progress)} style={{ minWidth: 220 }}>
                <Icon name="upload" /> {progress || 'Publish results now'}
              </button>
            </>
          )}
          <div className="mt-2">
            <DeployLine deploy={deploy} />
          </div>
          <div className="row small">
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              Change connection or access key
            </button>
            <span className="muted">·</span>
            <button type="button" className="link-btn" onClick={disconnect}>
              Remove from this device
            </button>
          </div>
        </>
      )}
    </section>
  )
}
