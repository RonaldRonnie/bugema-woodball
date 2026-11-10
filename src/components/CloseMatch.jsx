import { useData, useLookups } from '../state/DataContext.jsx'
import { useConfirm, useToast } from '../state/UIContext.jsx'
import Icon from './Icons.jsx'
import { computeOutcome, hasResult, lineupProgress, closeBlocker } from '../lib/scoring.js'
import { formatAvg } from '../lib/stats.js'

const RESULT_WORD = { W: 'Win', D: 'Draw', L: 'Loss' }

/**
 * "Close match" for the coach: makes the result final with the scores
 * entered, even when some players did not play or stopped early. Shows
 * "Reopen match" once closed.
 */
export default function CloseMatchButton({ match, className = 'btn btn-sm' }) {
  const { data, commit, actions } = useData()
  const { groupsById, playersById } = useLookups()
  const confirm = useConfirm()
  const toast = useToast()

  if (match.closedAt) {
    const reopen = async () => {
      const ok = await confirm({
        title: 'Reopen this match?',
        message:
          'Scores, rounds and the line-up can be changed again. While a scorecard is unfinished the result shows as live, until you close the match again. Publish afterwards so everyone sees the change.',
        confirmLabel: 'Reopen match',
      })
      if (ok) commit((d) => actions.reopenMatch(d, match.id), { success: 'Match reopened — scores can be changed.' })
    }
    return (
      <button type="button" className={className} onClick={reopen}>
        <Icon name="edit" /> Reopen match
      </button>
    )
  }

  const close = async () => {
    const why = closeBlocker(match, data.settings, (gid) => groupsById[gid]?.name || 'A group')
    if (why) {
      toast.error(why)
      return
    }
    const { absent, short } = lineupProgress(match)
    const outcome = computeOutcome({ ...match, closedAt: 'closing' }, data.settings)
    const name = (id) => playersById[id]?.name || 'Unknown player'
    const severalRounds = match.rounds.length > 1
    const ok = await confirm({
      title: 'Close this match?',
      confirmLabel: 'Close match',
      message: (
        <>
          {hasResult(outcome) ? (
            <>
              <p className="mb-0">The result becomes final, using the scores entered:</p>
              <ul className="close-result">
                {match.groupIds.map((g) => (
                  <li key={g}>
                    <span className="group-dot" style={{ background: groupsById[g]?.color }} aria-hidden="true" /> <strong>{groupsById[g]?.name}</strong>{' '}
                    {RESULT_WORD[outcome.results[g]]} <span className="muted">· {formatAvg(outcome.metrics[g]?.avgStrokes)} avg strokes</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>This is a practice session, so no points are given. Closing marks it as finished.</p>
          )}
          {absent.length > 0 && (
            <p className="small">
              <strong>Did not play ({absent.length}):</strong> {absent.map(name).join(', ')}. They are left out of the result and their statistics.
            </p>
          )}
          {short.length > 0 && (
            <p className="small">
              <strong>Fewer than 12 fairways ({short.length}):</strong>{' '}
              {short.map((s) => `${name(s.playerId)} (${s.fairways}/12${severalRounds ? `, round ${s.roundNumber}` : ''})`).join(', ')}. The fairways they
              played count; best-round records need all 12.
            </p>
          )}
          {!absent.length && !short.length && <p className="small">Every scorecard is complete.</p>}
          <p className="small mb-0">Scores and the line-up are locked until you reopen the match. Publish afterwards so everyone sees the final result.</p>
        </>
      ),
    })
    if (ok) commit((d) => actions.closeMatch(d, match.id), { success: 'Match closed — the result is final. Publish so everyone sees it.' })
  }

  return (
    <button type="button" className={className} onClick={close}>
      <Icon name="check" /> Close match
    </button>
  )
}

/**
 * "Close round N" / "Reopen round N": locks one round's scores. Unfinished
 * scorecards in a closed round no longer keep the match result live.
 */
export function CloseRoundButton({ match, round, className = 'btn btn-sm' }) {
  const { commit, actions } = useData()
  const { playersById } = useLookups()
  const confirm = useConfirm()
  const toast = useToast()
  if (match.closedAt) return null

  if (round.closedAt) {
    const reopen = async () => {
      const ok = await confirm({
        title: `Reopen round ${round.number}?`,
        message: `Scores in round ${round.number} can be changed again. While one of its scorecards is unfinished, the match result shows as live.`,
        confirmLabel: 'Reopen round',
      })
      if (ok) commit((d) => actions.reopenRound(d, match.id, round.id), { success: `Round ${round.number} reopened.` })
    }
    return (
      <button type="button" className={className} onClick={reopen}>
        <Icon name="edit" /> Reopen round {round.number}
      </button>
    )
  }

  const close = async () => {
    const { absent, short } = lineupProgress(match, round.id)
    if (absent.length === match.participants.length) {
      toast.error(`Round ${round.number} has no scores yet. Enter scores first, or delete the round if it was not played.`)
      return
    }
    const name = (id) => playersById[id]?.name || 'Unknown player'
    const ok = await confirm({
      title: `Close round ${round.number}?`,
      confirmLabel: 'Close round',
      message: (
        <>
          {absent.length > 0 && (
            <p className="small">
              <strong>Did not play in this round ({absent.length}):</strong> {absent.map(name).join(', ')}.
            </p>
          )}
          {short.length > 0 && (
            <p className="small">
              <strong>Fewer than 12 fairways ({short.length}):</strong> {short.map((s) => `${name(s.playerId)} (${s.fairways}/12)`).join(', ')}. The
              fairways they played count.
            </p>
          )}
          {!absent.length && !short.length && <p className="small">Every scorecard in this round is complete.</p>}
          <p className="small mb-0">
            Round {round.number}’s scores are locked until you reopen it, and its unfinished scorecards no longer keep the match result “live”. Close the
            whole match when all play is over.
          </p>
        </>
      ),
    })
    if (ok) commit((d) => actions.closeRound(d, match.id, round.id), { success: `Round ${round.number} closed.` })
  }

  return (
    <button type="button" className={className} onClick={close}>
      <Icon name="check" /> Close round {round.number}
    </button>
  )
}
