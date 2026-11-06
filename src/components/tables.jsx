import { Link } from 'react-router-dom'
import { GroupBadge, FormStrip, ResultBadge, MatchTypeTag, LiveTag } from './common.jsx'
import { PlayerAvatar } from './media.jsx'
import { formatAvg, sameDayIndex } from '../lib/stats.js'
import { formatDate } from '../lib/dates.js'
import { computeOutcome, hasResult } from '../lib/scoring.js'

/** Group leaderboard. Points are W 3 · D 1 · L 0; matches in progress count with a live result. */
export function StandingsTable({ standings, compact = false }) {
  const liveMatches = standings.some((s) => s.live > 0)
  return (
    <>
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Group standings</caption>
        <thead>
          <tr>
            <th className="center">#</th>
            <th>Group</th>
            <th className="num" title="Played">
              P
            </th>
            <th className="num" title="Won">
              W
            </th>
            <th className="num" title="Drawn">
              D
            </th>
            <th className="num" title="Lost">
              L
            </th>
            <th className="num" title="Points">
              Pts
            </th>
            {!compact && (
              <th className="num" title="Average strokes per round (per fairway × 12), every fairway entered in matches">
                Avg strokes
              </th>
            )}
            {!compact && <th>Form</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.groupId}>
              <td className="center rank-cell">
                {s.rank}
                {s.tied && <span className="sr-only"> (tied)</span>}
              </td>
              <td>
                <Link to={`/groups/${s.groupId}`} className="standings-row-name">
                  <span className="group-dot" style={{ background: s.color }} aria-hidden="true" />
                  {s.name}
                </Link>
                {s.live > 0 && (
                  <span className="sr-only"> (includes {s.live} match{s.live === 1 ? '' : 'es'} in progress)</span>
                )}
                {s.live > 0 && !compact && (
                  <>
                    {' '}
                    <LiveTag />
                  </>
                )}
              </td>
              <td className="num">{s.played}</td>
              <td className="num">{s.won}</td>
              <td className="num">{s.drawn}</td>
              <td className="num">{s.lost}</td>
              <td className="num strong">{s.points}</td>
              {!compact && <td className="num">{formatAvg(s.avgStrokes)}</td>}
              {!compact && (
                <td>
                  <FormStrip form={s.form} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {liveMatches && (
      <p className="small muted live-note">
        <LiveTag /> Includes matches still in progress — points can change until every scorecard has all 12 fairways.
      </p>
    )}
    </>
  )
}

/** Individual rankings by average strokes per completed round. */
export function PlayerRankingTable({ rows, groupsById, limit, showGroup = true, showUnranked = false }) {
  const list = (showUnranked ? rows : rows.filter((r) => r.rank != null)).slice(0, limit || undefined)
  if (!list.length) return <p className="muted small flush-pad">No scores have been entered in this period yet.</p>
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Player rankings</caption>
        <thead>
          <tr>
            <th className="center">#</th>
            <th>Player</th>
            {showGroup && <th className="hide-sm">Group</th>}
            <th className="num" title="Fairway scores entered, including rounds in progress">
              Fairways
            </th>
            <th className="num" title="Average strokes per round (per fairway × 12)">
              Avg
            </th>
            <th className="num">Best</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.player.id}>
              <td className="center rank-cell">{r.rank ?? '–'}</td>
              <td>
                <Link to={`/players/${r.player.id}`} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <PlayerAvatar player={r.player} group={groupsById[r.player.groupId]} size={28} />
                  <span>{r.player.name}</span>
                </Link>
              </td>
              {showGroup && (
                <td className="hide-sm">
                  <GroupBadge group={groupsById[r.player.groupId]} />
                </td>
              )}
              <td className="num">{r.fairwaysPlayed}</td>
              <td className="num strong">{formatAvg(r.avgStrokes)}</td>
              <td className="num">{r.bestRound?.total ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One line in a list of matches. */
export function MatchRow({ match, data, groupsById, to }) {
  const outcome = computeOutcome(match, data.settings)
  const { index, count } = sameDayIndex(data.matches, match)
  const title = match.title || match.groupIds.map((g) => groupsById[g]?.name).join(' vs ')
  return (
    <Link to={to || `/matches/${match.id}`} className="list-item">
      <div className="list-main">
        <div className="list-title">{title}</div>
        <div className="list-meta">
          <span>{formatDate(match.date, { weekday: true })}</span>
          {count > 1 && <span className="tag">Game {index} of {count}</span>}
          <MatchTypeTag match={match} />
          <span>
            {match.rounds.length} round{match.rounds.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="list-end">
        {hasResult(outcome) ? (
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            {outcome.status === 'live' && <LiveTag />}
            {match.groupIds.map((g) => (
              <span key={g} className="row" style={{ gap: 4 }} title={groupsById[g]?.name}>
                <span className="group-dot" style={{ background: groupsById[g]?.color }} aria-hidden="true" />
                <span className="sr-only">{groupsById[g]?.name}</span>
                <ResultBadge result={outcome.results[g]} live={outcome.status === 'live'} />
              </span>
            ))}
          </div>
        ) : outcome.status === 'pending' ? (
          <span className="tag tag-warn">Pending</span>
        ) : null}
      </div>
    </Link>
  )
}

export { GroupBadge }
