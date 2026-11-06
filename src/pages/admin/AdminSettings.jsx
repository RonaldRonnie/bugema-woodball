import { useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useToast } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader } from '../../components/common.jsx'
import { PhotoPicker, StoredImage } from '../../components/media.jsx'
import Icon from '../../components/Icons.jsx'
import { TIE_BREAKER_OPTIONS } from '../../data/defaults.js'
import { IMAGE_PRESETS } from '../../lib/images.js'
import { storeUploadedImage, discardImage } from '../../state/images.jsx'

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
            <label htmlFor="sr-min">Minimum completed rounds to be ranked</label>
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
  return (
    <>
      <PageHeader title="Settings" subtitle="Team details, photos, scoring rules and the admin password." />
      <div className="stack">
        <TeamInfo />
        <TeamPhotos />
        <ScoringRules />
        <AdminPassword />
      </div>
    </>
  )
}
