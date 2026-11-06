import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useData, useLookups } from '../../state/DataContext.jsx'
import { useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, EmptyState, ResultBadge, GroupBadge } from '../../components/common.jsx'
import { PlayerAvatar } from '../../components/media.jsx'
import Icon from '../../components/Icons.jsx'
import { FAIRWAY_COUNT, roundTotal, isRoundComplete, filledCount, computeOutcome, hasResult } from '../../lib/scoring.js'
import { formatDate } from '../../lib/dates.js'
import { formatAvg } from '../../lib/stats.js'
import { readPref, writePref } from '../../services/storage.js'

const EMPTY_ROUND = Object.freeze(Array(FAIRWAY_COUNT).fill(null))

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * Interprets typed digits for one fairway. Returns { value, valid, done }:
 * `done` means no further digit could make a valid score, so the cursor
 * should move on (e.g. with a limit of 15, "4" is final but "1" may become 12).
 */
export function interpretStroke(text, max) {
  const t = String(text).replace(/\D/g, '').slice(0, 2)
  if (t === '') return { text: t, value: null, valid: true, done: false }
  const n = parseInt(t, 10)
  const valid = n >= 1 && n <= max
  return { text: t, value: valid ? n : null, valid, done: valid && (t.length >= 2 || n * 10 > max) }
}

// ----------------------------------------------------- player-by-player card

