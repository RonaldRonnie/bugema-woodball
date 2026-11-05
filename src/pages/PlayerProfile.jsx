import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { StatTile, GroupBadge, EmptyState } from '../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../components/DateRangeFilter.jsx'
import { PlayerTrendChart, FairwayChart } from '../components/charts.jsx'
import { PlayerAvatar } from '../components/media.jsx'
import ExportButtons from '../components/ExportButtons.jsx'
import Icon from '../components/Icons.jsx'
import { playerStats, allPlayerStats, formatAvg } from '../lib/stats.js'
import { formatDate } from '../lib/dates.js'
import { FAIRWAY_COUNT } from '../lib/scoring.js'

export default function PlayerProfile() {
  const { playerId } = useParams()
  const { data } = useData()
  const { groupsById } = useLookups()
  const { isAdmin } = useAdmin()
  const player = data.players.find((p) => p.id === playerId)
  useTitle(player?.name || 'Player')
  const filter = useDateRange()
  const { range } = filter

  const stats = useMemo(() => (player ? playerStats(data, playerId, range) : null), [data, playerId, range, player])
  const rank = useMemo(() => allPlayerStats(data, range).find((r) => r.player.id === playerId)?.rank ?? null, [data, range, playerId])

  if (!player) {
    return <EmptyState title="Player not found" action={<Link to="/players" className="btn">All players</Link>} />
  }
  const group = groupsById[player.groupId]
  const history = [...stats.history].reverse() // newest first

  return (
    <>
      <Link className="back-link" to="/players">
        <Icon name="back" width="16" height="16" /> Players
      </Link>
      <div className="player-head">
        <PlayerAvatar player={player} group={group} size={88} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{player.name}</h1>
          <div className="row">
            <GroupBadge group={group} link />
            {player.role && <span className="tag tag-gold">{player.role}</span>}
            {!player.active && <span className="tag">Inactive</span>}
            {player.studentNo && <span className="tag">{player.studentNo}</span>}
          </div>
        </div>
      </div>
      <div className="page-actions" style={{ marginBottom: 16 }}>
        <ExportButtons kind="player" playerId={player.id} range={range} />
        {isAdmin && (
          <Link to={`/admin/players?edit=${player.id}`} className="btn btn-sm">
            <Icon name="edit" /> Edit player
          </Link>
        )}
      </div>

      <DateRangeFilter state={filter} />

      <div className="stack">
        <section className="stat-grid" aria-label="Player statistics">
          <StatTile label="Matches played" value={stats.matchesPlayed} note={rank ? `Team rank #${rank}` : 'Not ranked yet'} />
          <StatTile
            label="Rounds completed"
            value={stats.roundsCompleted}
            note={stats.incompleteRounds ? `${stats.incompleteRounds} incomplete` : '12 fairways each'}
          />
          <StatTile label="Total strokes" value={stats.totalStrokes} note="completed rounds" />
          <StatTile label="Average per round" value={formatAvg(stats.avgStrokes)} note="lower is better" />
          <StatTile
            label="Best round"
            value={stats.bestRound?.total ?? '—'}
            note={stats.bestRound ? `${formatDate(stats.bestRound.date)} · R${stats.bestRound.roundNumber}` : 'no rounds yet'}
          />
          <StatTile label="Highest round" value={stats.worstRound?.total ?? '—'} note={stats.worstRound ? formatDate(stats.worstRound.date) : ''} />
        </section>

        <div className="grid-2">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Performance history</h2>
                <p className="card-sub">Total strokes per completed round</p>
              </div>
            </div>
            <PlayerTrendChart history={stats.history} color={group?.color} />
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Fairway averages</h2>
                <p className="card-sub">Average strokes on each of the 12 fairways</p>
              </div>
            </div>
            <FairwayChart averages={stats.fairwayAverages} color={group?.color} />
          </section>
        </div>

        <section className="card card-flush">
          <div className="card-header">
            <h2>Fairway-by-fairway scores</h2>
            <span className="small muted">{history.length} rounds</span>
          </div>
          {history.length ? (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th className="sticky-col">Date</th>
                    <th>Rd</th>
                    {Array.from({ length: FAIRWAY_COUNT }, (_, i) => (
                      <th key={i} className="num">
                        F{i + 1}
                      </th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={`${e.roundId}`}>
                      <td className="sticky-col nowrap">
                        <Link to={`/matches/${e.matchId}`}>{formatDate(e.date)}</Link>
                      </td>
                      <td>{e.roundNumber}</td>
                      {e.fairways.map((v, i) => (
                        <td key={i} className="num">
                          {v ?? <span className="muted">·</span>}
                        </td>
                      ))}
                      <td className="num strong">
                        {e.total}
                        {!e.complete && (
                          <span className="tag tag-warn" style={{ marginLeft: 4 }}>
                            partial
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No rounds in this period">Scores appear here once the coach records them.</EmptyState>
          )}
        </section>

        {player.notes && (
          <section className="card">
            <h2>Notes</h2>
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {player.notes}
            </p>
          </section>
        )}
      </div>
    </>
  )
}

