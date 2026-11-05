import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, ResultBadge, EmptyState, MatchTypeTag, GroupBadge } from '../components/common.jsx'
import Icon from '../components/Icons.jsx'
import { computeOutcome, roundTotal, isRoundComplete, FAIRWAY_COUNT, POINTS } from '../lib/scoring.js'
import { formatDate } from '../lib/dates.js'
import { formatAvg, sameDayIndex } from '../lib/stats.js'

export default function MatchDetail() {
  const { matchId } = useParams()
  const { data } = useData()
  const { groupsById, playersById } = useLookups()
  const { isAdmin } = useAdmin()
  const match = data.matches.find((m) => m.id === matchId)
  useTitle(match ? match.title || 'Match' : 'Match')
  const outcome = useMemo(() => (match ? computeOutcome(match, data.settings) : null), [match, data.settings])

  if (!match) {
    return <EmptyState title="Match not found" action={<Link to="/matches" className="btn">All matches</Link>} />
  }
  const { index, count } = sameDayIndex(data.matches, match)
  const rounds = [...match.rounds].sort((a, b) => a.number - b.number)

  return (
    <>
      <PageHeader
        back={{ to: '/matches', label: 'Matches' }}
        title={match.title || match.groupIds.map((g) => groupsById[g]?.name).join(' vs ')}
        subtitle={
          <>
            {formatDate(match.date, { weekday: true })}
            {count > 1 && ` · game ${index} of ${count} that day`}
            {match.venue && ` · ${match.venue}`}
          </>
        }
        actions={
          isAdmin && (
            <>
              <Link to={`/admin/matches/${match.id}/scores`} className="btn btn-primary btn-sm">
                <Icon name="clipboard" /> Enter scores
              </Link>
              <Link to={`/admin/matches/${match.id}/edit`} className="btn btn-sm">
                <Icon name="edit" /> Edit
              </Link>
            </>
          )
        }
      />

      <div className="stack">
        <section className="card">
          <div className="card-header">
            <h2>Outcome</h2>
            <MatchTypeTag match={match} />
          </div>
          {outcome.status === 'practice' && <p className="muted mb-0">Practice session — scores count for individual statistics; no points are awarded.</p>}
          {outcome.status === 'pending' && (
            <p className="muted mb-0">
              {match.outcomeMode === 'manual'
                ? 'Waiting for the coach to set the result.'
                : 'Pending — every group needs at least one completed round (all 12 fairways) to decide the result.'}
            </p>
          )}
          <div className="table-wrap mt-1">
            <table className="table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th className="num">Player rounds</th>
                  <th className="num">Total strokes</th>
                  <th className="num">Avg strokes</th>
                  {outcome.status === 'decided' && <th className="center">Result</th>}
                  {outcome.status === 'decided' && <th className="num">Points</th>}
                </tr>
              </thead>
              <tbody>
                {match.groupIds.map((gid) => {
                  const m = outcome.metrics[gid]
                  const r = outcome.results[gid]
                  return (
                    <tr key={gid}>
                      <td>
                        <GroupBadge group={groupsById[gid]} link />
                      </td>
                      <td className="num">{m?.playerRounds ?? 0}</td>
                      <td className="num">{m?.totalStrokes ?? 0}</td>
                      <td className="num strong">{formatAvg(m?.avgStrokes)}</td>
                      {outcome.status === 'decided' && (
                        <td className="center">
                          <ResultBadge result={r} />
                        </td>
                      )}
                      {outcome.status === 'decided' && <td className="num strong">{POINTS[r]}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {outcome.status === 'decided' && (
            <p className="small muted mt-1 mb-0">
              {match.outcomeMode === 'manual'
                ? 'Result set by the coach.'
                : `Decided automatically by ${outcome.compared === 'total' ? 'total strokes' : 'average strokes per player round'} (fewer is better).`}
            </p>
          )}
          {match.notes && (
            <p className="mt-2 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              <strong>Notes:</strong> {match.notes}
            </p>
          )}
        </section>

        {rounds.map((round) => (
          <section key={round.id} className="card card-flush">
            <div className="card-header">
              <h2>Round {round.number}</h2>
            </div>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th className="sticky-col">Player</th>
                    {Array.from({ length: FAIRWAY_COUNT }, (_, i) => (
                      <th key={i} className="num">
                        F{i + 1}
                      </th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {match.groupIds.map((gid) =>
                    match.participants
                      .filter((p) => p.groupId === gid)
                      .map((p) => {
                        const f = round.scores[p.playerId]
                        const player = playersById[p.playerId]
                        return (
                          <tr key={p.playerId}>
                            <td className="sticky-col nowrap">
                              <span className="group-dot" style={{ background: groupsById[gid]?.color, marginRight: 6 }} aria-hidden="true" />
                              <Link to={`/players/${p.playerId}`}>{player?.name}</Link>
                            </td>
                            {Array.from({ length: FAIRWAY_COUNT }, (_, i) => (
                              <td key={i} className="num">
                                {f?.[i] ?? <span className="muted">·</span>}
                              </td>
                            ))}
                            <td className="num strong">
                              {f ? roundTotal(f) : <span className="muted">—</span>}
                              {f && !isRoundComplete(f) && <span className="sr-only"> (incomplete)</span>}
                              {f && !isRoundComplete(f) && <span className="muted">*</span>}
                            </td>
                          </tr>
                        )
                      }),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="small muted">* incomplete round (not all 12 fairways entered) — not counted in statistics.</p>
      </div>
    </>
  )
}
