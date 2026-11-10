import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useToast, useConfirm } from '../state/UIContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, EmptyState, Banner, FairwayStrip } from '../components/common.jsx'
import Icon from '../components/Icons.jsx'
import { FAIRWAY_COUNT, roundTotal, filledCount, interpretStroke } from '../lib/scoring.js'
import { formatDate, formatDateTime } from '../lib/dates.js'
import { describeCards } from '../lib/cards.js'
import { newId } from '../lib/ids.js'
import { cardPayload, sendCard } from '../lib/inbox.js'
import {
  newScorecard,
  saveScorecard,
  removeScorecard,
  listScorecards,
  scorecardKey,
  withStroke,
  fairwayDone,
  missingScores,
  sendState,
  markSent,
  matchLabel,
} from '../lib/scorecards.js'

// One player keeps score for their whole playing card on their phone:
// fairway by fairway, saved on the phone after every tap (works without
// internet), then "Submit" sends the card to the coach's score inbox.

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function stateTag(sc) {
  const st = sendState(sc)
  if (st === 'sent') return <span className="tag tag-ok">Sent</span>
  if (st === 'changed') return <span className="tag tag-warn">Changed since sent</span>
  return <span className="tag tag-warn">Not sent yet</span>
}

function FairwayButtons({ sc, current, onPick }) {
  return (
    <div className="fw-nav" role="group" aria-label="Fairways">
      {Array.from({ length: FAIRWAY_COUNT }, (_, i) => {
        const done = fairwayDone(sc, i)
        return (
          <button
            key={i}
            type="button"
            className={`fw-dot ${done ? 'done' : ''} ${current === i ? 'current' : ''}`}
            aria-current={current === i ? 'step' : undefined}
            aria-label={`Fairway ${i + 1}${done ? ', all scores entered' : ''}`}
            onClick={() => onPick(i)}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------ fairway view

function FairwayEntry({ sc, max, onChange, onReview }) {
  const fairway = sc.fairway ?? 0
  const firstEmpty = (f, scores = sc.scores) => sc.players.findIndex((p) => scores[p.id]?.[f] == null)
  const [active, setActive] = useState(() => firstEmpty(fairway))
  const [typed, setTyped] = useState(null) // digits typed into the active row; null = next digit replaces
  const [error, setError] = useState('')
  const nextBtn = useRef(null)

  // The view is keyed by fairway, so changing fairway starts afresh on the
  // first player without a score (or with none selected when all are in).
  const goFairway = (f) => {
    onChange({ ...sc, fairway: Math.max(0, Math.min(FAIRWAY_COUNT - 1, f)) })
    window.scrollTo?.({ top: 0 })
  }

  const moveOn = (from = active) => {
    setTyped(null)
    setError('')
    if (from < sc.players.length - 1) setActive(from + 1)
    else {
      setActive(-1)
      nextBtn.current?.focus({ preventScroll: true })
    }
  }

  const advanceFairway = () => (fairway < FAIRWAY_COUNT - 1 ? goFairway(fairway + 1) : onReview())

  const store = (value) => onChange(withStroke(sc, sc.players[active].id, fairway, value))

  const press = (key) => {
    if (active === -1) {
      if (key === 'next') advanceFairway()
      return
    }
    if (key === 'next') return moveOn()
    if (key === 'back') {
      const t = typed ? typed.slice(0, -1) : ''
      const r = interpretStroke(t, max)
      setTyped(t)
      setError('')
      store(r.value)
      return
    }
    const r = interpretStroke((typed ?? '') + key, max)
    setTyped(r.text)
    if (!r.valid) {
      setError(`Scores are whole numbers from 1 to ${max}.`)
      return
    }
    setError('')
    store(r.value)
    if (r.done) moveOn()
  }

  // A computer keyboard works too.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter' && !e.target.closest?.('button, a')) press('next')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const last = fairway === FAIRWAY_COUNT - 1
  const allIn = fairwayDone(sc, fairway)

  return (
    <section className="card keeper" aria-labelledby="keeper-fairway">
      <div className="row-between">
        <h2 id="keeper-fairway" className="mb-0">
          Fairway {fairway + 1} <span className="muted small">of {FAIRWAY_COUNT}</span>
        </h2>
        <span className="save-state">
          <Icon name="check" width="14" height="14" /> Saved on this phone
        </span>
      </div>
      <FairwayButtons sc={sc} current={fairway} onPick={goFairway} />

      <ul className="keeper-list">
        {sc.players.map((p, i) => {
          const row = sc.scores[p.id] || []
          const value = row[fairway]
          const isActive = active === i
          const shown = isActive && typed ? typed : value
          const invalid = isActive && Boolean(error)
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`keeper-row ${isActive ? 'active' : ''}`}
                aria-pressed={isActive}
                aria-label={`${p.name}, fairway ${fairway + 1}: ${value == null ? 'no score yet' : `${value} strokes`}`}
                onClick={() => {
                  setActive(i)
                  setTyped(null)
                  setError('')
                }}
              >
                <span className="group-dot" style={{ background: p.color || undefined }} aria-hidden="true" />
                <span className="keeper-name">
                  {p.name}
                  <span className="keeper-sub">
                    {p.groupName ? `${p.groupName} · ` : ''}total {roundTotal(row)}
                  </span>
                </span>
                <span className={`keeper-value ${shown == null || shown === '' ? 'empty' : ''} ${invalid ? 'invalid' : ''}`} aria-hidden="true">
                  {shown == null || shown === '' ? '' : shown}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="field-error mt-1 mb-0" role="alert">
          {error}
        </p>
      )}

      <div className="keypad keypad-5" aria-label="Score keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={active === -1}>
            {d}
          </button>
        ))}
        <button type="button" className="key-action" onClick={() => press('back')} aria-label="Delete" disabled={active === -1}>
          ⌫
        </button>
        <button type="button" className="key-next" onClick={() => press('next')}>
          {active === -1 ? (last ? 'Check the card →' : `Fairway ${fairway + 2} →`) : 'Next player →'}
        </button>
      </div>

      <div className="row-between mt-2">
        {fairway > 0 ? (
          <button type="button" className="btn" onClick={() => goFairway(fairway - 1)}>
            <Icon name="back" /> Fairway {fairway}
          </button>
        ) : (
          <span />
        )}
        <button ref={nextBtn} type="button" className={`btn ${allIn ? 'btn-primary' : ''}`} onClick={advanceFairway}>
          {last ? 'Check the card' : `Fairway ${fairway + 2}`} <Icon name="next" />
        </button>
      </div>
      <p className="text-center mt-1 mb-0">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReview}>
          See the whole card
        </button>
      </p>
    </section>
  )
}

// ------------------------------------------------------------- review view

function ReviewCard({ sc, inboxUrl, closedNote, onChange, onEditFairway, onDelete }) {
  const toast = useToast()
  const confirm = useConfirm()
  const online = useOnline()
  const [sending, setSending] = useState(false)
  const missing = missingScores(sc)
  const state = sendState(sc)

  const submit = async () => {
    if (missing.length) {
      const ok = await confirm({
        title: 'Submit with missing scores?',
        message: `${plural(missing.length, 'fairway score')} ${missing.length === 1 ? 'is' : 'are'} still empty. Only submit like this if a player stopped playing — otherwise fill them in first.`,
        confirmLabel: 'Submit anyway',
      })
      if (!ok) return
    }
    // Re-use the ID when retrying the same scores, so the coach never gets duplicates.
    const scoresText = JSON.stringify(sc.scores)
    const id = sc.attempt?.scores === scoresText ? sc.attempt.id : newId('card')
    const attempt = { ...sc, attempt: { id, scores: scoresText } }
    onChange(attempt)
    setSending(true)
    try {
      await sendCard(inboxUrl, cardPayload(attempt, id))
      onChange(markSent(attempt, { id, at: new Date().toISOString() }))
      toast.success('Card sent to the coach.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Delete card ${sc.cardNumber} from this phone?`,
      message:
        state === 'sent'
          ? 'The coach already has this card, so nothing is lost for the results.'
          : 'These scores have not reached the coach. Deleting them cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) onDelete()
  }

  return (
    <section className="card" aria-labelledby="review-title">
      <h2 id="review-title">Check the card</h2>
      <p className="small muted">Tap a fairway number to change a score.</p>
      <FairwayButtons sc={sc} current={-1} onPick={onEditFairway} />
      <ul className="keeper-review">
        {sc.players.map((p) => {
          const row = sc.scores[p.id] || []
          const gaps = FAIRWAY_COUNT - filledCount(row)
          return (
            <li key={p.id}>
              <div className="row-between">
                <span>
                  <span className="group-dot" style={{ background: p.color || undefined, marginRight: 6 }} aria-hidden="true" />
                  <strong>{p.name}</strong> {p.groupName && <span className="small muted">{p.groupName}</span>}
                </span>
                <span className="strong num" aria-label={`Total ${roundTotal(row)}`}>
                  {roundTotal(row)}
                </span>
              </div>
              <FairwayStrip fairways={row} />
              {gaps > 0 && <span className="small keeper-gap">{plural(gaps, 'fairway')} missing</span>}
            </li>
          )
        })}
      </ul>

      {missing.length > 0 && state !== 'sent' && (
        <Banner kind="warning">
          {plural(missing.length, 'score')} missing:{' '}
          {[...new Set(missing.map((m) => m.index))]
            .slice(0, 6)
            .map((i) => `F${i + 1}`)
            .join(', ')}
          {new Set(missing.map((m) => m.index)).size > 6 ? '…' : ''}. Fill them in, or submit as it is if a player stopped playing.
        </Banner>
      )}

      {closedNote && state !== 'sent' ? (
        <Banner kind="info">{closedNote} You can delete it from this phone.</Banner>
      ) : !inboxUrl ? (
        <Banner kind="info">
          Sending cards to the coach is not switched on yet. This card stays saved on this phone — ask the coach to set up the score inbox, then come back and
          submit.
        </Banner>
      ) : state === 'sent' ? (
        <Banner kind="success">
          <strong>Sent to the coach</strong> {formatDateTime(sc.sent.at)}. The coach checks the card and publishes the results. If you change a score, send the
          card again.
        </Banner>
      ) : (
        <>
          {state === 'changed' && <Banner kind="warning">You changed scores after sending. Send the card again so the coach gets the corrected scores.</Banner>}
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={sending || !online}>
            <Icon name="upload" /> {sending ? 'Sending…' : state === 'changed' ? 'Send the corrected card' : 'Submit to the coach'}
          </button>
          {!online && (
            <p className="small text-center mt-1 mb-0" role="status">
              No internet right now. The card is saved on this phone — open this page and tap Submit when you are back online.
            </p>
          )}
        </>
      )}

      <div className="row-between mt-2">
        <button type="button" className="btn" onClick={() => onEditFairway(sc.fairway ?? 0)}>
          <Icon name="edit" /> Change scores
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>
          <Icon name="trash" /> Delete from this phone
        </button>
      </div>
    </section>
  )
}

function Scorecard({ sc, max, inboxUrl, closedNote, onChange, onDelete }) {
  const [view, setView] = useState(() => (sc.sent || missingScores(sc).length === 0 ? 'review' : 'fairway'))
  if (view === 'review') {
    return (
      <ReviewCard
        sc={sc}
        inboxUrl={inboxUrl}
        closedNote={closedNote}
        onChange={onChange}
        onDelete={onDelete}
        onEditFairway={(f) => {
          onChange({ ...sc, fairway: f })
          setView('fairway')
        }}
      />
    )
  }
  return <FairwayEntry key={sc.fairway} sc={sc} max={max} onChange={onChange} onReview={() => setView('review')} />
}

// ------------------------------------------------------------- choose card

function SavedCards({ saved, onOpen }) {
  if (!saved.length) return null
  return (
    <section className="card card-flush" aria-labelledby="saved-title">
      <div className="card-header">
        <h2 id="saved-title">Scorecards on this phone</h2>
      </div>
      <ul className="list">
        {saved.map((s) => {
          const done = Array.from({ length: FAIRWAY_COUNT }, (_, i) => fairwayDone(s, i)).filter(Boolean).length
          return (
            <li key={s.key}>
              <button type="button" className="list-item list-button" onClick={() => onOpen(s.key)}>
                <div className="list-main">
                  <div className="list-title">
                    Card {s.cardNumber} · Round {s.roundNumber}
                  </div>
                  <div className="list-meta">
                    {done} of {FAIRWAY_COUNT} fairways · kept by {s.scorer.name} {stateTag(s)}
                  </div>
                </div>
                <Icon name="next" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ChooseCard({ match, saved, onStart, onOpen }) {
  const { playersById, groupsById } = useLookups()
  // Closed rounds take no more cards.
  const rounds = useMemo(() => [...match.rounds].filter((r) => !r.closedAt).sort((a, b) => a.number - b.number), [match])
  const [roundId, setRoundId] = useState(() => rounds[rounds.length - 1]?.id)
  const { cards } = useMemo(() => describeCards(match, playersById), [match, playersById])
  const [cardNumber, setCardNumber] = useState(null)
  const [scorerId, setScorerId] = useState('')
  const [otherName, setOtherName] = useState('')
  const round = rounds.find((r) => r.id === roundId) || rounds[rounds.length - 1]
  const chosen = cards.find((c) => c.number === cardNumber)
  const existing = chosen ? saved.find((s) => s.key === scorecardKey(match.id, round.id, chosen.number)) : null
  const scorerName = scorerId === 'other' ? otherName.trim() : chosen?.players.find((e) => e.playerId === scorerId)?.player?.name || ''
  const ready = Boolean(chosen && (existing || scorerName))

  if (match.closedAt) {
    return (
      <EmptyState icon="🏁" title="This match is closed" action={<Link to={`/matches/${match.id}`} className="btn">See the final result</Link>}>
        The coach has closed this match, so no more scores can be sent for it.
      </EmptyState>
    )
  }

  if (!rounds.length) {
    return (
      <EmptyState icon="🏁" title="All rounds are closed" action={<Link to={`/matches/${match.id}`} className="btn">Back to the match</Link>}>
        The coach has closed every round of this match, so no more scores can be sent for it.
      </EmptyState>
    )
  }

  if (!cards.length) {
    return (
      <EmptyState icon="🃏" title="No playing cards for this match" action={<Link to={`/matches/${match.id}`} className="btn">Back to the match</Link>}>
        The coach has not put players on cards for this match, so there is nothing to keep score for here.
      </EmptyState>
    )
  }

  const start = (e) => {
    e.preventDefault()
    if (!ready) return
    if (existing) return onOpen(existing.key)
    onStart(
      newScorecard({
        match,
        round,
        cardNumber: chosen.number,
        playerIds: chosen.players.map((p) => p.playerId),
        playersById,
        groupsById,
        scorer: { id: scorerId === 'other' ? null : scorerId, name: scorerName },
      }),
    )
  }

  return (
    <form className="card" onSubmit={start} aria-labelledby="choose-title">
      <h2 id="choose-title">Which card are you keeping score for?</h2>
      <p className="small muted">
        One phone per card. After each fairway, enter everyone’s strokes — they save on this phone and it works without internet. At the end, submit the card
        to the coach.
      </p>
      {rounds.length > 1 && (
        <div className="field">
          <label htmlFor="ks-round">Round</label>
          <select id="ks-round" className="select" value={round.id} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                Round {r.number}
              </option>
            ))}
          </select>
        </div>
      )}
      <fieldset className="pick-cards">
        <legend className="field-label">Card</legend>
        {cards.map((c) => {
          const onPhone = saved.some((s) => s.key === scorecardKey(match.id, round.id, c.number))
          return (
            <label key={c.number} className={`pick-card ${cardNumber === c.number ? 'selected' : ''}`}>
              <input
                type="radio"
                name="ks-card"
                value={c.number}
                checked={cardNumber === c.number}
                onChange={() => {
                  setCardNumber(c.number)
                  setScorerId('')
                }}
              />
              <span className="pick-card-text">
                <strong>Card {c.number}</strong>
                {onPhone && <span className="tag tag-ok">On this phone</span>}
                <span className="small muted">{c.players.map((e) => e.player?.name || 'Unknown player').join(', ')}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {chosen && !existing && (
        <div className="field">
          <label htmlFor="ks-scorer">Who is keeping score?</label>
          <select id="ks-scorer" className="select" value={scorerId} onChange={(e) => setScorerId(e.target.value)}>
            <option value="">Choose your name…</option>
            {chosen.players.map((e) => (
              <option key={e.playerId} value={e.playerId}>
                {e.player?.name || 'Unknown player'}
              </option>
            ))}
            <option value="other">Someone else</option>
          </select>
        </div>
      )}
      {chosen && !existing && scorerId === 'other' && (
        <div className="field">
          <label htmlFor="ks-name">Your name</label>
          <input id="ks-name" className="input" value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={120} autoComplete="name" />
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block btn-lg mt-1" disabled={!ready}>
        {existing ? `Continue card ${chosen.number}` : 'Start keeping score'}
      </button>
    </form>
  )
}

// -------------------------------------------------------------------- page

export default function KeepScore() {
  const { matchId } = useParams()
  const [params, setParams] = useSearchParams()
  const { data } = useData()
  const { groupsById } = useLookups()
  const toast = useToast()
  const match = data.matches.find((m) => m.id === matchId) || null
  const [saved, setSaved] = useState(() => listScorecards(matchId))
  const [saveFailed, setSaveFailed] = useState(false)
  const openKey = params.get('card')
  const open = openKey ? saved.find((s) => s.key === openKey) || null : null
  useTitle(open ? `Card ${open.cardNumber} scorecard` : 'Keep score')

  // Coming back with one card in progress: open it straight away.
  useEffect(() => {
    if (openKey) return
    const unsent = saved.filter((s) => sendState(s) !== 'sent')
    if (unsent.length === 1) setParams({ card: unsent[0].key }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (sc) => {
    if (!saveScorecard(sc)) setSaveFailed(true)
    setSaved((list) => [sc, ...list.filter((s) => s.key !== sc.key)])
  }

  const title = open ? open.matchTitle : match ? matchLabel(match, groupsById) : 'Keep score'
  const date = open ? open.matchDate : match?.date
  const max = data.settings.maxStrokesPerFairway || 15
  const inboxUrl = data.settings.scoreInboxUrl || ''

  return (
    <>
      <PageHeader
        back={open ? { to: `/matches/${matchId}/score`, label: 'All cards' } : { to: `/matches/${matchId}`, label: 'Match' }}
        title={open ? `Card ${open.cardNumber} · Round ${open.roundNumber}` : 'Keep score'}
        subtitle={
          <>
            {title}
            {date && ` · ${formatDate(date, { weekday: true })}`}
            {open && ` · kept by ${open.scorer.name}`}
          </>
        }
      />
      <div className="stack">
        {saveFailed && (
          <Banner kind="danger">This phone is not letting the app save the card (private browsing or full storage). Keep this page open until you submit.</Banner>
        )}
        {open ? (
          <Scorecard
            key={open.key}
            sc={open}
            max={max}
            inboxUrl={inboxUrl}
            closedNote={
              match?.closedAt
                ? 'The coach has closed this match, so this card can no longer be sent.'
                : match?.rounds.find((r) => r.id === open.roundId)?.closedAt
                  ? `The coach has closed round ${open.roundNumber}, so this card can no longer be sent.`
                  : ''
            }
            onChange={update}
            onDelete={() => {
              removeScorecard(open.key)
              setSaved((list) => list.filter((s) => s.key !== open.key))
              setParams({}, { replace: true })
              toast.success('Card deleted from this phone.')
            }}
          />
        ) : (
          <>
            <SavedCards saved={saved} onOpen={(key) => setParams({ card: key })} />
            {match ? (
              <ChooseCard
                match={match}
                saved={saved}
                onOpen={(key) => setParams({ card: key })}
                onStart={(sc) => {
                  update(sc)
                  setParams({ card: sc.key })
                }}
              />
            ) : (
              !saved.length && (
                <EmptyState title="Match not found" action={<Link to="/matches" className="btn">All matches</Link>}>
                  If you have no internet, open this page once you are connected so the phone can load the match.
                </EmptyState>
              )
            )}
          </>
        )}
      </div>
    </>
  )
}
