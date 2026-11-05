import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData, useLookups } from '../../state/DataContext.jsx'
import { useToast, useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, GroupBadge, EmptyState } from '../../components/common.jsx'
import { PlayerAvatar, PhotoPicker } from '../../components/media.jsx'
import Modal from '../../components/Modal.jsx'
import Icon from '../../components/Icons.jsx'
import { usePlayerFilters, PlayerFilterBar } from '../Players.jsx'
import { discardImage } from '../../state/images.jsx'
import { IMAGE_PRESETS } from '../../lib/images.js'

const EMPTY = { name: '', groupId: '', role: '', studentNo: '', notes: '', active: true, photoId: null }

function PlayerForm({ player, onDone }) {
  const { data, commit, actions } = useData()
  const isNew = !player
  const [form, setForm] = useState(() => (player ? { ...EMPTY, ...player, groupId: player.groupId || '' } : { ...EMPTY, groupId: data.groups[0]?.id || '' }))
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    const input = { name: form.name, groupId: form.groupId || null, role: form.role, studentNo: form.studentNo, notes: form.notes, active: form.active }
    const res = isNew
      ? commit((d) => actions.addPlayer(d, { ...input, photoId: form.photoId }), { success: `${form.name.trim()} registered.`, quiet: true })
      : commit((d) => actions.updatePlayer(d, player.id, input), { success: 'Player updated.', quiet: true })
    if (res.ok) onDone()
    else setError(res.error || 'Could not save.')
  }

  const cancel = async () => {
    if (isNew && form.photoId) await discardImage(form.photoId) // photo chosen for a player that was never created
    onDone()
  }

  // Existing player: photo changes save immediately. New player: kept with the form.
  const onPhoto = async (photoId) => {
    if (isNew) {
      setForm((f) => ({ ...f, photoId }))
      return true
    }
    return commit((d) => actions.updatePlayer(d, player.id, { photoId }), { success: photoId ? 'Photo saved.' : 'Photo removed.' }).ok
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="pf-name">Full name *</label>
          <input
            id="pf-name"
            className="input"
            value={form.name}
            onChange={(e) => {
              set('name')(e)
              setError('')
            }}
            required
            maxLength={120}
            autoFocus
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'pf-error' : undefined}
          />
          {error && (
            <span id="pf-error" className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="pf-group">Group</label>
          <select id="pf-group" className="select" value={form.groupId} onChange={set('groupId')}>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="">Unassigned</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-role">Role (optional)</label>
          <input id="pf-role" className="input" value={form.role} onChange={set('role')} placeholder="e.g. Captain" maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="pf-sn">Student / registration no. (optional)</label>
          <input id="pf-sn" className="input" value={form.studentNo} onChange={set('studentNo')} maxLength={40} />
        </div>
        <div className="field">
          <span className="field-label">Status</span>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={set('active')} /> Active player
          </label>
        </div>
        <div className="field full">
          <span className="field-label">Photo</span>
          <PhotoPicker imageId={isNew ? form.photoId : player.photoId} onChange={onPhoto} preset={IMAGE_PRESETS.player} label="Player photo" />
          <span className="field-hint">Photos are resized and stored on this device only.</span>
        </div>
        <div className="field full">
          <label htmlFor="pf-notes">Notes (optional)</label>
          <textarea id="pf-notes" className="textarea" value={form.notes} onChange={set('notes')} maxLength={1000} />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {isNew ? 'Register player' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

export default function AdminPlayers() {
  useTitle('Manage players')
  const { data, commit, actions } = useData()
  const { groupsById } = useLookups()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const filters = usePlayerFilters()
  const [selected, setSelected] = useState(() => new Set())
  const [bulkGroup, setBulkGroup] = useState('')

  const editId = params.get('edit')
  const creating = params.get('new') === '1'
  const editing = editId ? data.players.find((p) => p.id === editId) : null
  const closeForm = () => setParams({}, { replace: true })

  // Players that left the list (deleted) should not stay selected.
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => data.players.some((p) => p.id === id))))
  }, [data.players])

  const list = filters.apply(data.players).sort((a, b) => a.name.localeCompare(b.name))
  const allSelected = list.length > 0 && list.every((p) => selected.has(p.id))
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))

  const bulkAssign = () => {
    const ids = [...selected]
    const name = bulkGroup ? groupsById[bulkGroup]?.name : 'Unassigned'
    const res = commit((d) => actions.assignPlayers(d, ids, bulkGroup || null), { success: `${ids.length} player(s) moved to ${name}.` })
    if (res.ok) setSelected(new Set())
  }
  const bulkActive = (active) => {
    const ids = [...selected]
    const res = commit(
      (d) => {
        for (const id of ids) actions.updatePlayer(d, id, { active })
      },
      { success: `${ids.length} player(s) marked ${active ? 'active' : 'inactive'}.` },
    )
    if (res.ok) setSelected(new Set())
  }

  const remove = async (p) => {
    const scores = actions.countPlayerScores(data, p.id)
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: (
        <>
          <p>This permanently removes the player{scores ? ` and ${scores} recorded round score(s)` : ''}. Match results will be recalculated.</p>
          {scores > 0 && <p>To keep their history, mark them <strong>inactive</strong> instead.</p>}
        </>
      ),
      confirmLabel: 'Delete permanently',
      danger: true,
    })
    if (!ok) return
    const res = commit((d) => actions.deletePlayer(d, p.id), { success: `${p.name} deleted.` })
    if (res.ok && res.value) discardImage(res.value)
  }

  return (
    <>
      <PageHeader
        title="Players"
        subtitle={`${data.players.length} registered · ${data.players.filter((p) => p.active).length} active`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
            <Icon name="plus" /> Register player
          </button>
        }
      />
      <PlayerFilterBar filters={filters} groups={data.groups} />

      {selected.size > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <strong>{selected.size} selected</strong>
            <select className="select" style={{ width: 'auto' }} value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} aria-label="Group to move selected players to">
              <option value="">Unassigned</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-primary" onClick={bulkAssign}>
              Move to group
            </button>
            <button type="button" className="btn btn-sm" onClick={() => bulkActive(true)}>
              Mark active
            </button>
            <button type="button" className="btn btn-sm" onClick={() => bulkActive(false)}>
              Mark inactive
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      <section className="card card-flush">
        {list.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all listed players" style={{ width: 20, height: 20 }} />
                  </th>
                  <th>Player</th>
                  <th>Group</th>
                  <th>Status</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} style={{ width: 20, height: 20 }} />
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <PlayerAvatar player={p} group={groupsById[p.groupId]} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <Link to={`/players/${p.id}`}>{p.name}</Link>
                          <div className="tiny muted">
                            {p.role && `${p.role} · `}ID {p.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <GroupBadge group={groupsById[p.groupId]} />
                    </td>
                    <td>{p.active ? <span className="tag tag-ok">Active</span> : <span className="tag">Inactive</span>}</td>
                    <td className="num nowrap">
                      <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setParams({ edit: p.id })} aria-label={`Edit ${p.name}`}>
                        <Icon name="edit" />
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="🔍" title="No players match these filters" />
        )}
      </section>

      <Modal open={creating || Boolean(editing)} onClose={closeForm} title={editing ? `Edit ${editing.name}` : 'Register a player'} wide>
        {(creating || editing) && <PlayerForm key={editing?.id || 'new'} player={editing} onDone={closeForm} />}
      </Modal>
    </>
  )
}
