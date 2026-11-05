import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import { useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader } from '../../components/common.jsx'
import { PhotoPicker } from '../../components/media.jsx'
import Modal from '../../components/Modal.jsx'
import Icon from '../../components/Icons.jsx'
import { GROUP_COLORS, GROUP_COLOR_NAMES, nextGroupColor } from '../../lib/colors.js'
import { IMAGE_PRESETS } from '../../lib/images.js'
import { discardImage } from '../../state/images.jsx'

function ColorPicker({ value, onChange, usedBy }) {
  return (
    <div className="chip-group" role="radiogroup" aria-label="Group colour">
      {GROUP_COLORS.map((c) => (
        <label key={c} className={`chip ${value === c ? 'selected' : ''}`} title={usedBy[c] ? `Used by ${usedBy[c]}` : GROUP_COLOR_NAMES[c]}>
          <input type="radio" name="group-color" value={c} checked={value === c} onChange={() => onChange(c)} />
          <span className="group-dot" style={{ background: c, width: 14, height: 14 }} aria-hidden="true" />
          {GROUP_COLOR_NAMES[c]}
          {usedBy[c] && <span className="tiny">· {usedBy[c]}</span>}
        </label>
      ))}
    </div>
  )
}

function GroupForm({ group, onDone }) {
  const { data, commit, actions } = useData()
  const isNew = !group
  const [form, setForm] = useState(() => ({
    name: group?.name || '',
    description: group?.description || '',
    color: group?.color || nextGroupColor(data.groups),
  }))
  const [error, setError] = useState('')
  const usedBy = Object.fromEntries(data.groups.filter((g) => g.id !== group?.id).map((g) => [g.color, g.name]))

  const submit = (e) => {
    e.preventDefault()
    const res = isNew
      ? commit((d) => actions.addGroup(d, form), { success: `${form.name.trim()} created.`, quiet: true })
      : commit((d) => actions.updateGroup(d, group.id, form), { success: 'Group updated.', quiet: true })
    if (res.ok) onDone()
    else setError(res.error || 'Could not save.')
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label htmlFor="gf-name">Group name *</label>
        <input
          id="gf-name"
          className="input"
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }))
            setError('')
          }}
          maxLength={60}
          autoFocus
          aria-invalid={Boolean(error)}
        />
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="field">
        <span className="field-label">Colour (used in every chart)</span>
        <ColorPicker value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} usedBy={usedBy} />
        <span className="field-hint">Give each group its own colour so charts stay easy to read.</span>
      </div>
      <div className="field">
        <label htmlFor="gf-desc">Description (optional)</label>
        <textarea id="gf-desc" className="textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} />
      </div>
      {!isNew && (
        <div className="field">
          <span className="field-label">Group photo</span>
          <PhotoPicker
            imageId={group.photoId}
            preset={IMAGE_PRESETS.team}
            label="Group photo"
            onChange={(photoId) => commit((d) => actions.updateGroup(d, group.id, { photoId }), { success: photoId ? 'Photo saved.' : 'Photo removed.' }).ok}
          />
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {isNew ? 'Create group' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

export default function AdminGroups() {
  useTitle('Manage groups')
  const { data, commit, actions } = useData()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(null) // group id, 'new' or null
  const group = editing && editing !== 'new' ? data.groups.find((g) => g.id === editing) : null

  const remove = async (g) => {
    const ok = await confirm({ title: `Delete ${g.name}?`, message: 'The group will be removed. This cannot be undone.', confirmLabel: 'Delete group', danger: true })
    if (!ok) return
    const res = commit((d) => actions.deleteGroup(d, g.id), { success: `${g.name} deleted.` })
    if (res.ok && res.value) discardImage(res.value)
  }

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Create groups, set their colours and move players between them."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> New group
          </button>
        }
      />
      <div className="grid-3">
        {data.groups.map((g) => {
          const members = data.players.filter((p) => p.groupId === g.id)
          const matches = data.matches.filter((m) => m.groupIds.includes(g.id)).length
          return (
            <section key={g.id} className="card" style={{ borderTop: `4px solid ${g.color}` }}>
              <div className="row-between">
                <h2 className="mb-0">{g.name}</h2>
                <span className="tag">{GROUP_COLOR_NAMES[g.color]}</span>
              </div>
              {g.description && <p className="small muted mt-1">{g.description}</p>}
              <p className="small mt-1">
                {members.filter((p) => p.active).length} active · {members.length} total players · {matches} match{matches === 1 ? '' : 'es'}
              </p>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setEditing(g.id)}>
                  <Icon name="edit" /> Edit
                </button>
                <Link to={`/groups/${g.id}`} className="btn btn-sm btn-ghost">
                  View
                </Link>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(g)} disabled={members.length > 0 || matches > 0} title={members.length || matches ? 'Move its players and remove its matches first' : 'Delete group'}>
                  <Icon name="trash" /> Delete
                </button>
              </div>
            </section>
          )
        })}
      </div>
      <p className="small muted mt-2">
        To move players between groups, use <Link to="/admin/players">Players</Link> — select players, choose a group and press “Move to group”. Past scores stay
        with the group a player represented at the time.
      </p>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={group ? `Edit ${group.name}` : 'New group'} wide>
        {editing && <GroupForm key={editing} group={group} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  )
}
