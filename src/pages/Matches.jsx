import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, EmptyState } from '../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../components/DateRangeFilter.jsx'
import { MatchRow } from '../components/tables.jsx'
import Icon from '../components/Icons.jsx'
import { matchesInRange, sortMatches } from '../lib/scoring.js'
import { formatDate } from '../lib/dates.js'

/** Matches grouped by date, newest first. */
export function useMatchList(range, { group = 'all', type = 'all' } = {}) {
  const { data } = useData()
  return useMemo(() => {
    const list = sortMatches(matchesInRange(data.matches, range), 'desc').filter(
      (m) => (group === 'all' || m.groupIds.includes(group)) && (type === 'all' || m.type === type),
    )
    const days = []
    for (const m of list) {
      const last = days[days.length - 1]
      if (last && last.date === m.date) last.matches.push(m)
      else days.push({ date: m.date, matches: [m] })
    }
    for (const d of days) d.matches.reverse() // first game of the day on top
    return { list, days }
  }, [data.matches, range, group, type])
}

export default function Matches() {
  useTitle('Matches')
  const { data } = useData()
  const { groupsById } = useLookups()
  const { isAdmin } = useAdmin()
  const filter = useDateRange()
  const [group, setGroup] = useState('all')
  const [type, setType] = useState('all')
  const { list, days } = useMatchList(filter.range, { group, type })

  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${list.length} session${list.length === 1 ? '' : 's'} in this period`}
        actions={
          isAdmin && (
            <Link to="/admin/matches/new" className="btn btn-primary btn-sm">
              <Icon name="plus" /> Record a match
            </Link>
          )
        }
      />
      <DateRangeFilter state={filter} />
      <div className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filter by group">
          <option value="all">All groups</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by session type">
          <option value="all">Matches and practice</option>
          <option value="match">Competitive matches</option>
          <option value="practice">Practice sessions</option>
        </select>
      </div>

      {days.length ? (
        <div className="stack">
          {days.map((d) => (
            <section key={d.date} className="card card-flush">
              <div className="card-header">
                <h2 style={{ fontSize: '1rem' }}>{formatDate(d.date, { weekday: true })}</h2>
                <span className="small muted">
                  {d.matches.length} session{d.matches.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="list">
                {d.matches.map((m) => (
                  <MatchRow key={m.id} match={m} data={data} groupsById={groupsById} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No matches in this period">
            {isAdmin ? 'Use “Record a match” to add results.' : 'Results appear here once the coach records them.'}
          </EmptyState>
        </div>
      )}
    </>
  )
}
