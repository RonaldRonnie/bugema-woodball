import { Link } from 'react-router-dom'
import { useData, useLookups } from '../../state/DataContext.jsx'
import { useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, EmptyState, ResultBadge, MatchTypeTag, LiveTag } from '../../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../../components/DateRangeFilter.jsx'
import Icon from '../../components/Icons.jsx'
import { useMatchList } from '../Matches.jsx'
import { computeOutcome, hasResult, isRoundComplete } from '../../lib/scoring.js'
import { formatDate } from '../../lib/dates.js'

function progress(match) {
  const expected = match.participants.length * match.rounds.length
  let done = 0
  for (const r of match.rounds) for (const p of match.participants) if (isRoundComplete(r.scores[p.playerId])) done++
  return { done, expected }
}

export default function AdminMatches() {
  useTitle('Manage matches')
  const { data, commit, actions } = useData()
  const { groupsById } = useLookups()
  const confirm = useConfirm()
  const filter = useDateRange()
  const { days } = useMatchList(filter.range)

  const remove = async (m) => {
    const ok = await confirm({
      title: 'Delete this match?',
      message: `“${m.title}” on ${formatDate(m.date)} and all ${m.rounds.length} round(s) of scores will be deleted. Standings will be recalculated.`,
      confirmLabel: 'Delete match',
      danger: true,
    })
    if (ok) commit((d) => actions.deleteMatch(d, m.id), { success: 'Match deleted.' })
  }

  return (
    <>
      <PageHeader
        title="Matches & scores"
        subtitle="Record matches and practice sessions, then enter the 12 fairway scores for each round."
        actions={
          <Link to="/admin/matches/new" className="btn btn-primary">
            <Icon name="plus" /> Record a match
          </Link>
        }
      />
      <DateRangeFilter state={filter} />

      {days.length ? (
        <div className="stack">
          {days.map((d) => (
            <section key={d.date} className="card card-flush">
              <div className="card-header">
                <h2 style={{ fontSize: '1rem' }}>{formatDate(d.date, { weekday: true })}</h2>
              </div>
              <ul className="list">
                {d.matches.map((m, i) => {
                  const o = computeOutcome(m, data.settings)
                  const p = progress(m)
                  return (
                    <li key={m.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                      <div className="list-main">
                        <div className="list-title">
                          {d.matches.length > 1 && <span className="muted">#{i + 1} · </span>}
                          {m.title}
                        </div>
                        <div className="list-meta">
                          <MatchTypeTag match={m} />
                          <span>
                            {m.participants.length} players · {m.rounds.length} round{m.rounds.length === 1 ? '' : 's'}
                            {m.cards?.length > 0 && ` · ${m.cards.length} card${m.cards.length === 1 ? '' : 's'}`}
                          </span>
                          {m.closedAt ? (
                            <span className="tag tag-navy">Closed</span>
                          ) : (
                            <span className={p.done === p.expected && p.expected ? 'tag tag-ok' : 'tag tag-warn'}>
                              {p.done}/{p.expected} scorecards complete
                            </span>
                          )}
                          {o.status === 'live' && <LiveTag />}
                          {hasResult(o) &&
                            m.groupIds.map((g) => (
                              <span key={g} className="row" style={{ gap: 4 }}>
                                <span className="group-dot" style={{ background: groupsById[g]?.color }} aria-hidden="true" />
                                <span className="sr-only">{groupsById[g]?.name}</span>
                                <ResultBadge result={o.results[g]} live={o.status === 'live'} />
                              </span>
                            ))}
                        </div>
                      </div>
                      <div className="row">
                        <Link to={`/admin/matches/${m.id}/scores`} className="btn btn-sm btn-primary">
                          <Icon name="clipboard" /> Scores
                        </Link>
                        <Link to={`/admin/matches/${m.id}/edit`} className="btn btn-sm" aria-label={`Edit details of ${m.title}`}>
                          <Icon name="edit" /> Details
                        </Link>
                        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(m)} aria-label={`Delete ${m.title}`}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            title="No matches in this period"
            action={
              <Link to="/admin/matches/new" className="btn btn-primary">
                Record a match
              </Link>
            }
          />
        </div>
      )}
    </>
  )
}