function PlayerCard({ player, group, fairways, max, keypad, onSave, onNext, onPrev, onClear, hasNext, hasPrev, position }) {
  const [texts, setTexts] = useState(() => (fairways || Array(FAIRWAY_COUNT).fill(null)).map((v) => (v == null ? '' : String(v))))
  const [invalid, setInvalid] = useState(() => Array(FAIRWAY_COUNT).fill(false))
  const [active, setActive] = useState(() => {
    const firstEmpty = (fairways || []).findIndex((v) => v == null)
    return fairways ? (firstEmpty === -1 ? 0 : firstEmpty) : 0
  })
  const [saved, setSaved] = useState(false)
  const fresh = useRef(true) // next digit replaces the cell's value
  const inputs = useRef([])
  const nextBtn = useRef(null)

  // The saved scores are the source of truth for the total and progress,
  // so what the coach sees always matches what is stored.
  const stored = fairways || EMPTY_ROUND
  const total = roundTotal(stored)
  const filled = filledCount(stored)
  const complete = isRoundComplete(stored)
  const asText = (v) => (v == null ? '' : String(v))

  // When the saved scores change from outside this card (cleared, edited in
  // another tab), show them instead of what was typed here.
  const storedKey = JSON.stringify(stored)
  useEffect(() => {
    const shown = texts.map((t, i) => (invalid[i] ? stored[i] : interpretStroke(t, max).value))
    if (shown.every((v, i) => v === (stored[i] ?? null))) return
    setTexts(stored.map(asText))
    setInvalid(Array(FAIRWAY_COUNT).fill(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey])

  // An invalid entry is never saved; put the saved value back when leaving the cell.
  const revertInvalid = (except) => {
    if (!invalid.some((bad, i) => bad && i !== except)) return
    setTexts((t) => t.map((txt, i) => (invalid[i] && i !== except ? asText(stored[i]) : txt)))
    setInvalid((v) => v.map((bad, i) => bad && i === except))
  }

  const focusCell = (i) => {
    revertInvalid(i)
    setActive(i)
    fresh.current = true
    if (!keypad) inputs.current[i]?.focus()
  }

  const advance = (i) => {
    if (i < FAIRWAY_COUNT - 1) focusCell(i + 1)
    else {
      revertInvalid(-1)
      setActive(-1)
      if (!keypad) inputs.current[i]?.blur()
      nextBtn.current?.focus({ preventScroll: true })
    }
  }

  const apply = (i, raw) => {
    const r = interpretStroke(raw, max)
    setTexts((t) => Object.assign([...t], { [i]: r.text }))
    setInvalid((v) => Object.assign([...v], { [i]: !r.valid }))
    fresh.current = false
    if (!r.valid) return
    const ok = onSave(i, r.value)
    if (ok) {
      setSaved(true)
      if (r.done) advance(i)
    }
  }

  const press = (key) => {
    if (active === -1) {
      // All 12 fairways done: "Next" moves on to the next player.
      if (key === 'next' && hasNext) onNext()
      return
    }
    const i = active
    if (key === 'back') apply(i, fresh.current ? '' : texts[i].slice(0, -1))
    else if (key === 'next') advance(i)
    else apply(i, (fresh.current ? '' : texts[i]) + key)
  }

  // Physical keyboard support while the on-screen keypad is in use.
  useEffect(() => {
    if (!keypad) return
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea, button') && !e.target.classList?.contains('fw-input')) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter') {
        e.preventDefault()
        press('next')
      } else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="card entry-panel">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
          <PlayerAvatar player={player} group={group} size={44} />
          <div style={{ minWidth: 0 }}>
            <h2 className="mb-0" style={{ fontSize: '1.1rem', overflowWrap: 'anywhere' }}>
              {player.name}
            </h2>
            <div className="small muted">
              <GroupBadge group={group} /> · player {position}
            </div>
          </div>
        </div>
        {saved && (
          <span className="save-state" role="status">
            <Icon name="check" width="14" height="14" /> Saved
          </span>
        )}
      </div>

      <div className="fairway-grid" role="group" aria-label={`Fairway scores for ${player.name}`}>
        {texts.map((t, i) => (
          <div
            key={i}
            className={`fw-cell ${active === i ? 'active' : ''} ${invalid[i] ? 'invalid' : ''}`}
            onClick={() => focusCell(i)}
          >
            <label htmlFor={`fw-${i}`}>F{i + 1}</label>
            <input
              id={`fw-${i}`}
              ref={(el) => (inputs.current[i] = el)}
              className="fw-input"
              type="text"
              inputMode={keypad ? 'none' : 'numeric'}
              pattern="[0-9]*"
              enterKeyHint="next"
              autoComplete="off"
              readOnly={keypad}
              value={t}
              aria-invalid={invalid[i]}
              aria-label={`Fairway ${i + 1} strokes`}
              onFocus={(e) => {
                if (active !== i) revertInvalid(i)
                setActive(i)
                fresh.current = true
                if (!keypad) e.target.select()
              }}
              onChange={(e) => {
                // Typing over a selected value replaces it; otherwise append.
                apply(i, e.target.value)
              }}
              onKeyDown={(e) => {
                if (keypad) return
                if (e.key === 'Enter') {
                  e.preventDefault()
                  advance(i)
                }
              }}
            />
          </div>
        ))}
      </div>
      {invalid.some(Boolean) && (
        <p className="field-error mt-1" role="alert">
          Each fairway score must be a whole number from 1 to {max}.
        </p>
      )}

      <div className="entry-total" aria-live="polite">
        <div>
          <div className="entry-total-label">Total strokes</div>
          <div className="entry-total-value">{total}</div>
        </div>
        <div className="entry-total-label" style={{ textAlign: 'right' }}>
          {filled}/12 fairways
          <br />
          {complete ? 'Round complete ✓' : 'In progress'}
        </div>
      </div>

      {keypad && (
        <div className="keypad" aria-label="Score keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="key-action" onClick={() => press('back')} aria-label="Delete">
            ⌫
          </button>
          <button type="button" onClick={() => press('0')}>
            0
          </button>
          <button type="button" className="key-next" onClick={() => press('next')}>
            Next →
          </button>
        </div>
      )}

      <div className="row-between mt-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={filled === 0}>
          Clear / absent
        </button>
        <div className="row">
          <button type="button" className="btn" onClick={onPrev} disabled={!hasPrev} aria-label="Previous player">
            <Icon name="back" />
          </button>
          <button ref={nextBtn} type="button" className={`btn ${complete ? 'btn-accent' : ''}`} onClick={onNext} disabled={!hasNext}>
            Next player <Icon name="next" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ table entry

function ScoreCell({ value, max, onSave, onAdvance, onNav, register, label }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) {
      setText(value == null ? '' : String(value))
      setInvalid(false)
    }
  }, [value])

  return (
    <input
      ref={register}
      className="cell-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={text}
      aria-label={label}
      aria-invalid={invalid}
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onBlur={() => {
        focused.current = false
        if (invalid) {
          setText(value == null ? '' : String(value))
          setInvalid(false)
        }
      }}
      onChange={(e) => {
        const r = interpretStroke(e.target.value, max)
        setText(r.text)
        setInvalid(!r.valid)
        if (r.valid && onSave(r.value) && r.done) onAdvance()
      }}
      onKeyDown={(e) => {
        const map = { ArrowUp: 'up', ArrowDown: 'down', Enter: 'next' }
        if (map[e.key]) {
          e.preventDefault()
          onNav(map[e.key])
        } else if (e.key === 'ArrowRight' && e.target.selectionEnd === e.target.value.length) {
          e.preventDefault()
          onNav('right')
        } else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) {
          e.preventDefault()
          onNav('left')
        }
      }}
    />
  )
}

