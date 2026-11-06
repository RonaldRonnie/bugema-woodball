import { Link } from 'react-router-dom'
import Icon from './Icons.jsx'
import { FAIRWAY_COUNT } from '../lib/scoring.js'

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <>
      {back && (
        <Link className="back-link" to={back.to}>
          <Icon name="back" width="16" height="16" /> {back.label}
        </Link>
      )}
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  )
}

export function StatTile({ label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export function GroupBadge({ group, link = false }) {
  if (!group) return <span className="group-badge muted">Unassigned</span>
  const content = (
    <>
      <span className="group-dot" style={{ background: group.color }} aria-hidden="true" />
      {group.name}
    </>
  )
  return link ? (
    <Link to={`/groups/${group.id}`} className="group-badge">
      {content}
    </Link>
  ) : (
    <span className="group-badge">{content}</span>
  )
}

const RESULT_LABEL = { W: 'Win', D: 'Draw', L: 'Loss' }

/** W / D / L badge. `live` marks a provisional result of a match still in progress. */
export function ResultBadge({ result, live = false }) {
  if (!result) return <span className="result result-pending" title="Result pending">…</span>
  const label = `${RESULT_LABEL[result]}${live ? ', live — match in progress' : ''}`
  return (
    <span className={`result result-${result}${live ? ' result-live' : ''}`} title={label}>
      {result}
      <span className="sr-only"> ({label})</span>
    </span>
  )
}

export function LiveTag() {
  return (
    <span className="tag tag-live" title="Match in progress — result can still change">
      <span className="live-dot" aria-hidden="true" /> Live
    </span>
  )
}

export function FormStrip({ form }) {
  if (!form?.length) return <span className="muted small">—</span>
  const items = form.map((f) => (typeof f === 'string' ? { result: f, live: false } : f))
  return (
    <span className="form-strip" aria-label={`Recent form: ${items.map((f) => RESULT_LABEL[f.result] + (f.live ? ' (live)' : '')).join(', ')}`}>
      {items.map((f, i) => (
        <ResultBadge key={i} result={f.result} live={f.live} />
      ))}
    </span>
  )
}

export function EmptyState({ icon = '⛳', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Banner({ kind = 'info', children, icon }) {
  const glyph = icon || { info: 'i', warning: '!', danger: '!', success: '✓' }[kind]
  return (
    <div className={`banner banner-${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <span className="banner-icon" aria-hidden="true">
        {glyph}
      </span>
      <div>{children}</div>
    </div>
  )
}

/** Compact read-only row of the 12 fairway scores. */
export function FairwayStrip({ fairways }) {
  const list = fairways || Array(FAIRWAY_COUNT).fill(null)
  return (
    <div className="fw-strip" role="list" aria-label="Fairway scores">
      {list.map((v, i) => (
        <span key={i} role="listitem" className={v == null ? 'fw-empty' : ''} title={`Fairway ${i + 1}`}>
          {v ?? '·'}
        </span>
      ))}
    </div>
  )
}

export function MatchTypeTag({ match }) {
  return match.type === 'practice' ? <span className="tag">Practice</span> : <span className="tag tag-navy">Match</span>
}
