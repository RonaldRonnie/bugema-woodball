import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import { useToast, useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader } from '../../components/common.jsx'
import { PhotoPicker, StoredImage } from '../../components/media.jsx'
import Icon from '../../components/Icons.jsx'
import { TIE_BREAKER_OPTIONS } from '../../data/defaults.js'
import { IMAGE_PRESETS } from '../../lib/images.js'
import { storeUploadedImage, discardImage } from '../../state/images.jsx'
import { cleanInboxUrl, isInboxUrl, pingInbox } from '../../lib/inbox.js'
import { copyText } from '../../lib/clipboard.js'
import inboxScript from '../../../apps-script/score-inbox.gs?raw'

function TeamInfo() {
  const { data, commit, actions } = useData()
  const s = data.settings
  const [form, setForm] = useState({ teamName: s.teamName, shortName: s.shortName, tagline: s.tagline })
  const dirty = form.teamName !== s.teamName || form.shortName !== s.shortName || form.tagline !== s.tagline
  const submit = (e) => {
    e.preventDefault()
    commit((d) => actions.updateSettings(d, form), { success: 'Team details saved.' })
  }
  return (
    <section className="card">
      <h2>Team details</h2>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="st-name">Team name</label>
            <input id="st-name" className="input" value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="st-short">Short name (header)</label>
            <input id="st-short" className="input" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} maxLength={30} />
          </div>
          <div className="field">
            <label htmlFor="st-tag">Tagline</label>
            <input id="st-tag" className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={140} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!dirty}>
            Save team details
          </button>
        </div>
      </form>
      <div className="field mt-1">
        <span className="field-label">Team logo</span>
        <PhotoPicker
          imageId={s.logoImageId}
          preset={IMAGE_PRESETS.logo}
          label="Team logo"
          onChange={(logoImageId) => commit((d) => actions.updateSettings(d, { logoImageId }), { success: logoImageId ? 'Logo saved.' : 'Logo removed.' }).ok}
        />
        <span className="field-hint">Square images work best. Without a logo, a simple woodball emblem is shown.</span>
      </div>
    </section>
  )
}

