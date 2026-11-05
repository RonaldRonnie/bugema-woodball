import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useData, useLookups } from '../../state/DataContext.jsx'
import { useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, EmptyState, Banner } from '../../components/common.jsx'
import { todayISO } from '../../lib/dates.js'
import { countScoresForPlayers } from '../../state/actions.js'

function autoTitle(type, groupIds, groupsById) {
  const names = groupIds.map((g) => groupsById[g]?.name).filter(Boolean)
  return type === 'practice' ? `Practice — ${names.join(' & ')}` : names.join(' vs ')
}

export default function MatchEditor() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { data, commit, actions } = useData()
  const { groupsById } = useLookups()
  const confirm = useConfirm()
  const existing = matchId ? data.matches.find((m) => m.id === matchId) : null
  const isNew = !matchId
  useTitle(isNew ? 'Record a match' : 'Edit match')

  const [form, setForm] = useState(() =>
    existing
      ? {
          date: existing.date,
          type: existing.type,
          groupIds: existing.groupIds,
          participants: existing.participants,
          title: existing.title,
          venue: existing.venue,
          notes: existing.notes,
          outcomeMode: existing.outcomeMode,
          manualResults: existing.manualResults || {},
        }
      : {
          date: todayISO(),
          type: 'match',
          groupIds: [],
          participants: [],
          title: '',
          venue: '',
          notes: '',
          outcomeMode: 'auto',
          manualResults: {},
        },
  )
  const [error, setError] = useState('')
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setError('')
  }

  const inLineup = useMemo(() => new Set(form.participants.map((p) => p.playerId)), [form.participants])

  if (matchId && !existing) {
    return <EmptyState title="Match not found" action={<Link to="/admin/matches" className="btn">Back to matches</Link>} />
  }

  const toggleGroup = (gid) => {
    const on = form.groupIds.includes(gid)
    const groupIds = on ? form.groupIds.filter((g) => g !== gid) : [...form.groupIds, gid]
    let participants = form.participants.filter((p) => groupIds.includes(p.groupId))
    if (!on && isNew) {
      // Newly selected group: start with all its active players in the line-up.
      participants = [...participants, ...data.players.filter((p) => p.groupId === gid && p.active).map((p) => ({ playerId: p.id, groupId: gid }))]
    }
    set({ groupIds, participants })
  }

  const togglePlayer = (playerId, groupId) => {
    set({
      participants: inLineup.has(playerId) ? form.participants.filter((p) => p.playerId !== playerId) : [...form.participants, { playerId, groupId }],
    })
  }

  const setAll = (gid, on) => {
    const others = form.participants.filter((p) => p.groupId !== gid)
    const members = on ? data.players.filter((p) => p.groupId === gid && p.active).map((p) => ({ playerId: p.id, groupId: gid })) : []
    set({ participants: [...others, ...members] })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (form.type === 'match' && form.groupIds.length < 2) return setError('Choose at least two groups for a competitive match, or switch to Practice.')
    if (!form.groupIds.length) return setError('Choose at least one group.')
    if (!form.participants.length) return setError('Select the players taking part.')
    if (form.type === 'match' && form.outcomeMode === 'manual' && form.groupIds.some((g) => !form.manualResults[g])) {
      return setError('Choose a result (win, draw or loss) for every group, or use the automatic result.')
    }

    if (existing) {
      const removed = existing.participants.filter((p) => !inLineup.has(p.playerId)).map((p) => p.playerId)
      const lost = countScoresForPlayers(existing, removed)
      if (
        lost &&
        !(await confirm({
          title: 'Remove scores?',
          message: `${removed.length} player(s) left the line-up. Their ${lost} recorded round score(s) in this match will be deleted.`,
          confirmLabel: 'Remove and save',
          danger: true,
        }))
      ) {
        return
      }
    }

    const input = { ...form, title: form.title.trim() || autoTitle(form.type, form.groupIds, groupsById) }
    const res = existing
      ? commit((d) => actions.updateMatch(d, existing.id, input), { success: 'Match details saved.', quiet: true })
      : commit((d) => actions.createMatch(d, input), { success: 'Match created — now enter the scores.', quiet: true })
    if (!res.ok) return setError(res.error)
    navigate(existing ? `/admin/matches` : `/admin/matches/${res.value}/scores`)
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this match?',
      message: 'The match and all its round scores will be deleted. Standings will be recalculated.',
      confirmLabel: 'Delete match',
      danger: true,
    })
    if (ok && commit((d) => actions.deleteMatch(d, existing.id), { success: 'Match deleted.' }).ok) navigate('/admin/matches')
  }

  return (
    <>
      <PageHeader back={{ to: '/admin/matches', label: 'Matches' }} title={isNew ? 'Record a match' : 'Edit match details'} subtitle="Rounds and fairway scores are entered on the next screen." />
      <form onSubmit={submit} noValidate className="stack">
        <section className="card">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="me-date">Match date *</label>
              <input id="me-date" type="date" className="input" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
            </div>
            <div className="field">
              <span className="field-label">Session type</span>
              <div className="segmented" role="group" aria-label="Session type">
                <button type="button" aria-pressed={form.type === 'match'} onClick={() => set({ type: 'match' })}>
                  Competitive match
                </button>
                <button type="button" aria-pressed={form.type === 'practice'} onClick={() => set({ type: 'practice' })}>
                  Practice
                </button>
              </div>
              <span className="field-hint">{form.type === 'match' ? 'Awards points (W 3 · D 1 · L 0).' : 'Counts for statistics, no points.'}</span>
            </div>
            <div className="field full">
              <span className="field-label">Participating groups *</span>
              <div className="chip-group">
                {data.groups.map((g) => (
                  <button key={g.id} type="button" className="chip" aria-pressed={form.groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>
                    <span className="group-dot" style={{ background: g.color }} aria-hidden="true" />
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="me-title">Title (optional)</label>
              <input
                id="me-title"
                className="input"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder={form.groupIds.length ? autoTitle(form.type, form.groupIds, groupsById) : 'e.g. Inter-group league, week 3'}
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="me-venue">Venue (optional)</label>
              <input id="me-venue" className="input" value={form.venue} onChange={(e) => set({ venue: e.target.value })} maxLength={120} />
            </div>
          </div>
        </section>

        {form.groupIds.length > 0 && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Line-up</h2>
                <p className="card-sub">{form.participants.length} players selected. Only selected players get score cards.</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              {form.groupIds.map((gid) => {
                const g = groupsById[gid]
                const members = data.players
                  .filter((p) => (p.groupId === gid && p.active) || form.participants.some((x) => x.playerId === p.id && x.groupId === gid))
                  .sort((a, b) => a.name.localeCompare(b.name))
                const count = form.participants.filter((p) => p.groupId === gid).length
                return (
                  <div key={gid} className="lineup-group">
                    <div className="lineup-group-head">
                      <span className="row" style={{ gap: 6 }}>
                        <span className="group-dot" style={{ background: g?.color }} aria-hidden="true" />
                        {g?.name} · {count}
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAll(gid, true)}>
                          All
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAll(gid, false)}>
                          None
                        </button>
                      </span>
                    </div>
                    <div className="lineup-players">
                      {members.length ? (
                        members.map((p) => (
                          <label key={p.id} className="check">
                            <input type="checkbox" checked={inLineup.has(p.id)} onChange={() => togglePlayer(p.id, gid)} />
                            <span>
                              {p.name}
                              {!p.active && <span className="tag" style={{ marginLeft: 6 }}>Inactive</span>}
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="small muted">No active players in this group.</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {form.type === 'match' && form.groupIds.length >= 2 && (
          <section className="card">
            <h2>Match outcome</h2>
            <div className="segmented" role="group" aria-label="How the outcome is decided">
              <button type="button" aria-pressed={form.outcomeMode === 'auto'} onClick={() => set({ outcomeMode: 'auto' })}>
                Automatic from scores
              </button>
              <button type="button" aria-pressed={form.outcomeMode === 'manual'} onClick={() => set({ outcomeMode: 'manual' })}>
                Set manually
              </button>
            </div>
            {form.outcomeMode === 'auto' ? (
              <p className="small muted mt-1 mb-0">
                The group with the lowest {data.settings.outcomeMetric === 'total' ? 'total strokes' : 'average strokes per player round'} wins; level groups
                draw. Decided once every group has at least one complete round.
              </p>
            ) : (
              <div className="form-grid mt-1">
                {form.groupIds.map((gid) => (
                  <div key={gid} className="field">
                    <label htmlFor={`res-${gid}`}>{groupsById[gid]?.name}</label>
                    <select
                      id={`res-${gid}`}
                      className="select"
                      value={form.manualResults[gid] || ''}
                      onChange={(e) => set({ manualResults: { ...form.manualResults, [gid]: e.target.value } })}
                    >
                      <option value="">Choose…</option>
                      <option value="W">Win (3 pts)</option>
                      <option value="D">Draw (1 pt)</option>
                      <option value="L">Loss (0 pts)</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="card">
          <div className="field">
            <label htmlFor="me-notes">Notes (optional)</label>
            <textarea id="me-notes" className="textarea" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} placeholder="Weather, course conditions, remarks…" />
          </div>
        </section>

        {error && <Banner kind="danger">{error}</Banner>}
        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            {existing && (
              <button type="button" className="btn btn-ghost" onClick={remove} style={{ color: 'var(--danger)' }}>
                Delete match
              </button>
            )}
          </div>
          <div className="row">
            <Link to="/admin/matches" className="btn btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary">
              {isNew ? 'Create match & enter scores' : 'Save details'}
            </button>
          </div>
        </div>
      </form>
    </>
  )
}
