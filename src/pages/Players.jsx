import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, GroupBadge, EmptyState } from '../components/common.jsx'
import { PlayerAvatar } from '../components/media.jsx'
import { allPlayerStats, formatAvg } from '../lib/stats.js'

export function usePlayerFilters() {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [status, setStatus] = useState('active')
  const apply = (players) => {
    const q = query.trim().toLowerCase()
    return players.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.studentNo || '').toLowerCase().includes(q)) &&
        (group === 'all' || (group === 'none' ? !p.groupId : p.groupId === group)) &&
        (status === 'all' || (status === 'active' ? p.active : !p.active)),
    )
  }
  return { query, setQuery, group, setGroup, status, setStatus, apply }
}

export function PlayerFilterBar({ filters, groups }) {
  return (
    <div className="filter-bar">
      <div className="row">
        <input
          className="input"
          type="search"
          placeholder="Search players…"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          aria-label="Search players by name"
        />
        <select className="select" style={{ width: 'auto', flex: '1 1 140px' }} value={filters.group} onChange={(e) => filters.setGroup(e.target.value)} aria-label="Filter by group">
          <option value="all">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="none">Unassigned</option>
        </select>
        <select className="select" style={{ width: 'auto', flex: '1 1 120px' }} value={filters.status} onChange={(e) => filters.setStatus(e.target.value)} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
      </div>
    </div>
  )
}

export default function Players() {
  useTitle('Players')
  const { data } = useData()
  const { groupsById } = useLookups()
  const filters = usePlayerFilters()
  const stats = useMemo(() => Object.fromEntries(allPlayerStats(data).map((r) => [r.player.id, r])), [data])
  const list = filters.apply(data.players).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader title="Players" subtitle={`${data.players.filter((p) => p.active).length} active of ${data.players.length} registered`} />
      <PlayerFilterBar filters={filters} groups={data.groups} />
      <section className="card card-flush">
        {list.length ? (
          <ul className="list">
            {list.map((p) => {
              const s = stats[p.id]
              return (
                <li key={p.id}>
                  <Link to={`/players/${p.id}`} className="list-item">
                    <PlayerAvatar player={p} group={groupsById[p.groupId]} size={44} />
                    <div className="list-main">
                      <div className="list-title">{p.name}</div>
                      <div className="list-meta">
                        <GroupBadge group={groupsById[p.groupId]} />
                        {p.role && <span className="tag tag-gold">{p.role}</span>}
                        {!p.active && <span className="tag">Inactive</span>}
                      </div>
                    </div>
                    <div className="list-end">
                      <div className="strong num">{formatAvg(s?.avgStrokes)}</div>
                      <div className="tiny muted">
                        avg · {s?.roundsPlayed || 0} rd{s?.roundsPlayed === 1 ? '' : 's'}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon="🔍" title="No players match">
            Try a different name, group or status.
          </EmptyState>
        )}
      </section>
    </>
  )
}