function TeamPhotos() {
  const { data, commit, actions } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const upload = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    let added = 0
    for (const file of files) {
      try {
        const imageId = await storeUploadedImage(file, IMAGE_PRESETS.team)
        const res = commit((d) => actions.addTeamPhoto(d, { imageId, caption: '' }))
        if (res.ok) added++
        else await discardImage(imageId)
      } catch (err) {
        toast.error(`${file.name}: ${err.message}`)
      }
    }
    setBusy(false)
    if (added) toast.success(`${added} photo${added === 1 ? '' : 's'} added.`)
  }

  const remove = (p) => {
    const res = commit((d) => actions.removeTeamPhoto(d, p.id), { success: 'Photo removed.' })
    if (res.ok) discardImage(res.value)
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Team photographs</h2>
          <p className="card-sub">The first photo is the homepage banner; the rest appear in the gallery.</p>
        </div>
        <label className="btn btn-primary btn-sm file-label">
          <Icon name="camera" /> {busy ? 'Saving…' : 'Add photos'}
          <input type="file" accept="image/*" multiple onChange={upload} disabled={busy} aria-label="Add team photos" />
        </label>
      </div>
      {data.teamPhotos.length ? (
        <div className="team-photo-list">
          {data.teamPhotos.map((p, i) => (
            <div key={p.id} className="team-photo-item">
              <StoredImage imageId={p.imageId} alt={p.caption || `Team photo ${i + 1}`} fallback={<div className="photo-preview" style={{ width: '100%', aspectRatio: '4/3', height: 'auto' }}>Missing photo</div>} />
              <div className="body">
                {i === 0 && <span className="tag tag-gold">Homepage banner</span>}
                <input
                  className="input"
                  defaultValue={p.caption}
                  placeholder="Caption (optional)"
                  maxLength={140}
                  aria-label={`Caption for photo ${i + 1}`}
                  onBlur={(e) => e.target.value !== p.caption && commit((d) => actions.updateTeamPhoto(d, p.id, { caption: e.target.value }), { success: 'Caption saved.' })}
                />
                <div className="row">
                  <button type="button" className="btn btn-sm btn-icon" onClick={() => commit((d) => actions.moveTeamPhoto(d, p.id, -1))} disabled={i === 0} aria-label="Move earlier">
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon"
                    onClick={() => commit((d) => actions.moveTeamPhoto(d, p.id, 1))}
                    disabled={i === data.teamPhotos.length - 1}
                    aria-label="Move later"
                  >
                    <Icon name="down" />
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(p)}>
                    <Icon name="trash" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small mb-0">No team photos yet.</p>
      )}
    </section>
  )
}

function ScoringRules() {
  const { data, commit, actions } = useData()
  const s = data.settings
  const [form, setForm] = useState(() => ({
    outcomeMetric: s.outcomeMetric,
    liveResults: s.liveResults !== false,
    tieBreakers: s.tieBreakers.map((t) => ({ ...t })),
    minRoundsForRanking: s.minRoundsForRanking,
    maxStrokesPerFairway: s.maxStrokesPerFairway,
  }))
  const move = (i, delta) => {
    const list = [...form.tieBreakers]
    const j = i + delta
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setForm({ ...form, tieBreakers: list })
  }
  const toggle = (i) => setForm({ ...form, tieBreakers: form.tieBreakers.map((t, k) => (k === i ? { ...t, enabled: !t.enabled } : t)) })
  const submit = (e) => {
    e.preventDefault()
    commit((d) => actions.updateSettings(d, form), { success: 'Scoring rules saved. Standings recalculated.' })
  }

  return (
    <section className="card">
      <h2>Scoring rules</h2>
      <p className="small muted">Points are fixed: win 3, draw 1, loss 0. Changing these rules recalculates all standings immediately.</p>
      <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
        <div className="field">
          <span className="field-label">Automatic match result is decided by</span>
          <label className="check">
            <input type="radio" name="metric" checked={form.outcomeMetric === 'average'} onChange={() => setForm({ ...form, outcomeMetric: 'average' })} />
            Average strokes per player round (recommended — fair when groups field different numbers of players)
          </label>
          <label className="check">
            <input type="radio" name="metric" checked={form.outcomeMetric === 'total'} onChange={() => setForm({ ...form, outcomeMetric: 'total' })} />
            Total strokes of all players
          </label>
        </div>

        <div className="field">
          <span className="field-label">Matches in progress</span>
          <label className="check">
            <input type="checkbox" checked={form.liveResults} onChange={(e) => setForm({ ...form, liveResults: e.target.checked })} />
            Show live results — count a match in the standings as soon as scores are entered, marked “live” until every scorecard has all 12
            fairways
          </label>
          <span className="field-hint">When off, a match earns points only once every started scorecard is complete.</span>
        </div>

        <div className="field">
          <span className="field-label">Tie-breakers (applied in this order when points are level)</span>
          <ol className="tiebreak-list">
            {form.tieBreakers.map((t, i) => (
              <li key={t.key}>
                <span className="tiebreak-order">{i + 1}</span>
                <label className="check">
                  <input type="checkbox" checked={t.enabled} onChange={() => toggle(i)} />
                  {TIE_BREAKER_OPTIONS[t.key]}
                </label>
                <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move “${TIE_BREAKER_OPTIONS[t.key]}” up`}>
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-icon"
                  onClick={() => move(i, 1)}
                  disabled={i === form.tieBreakers.length - 1}
                  aria-label={`Move “${TIE_BREAKER_OPTIONS[t.key]}” down`}
                >
                  <Icon name="down" />
                </button>
              </li>
            ))}
          </ol>
          <span className="field-hint">Groups still level after all enabled tie-breakers share the same rank.</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="sr-min">Minimum rounds played to be ranked (rounds in progress count)</label>
            <input
              id="sr-min"
              className="input"
              type="number"
              min="1"
              max="50"
              inputMode="numeric"
              value={form.minRoundsForRanking}
              onChange={(e) => setForm({ ...form, minRoundsForRanking: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="sr-max">Highest score accepted on one fairway</label>
            <input
              id="sr-max"
              className="input"
              type="number"
              min="5"
              max="99"
              inputMode="numeric"
              value={form.maxStrokesPerFairway}
              onChange={(e) => setForm({ ...form, maxStrokesPerFairway: e.target.value })}
            />
            <span className="field-hint">Protects against typing mistakes during score entry.</span>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save scoring rules
          </button>
        </div>
      </form>
    </section>
  )
}

function ScoreInbox() {
  const { data, commit, actions } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const current = data.settings.scoreInboxUrl
  const [url, setUrl] = useState(current)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showScript, setShowScript] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const u = cleanInboxUrl(url)
    if (!isInboxUrl(u)) {
      setError('Paste the web app address from Apps Script. It starts with https://script.google.com/macros/s/ and ends with /exec.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await pingInbox(u)
      if (commit((d) => actions.updateSettings(d, { scoreInboxUrl: u })).ok) {
        setUrl(u)
        toast.success('Score inbox connected. Now publish the results so players’ phones know where to send their cards.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Switch off the score inbox?',
      message: 'After you publish, players can no longer submit cards from their phones. Cards already in your Google Sheet stay there.',
      confirmLabel: 'Switch off',
    })
    if (ok && commit((d) => actions.updateSettings(d, { scoreInboxUrl: '' }), { success: 'Score inbox switched off. Publish to update players’ phones.' }).ok) {
      setUrl('')
    }
  }

  const copyScript = async () => {
    if (await copyText(inboxScript)) toast.success('Script copied. Paste it into Apps Script.')
    else {
      setShowScript(true)
      toast.error('Copying is blocked in this browser. Select the script below and copy it.')
    }
  }

  return (
    <section className="card" id="score-inbox" aria-labelledby="score-inbox-title">
      <h2 id="score-inbox-title">Score inbox — players submit their cards</h2>
      <p className="small">
        One player per playing card keeps score on their phone after each fairway (it works without internet) and taps <strong>Submit</strong> at the end.
        The cards land in a Google Sheet in your Google account — one row per player with F1–F12, which you can download as CSV — and appear in{' '}
        <strong>Admin → Score inbox</strong>, where you accept them and publish. Anyone with the inbox address could send a card, so you check every card
        before accepting it; nothing reaches the website until you publish.
      </p>
      <p className="small">
        Status:{' '}
        {current ? <span className="tag tag-ok">Switched on</span> : <span className="tag">Not set up</span>}
      </p>
      <details className="table-toggle" open={!current}>
        <summary>How to set it up (once, about 10 minutes, on a computer)</summary>
        <ol className="small">
          <li>
            Sign in to Google, then open{' '}
            <a href="https://sheets.new" target="_blank" rel="noreferrer">
              sheets.new
            </a>{' '}
            to create a blank spreadsheet. Name it “Woodball score inbox”.
          </li>
          <li>
            In the spreadsheet, choose <strong>Extensions → Apps Script</strong>. Delete the few lines already there and paste the inbox script:{' '}
            <button type="button" className="btn btn-sm" onClick={copyScript}>
              <Icon name="clipboard" /> Copy the inbox script
            </button>{' '}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowScript((v) => !v)} aria-expanded={showScript}>
              {showScript ? 'Hide' : 'Show'} the script
            </button>
            . Then click the <strong>Save</strong> icon.
          </li>
          <li>
            Click <strong>Deploy → New deployment</strong>. Next to “Select type”, click the gear icon and choose <strong>Web app</strong>. Set{' '}
            <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>, then click <strong>Deploy</strong>.
          </li>
          <li>
            Google asks you to authorize access: choose your account. If it says “Google hasn’t verified this app”, click <strong>Advanced</strong> →{' '}
            <strong>Go to … (unsafe)</strong> → <strong>Allow</strong>. It is your own script, and it can only use this one spreadsheet.
          </li>
          <li>
            Copy the <strong>Web app URL</strong> (it ends in <code>/exec</code>), paste it below and click <strong>Test and save</strong>.
          </li>
          <li>
            <strong>Publish the results.</strong> Players’ phones learn where to send their cards from the published results.
          </li>
        </ol>
        <p className="small muted">
          If you ever paste a newer version of the script, use <strong>Deploy → Manage deployments → Edit → Version: New version</strong> so the address stays
          the same.
        </p>
        {showScript && <textarea className="input script-box" readOnly value={inboxScript} aria-label="Score inbox script" onFocus={(e) => e.target.select()} />}
      </details>
      <form onSubmit={save} noValidate className="mt-1">
        <div className="field">
          <label htmlFor="inbox-url">Web app URL</label>
          <input
            id="inbox-url"
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://script.google.com/macros/s/…/exec"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError('')
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'inbox-url-error' : undefined}
          />
          {error && (
            <span id="inbox-url-error" className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !url.trim() || cleanInboxUrl(url) === current}>
            {busy ? 'Testing…' : 'Test and save'}
          </button>
          {current && (
            <button type="button" className="btn btn-ghost" onClick={remove}>
              Switch off
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

function AdminPassword() {
  return (
    <section className="card">
      <h2>Admin password</h2>
      <p className="small mb-0">
        Signing in needs the coach’s password. To change it, run <code>npm run set-password -- "new password"</code> in the project folder, then commit
        and push (see the README). The password itself is never stored in the code — only a one-way fingerprint of it. Everyone who is signed in will
        need to sign in again after a change.
      </p>
    </section>
  )
}

export default function AdminSettings() {
  useTitle('Settings')
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 0)
    return () => clearTimeout(t)
  }, [hash])
  return (
    <>
      <PageHeader title="Settings" subtitle="Team details, photos, scoring rules, the score inbox and the admin password." />
      <div className="stack">
        <TeamInfo />
        <TeamPhotos />
        <ScoringRules />
        <ScoreInbox />
        <AdminPassword />
      </div>
    </>
  )
}
