import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, ResultBadge, EmptyState, MatchTypeTag, GroupBadge, LiveTag } from '../components/common.jsx'
import Icon from '../components/Icons.jsx'
import { computeOutcome, hasResult, roundTotal, isRoundComplete, FAIRWAY_COUNT, POINTS } from '../lib/scoring.js'
import { formatDate } from '../lib/dates.js'
import { formatAvg, sameDayIndex } from '../lib/stats.js'
import { MatchCards } from '../components/PlayingCards.jsx'

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
  // Before play starts the cards are what people come to see, so show them first.
  const started = match.rounds.some((r) => Object.keys(r.scores).length > 0)
  const cards = <MatchCards match={match} playersById={playersById} groupsById={groupsById} />

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
        {!started && cards}
        <section className="card">
          <div className="card-header">
            <h2>Outcome</h2>
            <span className="row" style={{ gap: 6 }}>
              {outcome.status === 'live' && <LiveTag />}
              <MatchTypeTag match={match} />
            </span>
          </div>
          {outcome.status === 'practice' && <p className="muted mb-0">Practice session — scores count for individual statistics; no points are awarded.</p>}
          {outcome.status === 'pending' && (
            <p className="muted mb-0">
              {match.outcomeMode === 'manual'
                ? 'Waiting for the coach to set the result.'
                : outcome.waitingForCompletion
                  ? 'In progress — the result is decided when every started scorecard has all 12 fairways (live results are switched off in Settings).'
                  : 'Pending — every group needs at least one fairway score entered.'}
            </p>
          )}
          <div className="table-wrap mt-1">
            <table className="table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th className="num" title="Fairway scores entered">
                    Fairways
                  </th>
                  <th className="num">Total strokes</th>
                  <th className="num" title="Average strokes per round (per fairway × 12)">
                    Avg strokes
                  </th>
                  {hasResult(outcome) && <th className="center">Result</th>}
                  {hasResult(outcome) && <th className="num">Points</th>}
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
                      <td className="num">{m?.fairways ?? 0}</td>
                      <td className="num">{m?.totalStrokes ?? 0}</td>
                      <td className="num strong">{formatAvg(m?.avgStrokes)}</td>
                      {hasResult(outcome) && (
                        <td className="center">
                          <ResultBadge result={r} live={outcome.status === 'live'} />
                        </td>
                      )}
                      {hasResult(outcome) && <td className="num strong">{POINTS[r]}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {hasResult(outcome) && (
            <p className="small muted mt-1 mb-0">
              {match.outcomeMode === 'manual'
                ? 'Result set by the coach.'
                : `${outcome.status === 'live' ? 'Live result based on the fairways entered so far — it can change until every scorecard is complete. ' : ''}Decided by ${outcome.compared === 'total' ? 'total strokes' : 'average strokes per round (per fairway × 12)'} — fewer is better.`}
            </p>
          )}
          {match.notes && (
            <p className="mt-2 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              <strong>Notes:</strong> {match.notes}
            </p>
          )}
        </section>

        {started && cards}

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
                              {f && !isRoundComplete(f) && <span className="sr-only"> (in progress)</span>}
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
        <p className="small muted">* round in progress (fewer than 12 fairways entered). Its scores already count in the averages; best-round records need all 12.</p>
      </div>
    </>
  )
}
