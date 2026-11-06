import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, StatTile, ResultBadge, EmptyState, FormStrip, MatchTypeTag } from '../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../components/DateRangeFilter.jsx'
import { PlayerRankingTable } from '../components/tables.jsx'
import { FairwayChart } from '../components/charts.jsx'
import { StoredImage } from '../components/media.jsx'
import { groupStats, formatAvg } from '../lib/stats.js'
import { formatDate } from '../lib/dates.js'
import ExportButtons from '../components/ExportButtons.jsx'

export default function GroupDetail() {
  const { groupId } = useParams()
  const { data } = useData()
  const { groupsById } = useLookups()
  const { isAdmin } = useAdmin()
  const group = groupsById[groupId]
  useTitle(group?.name || 'Group')
  const filter = useDateRange()
  const { range } = filter
  const stats = useMemo(() => (group ? groupStats(data, groupId, range) : null), [data, groupId, range, group])

  if (!group) {
    return <EmptyState title="Group not found" action={<Link to="/groups" className="btn">All groups</Link>} />
  }
  const s = stats.standing

  return (
    <>
      <PageHeader
        back={{ to: '/groups', label: 'Groups' }}
        title={
          <span className="row" style={{ gap: 10 }}>
            <span className="group-dot" style={{ background: group.color, width: 16, height: 16 }} aria-hidden="true" />
            {group.name}
          </span>
        }
        subtitle={group.description || `${stats.activeMembers} active players`}
        actions={
          <>
            <ExportButtons kind="group" groupId={group.id} range={range} />
            {isAdmin && (
              <Link to="/admin/groups" className="btn btn-sm">
                Edit group
              </Link>
            )}
          </>
        }
      />
      {group.photoId && (
        <div className="card card-flush" style={{ marginBottom: 16 }}>
          <StoredImage imageId={group.photoId} alt={`${group.name} photo`} className="group-photo" />
        </div>
      )}
      <DateRangeFilter state={filter} />

      <div className="stack">
        <section className="stat-grid" aria-label="Group totals">
          <StatTile label="Rank" value={s?.rank ?? '–'} note={`${s?.points ?? 0} points`} />
          <StatTile label="Record (W-D-L)" value={`${s?.won ?? 0}-${s?.drawn ?? 0}-${s?.lost ?? 0}`} note={`${s?.played ?? 0} matches decided`} />
          <StatTile label="Average strokes" value={formatAvg(stats.avgStrokes)} note={`per round · ${stats.fairwaysPlayed} fairways played`} />
          <StatTile label="Best round" value={stats.bestRound?.total ?? '—'} note={stats.bestRound ? formatDate(stats.bestRound.date) : 'no rounds yet'} />
        </section>

        <div className="grid-2">
          <section className="card card-flush">
            <div className="card-header">
              <h2>Match log</h2>
              <FormStrip form={s?.form} />
            </div>
            {stats.matchLog.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Match</th>
                      <th className="num">Avg</th>
                      <th className="center">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.matchLog.map(({ match, outcome, result, metrics }) => (
                      <tr key={match.id}>
                        <td className="nowrap">{formatDate(match.date)}</td>
                        <td>
                          <Link to={`/matches/${match.id}`}>{match.title || 'Match'}</Link> <MatchTypeTag match={match} />
                        </td>
                        <td className="num">{formatAvg(metrics?.avgStrokes)}</td>
                        <td className="center">
                          {outcome.status === 'practice' ? <span className="muted small">—</span> : <ResultBadge result={result} live={outcome.status === 'live'} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No matches in this period" />
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Fairway averages</h2>
                <p className="card-sub">Average strokes on each fairway by group members</p>
              </div>
            </div>
            <FairwayChart averages={stats.fairwayAverages} color={group.color} />
          </section>
        </div>

        <section className="card card-flush">
          <div className="card-header">
            <h2>Players</h2>
            <span className="small muted">{stats.members.length} registered</span>
          </div>
          <PlayerRankingTable rows={stats.playerRows} groupsById={groupsById} showGroup={false} showUnranked />
        </section>
      </div>
    </>
  )
}