function TableEntry({ rows, round, max, onSave, groupsById }) {
  const cells = useRef({})
  const focus = (r, c) => {
    const el = cells.current[`${r}:${c}`]
    if (el) el.focus()
  }
  const nav = (r, c, dir) => {
    if (dir === 'up') focus(Math.max(0, r - 1), c)
    else if (dir === 'down') focus(Math.min(rows.length - 1, r + 1), c)
    else if (dir === 'left') focus(r, Math.max(0, c - 1))
    else if (c < FAIRWAY_COUNT - 1) focus(r, c + 1)
    else if (r < rows.length - 1) focus(r + 1, 0)
    else cells.current[`${r}:${c}`]?.blur() // last cell of the last player: stop here
  }

  return (
    <div className="card card-flush">
      <div className="table-wrap">
        <table className="table score-table">
          <caption className="sr-only">Fairway scores, round {round.number}</caption>
          <thead>
            <tr>
              <th className="sticky-col">Player</th>
              {Array.from({ length: FAIRWAY_COUNT }, (_, i) => (
                <th key={i} className="center">
                  F{i + 1}
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ participant, player }, r) => {
              const f = round.scores[participant.playerId]
              return (
                <tr key={participant.playerId}>
                  <td className="sticky-col nowrap" style={{ minWidth: 150 }}>
                    <span className="group-dot" style={{ background: groupsById[participant.groupId]?.color, marginRight: 6 }} aria-hidden="true" />
                    {player?.name}
                  </td>
                  {Array.from({ length: FAIRWAY_COUNT }, (_, c) => (
                    <td key={c}>
                      <ScoreCell
                        value={f?.[c] ?? null}
                        max={max}
                        label={`${player?.name}, fairway ${c + 1}`}
                        register={(el) => (cells.current[`${r}:${c}`] = el)}
                        onSave={(v) => onSave(participant.playerId, c, v)}
                        onAdvance={() => nav(r, c, 'next')}
                        onNav={(dir) => nav(r, c, dir)}
                      />
                    </td>
                  ))}
                  <td className="num strong">
                    {f ? roundTotal(f) : '—'}
                    {f && !isRoundComplete(f) && <span className="muted">*</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ padding: '8px 16px', margin: 0 }}>
        Type a score and the cursor moves on automatically. Enter = next cell · ↑ ↓ = move between players · * = round in progress. Every
        change is saved immediately.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------- page

export default function ScoreEntry() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data, commit, actions } = useData()
  const { groupsById, playersById } = useLookups()
  const confirm = useConfirm()
  const match = data.matches.find((m) => m.id === matchId)
  useTitle(match ? `Scores · ${match.title}` : 'Scores')

  const [mode, setModeState] = useState(() => readPref('scoreMode', typeof window !== 'undefined' && window.innerWidth >= 900 ? 'table' : 'cards'))
  const [keypad, setKeypadState] = useState(() => readPref('keypad', isTouchDevice()))
  const setMode = (m) => {
    setModeState(m)
    writePref('scoreMode', m)
  }
  const setKeypad = (k) => {
    setKeypadState(k)
    writePref('keypad', k)
  }
  const [renumber, setRenumber] = useState('')

  const rounds = useMemo(() => (match ? [...match.rounds].sort((a, b) => a.number - b.number) : []), [match])
  const round = rounds.find((r) => r.id === params.get('round')) || rounds[0]
  const rows = useMemo(() => {
    if (!match) return []
    return match.groupIds.flatMap((gid) =>
      match.participants
        .filter((p) => p.groupId === gid)
        .map((p) => ({ participant: p, player: playersById[p.playerId] }))
        .sort((a, b) => (a.player?.name || '').localeCompare(b.player?.name || '')),
    )
  }, [match, playersById])
  const playerIndex = Math.max(
    0,
    rows.findIndex((r) => r.participant.playerId === params.get('player')),
  )
  const current = rows[playerIndex]
  const max = data.settings.maxStrokesPerFairway

  const select = useCallback(
    (patch) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(patch)) next.set(k, v)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const save = useCallback(
    (playerId, index, value) => commit((d) => actions.setFairwayScore(d, matchId, round.id, playerId, index, value)).ok,
    [commit, actions, matchId, round?.id],
  )

  if (!match) return <EmptyState title="Match not found" action={<Link to="/admin/matches" className="btn">Back to matches</Link>} />
  if (!round) return <EmptyState title="This match has no rounds" action={<Link to="/admin/matches" className="btn">Back to matches</Link>} />

  const outcome = computeOutcome(match, data.settings)

  const addRound = () => {
    const res = commit((d) => actions.addRound(d, match.id), { success: 'Round added.' })
    if (res.ok) select({ round: res.value, player: rows[0]?.participant.playerId || '' })
  }
  const deleteRound = async () => {
    const entered = Object.keys(round.scores).length
    const ok = await confirm({
      title: `Delete round ${round.number}?`,
      message: entered ? `${entered} player score card(s) in this round will be deleted.` : 'This round has no scores yet.',
      confirmLabel: 'Delete round',
      danger: true,
    })
    if (ok && commit((d) => actions.deleteRound(d, match.id, round.id), { success: 'Round deleted.' }).ok) {
      const next = new URLSearchParams(params)
      next.delete('round')
      setParams(next, { replace: true })
    }
  }
  const applyRenumber = (e) => {
    e.preventDefault()
    if (commit((d) => actions.setRoundNumber(d, match.id, round.id, Number(renumber)), { success: 'Round renumbered.' }).ok) setRenumber('')
  }
  const clearPlayer = async () => {
    const ok = await confirm({
      title: 'Clear these scores?',
      message: `All fairway scores for ${current.player?.name} in round ${round.number} will be removed (e.g. the player was absent).`,
      confirmLabel: 'Clear scores',
      danger: true,
    })
    if (ok) commit((d) => actions.clearPlayerRound(d, match.id, round.id, current.participant.playerId), { success: 'Scores cleared.' })
  }

  const statusOf = (pid) => {
    const f = round.scores[pid]
    if (!f) return { label: '—', cls: 'muted' }
    if (isRoundComplete(f)) return { label: `${roundTotal(f)} ✓`, cls: '' }
    return { label: `${filledCount(f)}/12`, cls: 'muted' }
  }
  const doneCount = rows.filter((r) => isRoundComplete(round.scores[r.participant.playerId])).length

  return (
    <>
      <PageHeader
        back={{ to: '/admin/matches', label: 'Matches' }}
        title={match.title}
        subtitle={`${formatDate(match.date, { weekday: true })} · ${match.type === 'practice' ? 'Practice' : 'Competitive match'}`}
        actions={
          <>
            <Link to={`/matches/${match.id}`} className="btn btn-sm">
              View scorecard
            </Link>
            <Link to={`/admin/matches/${match.id}/edit`} className="btn btn-sm">
              <Icon name="edit" /> Details & line-up
            </Link>
          </>
        }
      />

      {!rows.length ? (
        <div className="card">
          <EmptyState
            title="No players in the line-up"
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/admin/matches/${match.id}/edit`)}>
                Choose players
              </button>
            }
          >
            Add players to this match before entering scores.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          <section className="card">
            <div className="row-between">
              <div className="round-tabs" role="tablist" aria-label="Rounds">
                {rounds.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    className="chip"
                    aria-selected={r.id === round.id}
                    aria-pressed={r.id === round.id}
                    onClick={() => select({ round: r.id })}
                  >
                    Round {r.number}
                  </button>
                ))}
                <button type="button" className="chip" onClick={addRound}>
                  <Icon name="plus" width="16" height="16" /> Add round
                </button>
              </div>
              <div className="segmented" role="group" aria-label="Entry layout">
                <button type="button" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>
                  Player by player
                </button>
                <button type="button" aria-pressed={mode === 'table'} onClick={() => setMode('table')}>
                  Table
                </button>
              </div>
            </div>
            <div className="row-between mt-1 small">
              <span className="muted">
                Round {round.number}: {doneCount}/{rows.length} score cards complete
              </span>
              <span className="row" style={{ gap: 6 }}>
                {hasResult(outcome) ? (
                  <>
                    <span className="muted">{outcome.status === 'live' ? 'Live result:' : 'Final result:'}</span>
                    {match.groupIds.map((g) => (
                      <span key={g} className="row" style={{ gap: 4 }}>
                        <span className="group-dot" style={{ background: groupsById[g]?.color }} aria-hidden="true" />
                        {groupsById[g]?.name} <ResultBadge result={outcome.results[g]} live={outcome.status === 'live'} />
                        <span className="muted">({formatAvg(outcome.metrics[g]?.avgStrokes)})</span>
                      </span>
                    ))}
                  </>
                ) : outcome.status === 'pending' ? (
                  <span className="tag tag-warn">Result pending</span>
                ) : (
                  <span className="tag">Practice — no points</span>
                )}
              </span>
            </div>
            <details className="table-toggle mt-1">
              <summary>Round options</summary>
              <div className="row mt-1">
                <form onSubmit={applyRenumber} className="row">
                  <label htmlFor="renumber" className="small">
                    Round number
                  </label>
                  <input
                    id="renumber"
                    className="input"
                    style={{ width: 90 }}
                    type="number"
                    min="1"
                    max="99"
                    inputMode="numeric"
                    placeholder={String(round.number)}
                    value={renumber}
                    onChange={(e) => setRenumber(e.target.value)}
                  />
                  <button type="submit" className="btn btn-sm" disabled={!renumber}>
                    Renumber
                  </button>
                </form>
                <button type="button" className="btn btn-sm btn-ghost" onClick={deleteRound} disabled={rounds.length === 1} style={{ color: 'var(--danger)' }}>
                  <Icon name="trash" /> Delete round {round.number}
                </button>
              </div>
            </details>
          </section>

          {mode === 'table' ? (
            <TableEntry key={round.id} rows={rows} round={round} max={max} onSave={save} groupsById={groupsById} />
          ) : (
            <div className="entry-layout">
              <div className="entry-list">
                <section className="card card-flush">
                  {match.groupIds.map((gid) => (
                    <div key={gid}>
                      <div className="group-heading">
                        <span className="group-dot" style={{ background: groupsById[gid]?.color }} aria-hidden="true" />
                        {groupsById[gid]?.name}
                      </div>
                      {rows
                        .filter((r) => r.participant.groupId === gid)
                        .map((r) => {
                          const st = statusOf(r.participant.playerId)
                          return (
                            <button
                              key={r.participant.playerId}
                              type="button"
                              className="player-pick"
                              aria-current={r === current}
                              onClick={() => {
                                select({ player: r.participant.playerId, round: round.id })
                                window.scrollTo({ top: 0 })
                              }}
                            >
                              <PlayerAvatar player={r.player} group={groupsById[gid]} size={32} />
                              <span className="list-main">
                                <span className="list-title" style={{ display: 'block' }}>
                                  {r.player?.name}
                                </span>
                              </span>
                              <span className={`pick-status ${st.cls}`}>{st.label}</span>
                            </button>
                          )
                        })}
                    </div>
                  ))}
                </section>
              </div>
              <div className="entry-main">
                <PlayerCard
                  key={`${round.id}:${current.participant.playerId}`}
                  player={current.player}
                  group={groupsById[current.participant.groupId]}
                  fairways={round.scores[current.participant.playerId]}
                  max={max}
                  keypad={keypad}
                  position={`${playerIndex + 1} of ${rows.length}`}
                  onSave={(i, v) => save(current.participant.playerId, i, v)}
                  hasPrev={playerIndex > 0}
                  hasNext={playerIndex < rows.length - 1}
                  onPrev={() => select({ player: rows[playerIndex - 1].participant.playerId, round: round.id })}
                  onNext={() => select({ player: rows[playerIndex + 1].participant.playerId, round: round.id })}
                  onClear={clearPlayer}
                />
                <label className="check small" style={{ marginTop: 4 }}>
                  <input type="checkbox" checked={keypad} onChange={(e) => setKeypad(e.target.checked)} />
                  Use the on-screen keypad (keeps the phone keyboard from covering the scores)
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
