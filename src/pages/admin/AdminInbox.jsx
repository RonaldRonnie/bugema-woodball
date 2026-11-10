import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import { useToast } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, Banner, EmptyState } from '../../components/common.jsx'
import Icon from '../../components/Icons.jsx'
import PublishPanel from '../../components/PublishPanel.jsx'
import { useInboxFeed } from '../../state/inboxFeed.js'
import { inboxItems, isWaiting, cardsCSV } from '../../lib/inbox.js'
import { FAIRWAY_COUNT, roundTotal } from '../../lib/scoring.js'
import { formatDate, formatDateTime, todayISO } from '../../lib/dates.js'
import { downloadCSV } from '../../lib/download.js'

const CHANGE_LABEL = {
  new: () => 'New',
  update: (p) => `Changes your entry (total ${roundTotal(p.current)} → ${roundTotal(p.merged)})`,
  same: () => 'Already entered',
  'not-in-lineup': () => 'Not in the line-up — skipped',
  blank: () => 'No scores — skipped',
  invalid: (p, max) => `A score is above ${max} — enter by hand`,
  skip: () => '',
}

const STATUS = {
  ready: ['tag-warn', 'Waiting'],
  problem: ['tag-warn', 'Needs a look'],
  entered: ['tag-ok', 'Already in the results'],
  replaced: ['', 'Replaced by a newer copy'],
  accepted: ['tag-ok', 'Accepted'],
  dismissed: ['', 'Dismissed'],
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Waiting cards in playing order: match date, match, round, card number. */
const playingOrder = (a, b) =>
  a.card.match.date.localeCompare(b.card.match.date) ||
  a.card.match.id.localeCompare(b.card.match.id) ||
  a.card.round.number - b.card.round.number ||
  a.card.card - b.card.card

function InboxCard({ item, max, onAccept, onDismiss }) {
  const { card, players, problem, usable, status } = item
  const [tagClass, tagLabel] = STATUS[status]
  const differs = (p, i) => p.change === 'update' && p.fairways[i] != null && p.fairways[i] !== (p.current?.[i] ?? null)
  const anyDiffers = players.some((p) => p.fairways.some((_, i) => differs(p, i)))
  return (
    <article className="card" aria-label={`Card ${card.card}, round ${card.round.number}, ${card.match.title}`}>
      <div className="card-header">
        <div>
          <h2>
            Card {card.card} · Round {card.round.number}
          </h2>
          <div className="inbox-meta">
            <span>
              <strong>{item.match?.title || card.match.title}</strong>
            </span>
            <span>{formatDate(card.match.date, { weekday: true })}</span>
            <span>Kept by {card.scorer}</span>
            <span>Sent {formatDateTime(card.submittedAt)}</span>
          </div>
        </div>
        <span className={`tag ${tagClass}`}>{tagLabel}</span>
      </div>
      {problem && <Banner kind="warning">{problem} Dismiss it, or enter the scores by hand.</Banner>}
      <div className="table-wrap">
        <table className="table table-compact inbox-table">
          <thead>
            <tr>
              <th className="sticky-col">Player</th>
              {Array.from({ length: FAIRWAY_COUNT }, (_, i) => (
                <th key={i} className="num">
                  F{i + 1}
                </th>
              ))}
              <th className="num">Total</th>
              <th>In your results</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="sticky-col nowrap">
                  {p.name}
                  {p.group && <span className="small muted"> · {p.group}</span>}
                </td>
                {p.fairways.map((v, i) => (
                  <td key={i} className={`num ${v == null ? 'blank' : ''} ${differs(p, i) ? 'differs' : ''}`}>
                    {v ?? '·'}
                  </td>
                ))}
                <td className="num strong">{roundTotal(p.fairways)}</td>
                <td className="small nowrap">{CHANGE_LABEL[p.change](p, max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anyDiffers && <p className="small muted mt-1 mb-0">Highlighted scores differ from what is already entered; accepting replaces them.</p>}
      {isWaiting(item) && (
        <div className="form-actions">
          {status === 'ready' && (
            <button type="button" className="btn btn-primary" onClick={() => onAccept(item)}>
              <Icon name="check" /> Accept {plural(usable.length, 'player')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => onDismiss(item)}>
            Dismiss
          </button>
        </div>
      )}
    </article>
  )
}

export default function AdminInbox() {
  useTitle('Score inbox')
  const { data, commit, actions, meta, updateMeta } = useData()
  const toast = useToast()
  const url = data.settings.scoreInboxUrl
  const feed = useInboxFeed(url)
  const [accepted, setAccepted] = useState(0) // players added during this visit
  const handled = useMemo(() => meta.inboxHandled || {}, [meta.inboxHandled])
  const items = useMemo(() => (feed.cards ? inboxItems(feed.cards, data, handled) : []), [feed.cards, data, handled])
  const waiting = items.filter(isWaiting).sort(playingOrder)
  const ready = waiting.filter((i) => i.status === 'ready')
  const done = items.filter((i) => !isWaiting(i))

  const mark = (ids, status) => {
    const next = { ...handled }
    for (const id of ids) {
      if (status) next[id] = status
      else delete next[id]
    }
    // Forget cards that are no longer in the inbox (e.g. deleted from the sheet).
    if (feed.cards) {
      const present = new Set(feed.cards.map((c) => c.id))
      for (const id of Object.keys(next)) if (!present.has(id)) delete next[id]
    }
    updateMeta({ inboxHandled: next })
  }

  const accept = (list) => {
    const res = commit((d) => {
      let n = 0
      for (const item of list) {
        n += actions.acceptCardScores(d, {
          matchId: item.match.id,
          roundId: item.round.id,
          players: item.usable.map((p) => ({ playerId: p.id, fairways: p.merged })),
        })
      }
      return n
    })
    if (!res.ok) return
    mark(
      list.map((i) => i.card.id),
      'accepted',
    )
    setAccepted((n) => n + res.value)
    toast.success(`${list.length === 1 ? 'Card' : `${list.length} cards`} accepted — ${plural(res.value, 'player')} updated. Publish when you are ready.`)
  }

  const exportCSV = () => {
    if (!feed.cards?.length) return
    downloadCSV(cardsCSV(feed.cards), `score_inbox_${todayISO()}.csv`)
  }

  if (!url) {
    return (
      <>
        <PageHeader title="Score inbox" subtitle="Playing cards sent from players’ phones." />
        <section className="card" style={{ maxWidth: 720 }}>
          <h2>Not set up yet</h2>
          <p>
            With the score inbox, one player per playing card keeps score on their phone after each fairway — it works without internet — and submits the card
            at the end. The cards arrive here; you check them, accept them and publish.
          </p>
          <p className="mb-0">
            It needs a free Google Sheet in your Google account to receive the cards (about 10 minutes, once).{' '}
            <Link to="/admin/settings#score-inbox">Set it up in Settings →</Link>
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Score inbox"
        subtitle="Playing cards sent from players’ phones. Check them, accept them, then publish."
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={feed.refresh} disabled={feed.loading}>
              <Icon name="download" /> {feed.loading ? 'Checking…' : 'Check for new cards'}
            </button>
            <button type="button" className="btn btn-sm" onClick={exportCSV} disabled={!feed.cards?.length}>
              <Icon name="file" /> Download CSV
            </button>
          </>
        }
      />
      <div className="stack">
        {feed.error && (
          <Banner kind="danger">
            {feed.error}{' '}
            <button type="button" className="btn btn-sm" onClick={feed.refresh}>
              Try again
            </button>
          </Banner>
        )}
        {feed.checkedAt && (
          <p className="small muted mb-0" role="status">
            Checked {formatDateTime(feed.checkedAt)} · {plural(feed.cards.length, 'card')} in the inbox · {waiting.length} waiting
          </p>
        )}
        {accepted > 0 && (
          <Banner kind="success">
            <p>
              <strong>{plural(accepted, 'player')} updated.</strong> Publish the results so everyone can see them.
            </p>
            <button type="button" className="btn btn-sm btn-accent" onClick={() => document.getElementById('publish')?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="upload" /> Go to publish
            </button>
          </Banner>
        )}

        {ready.length > 1 && (
          <div className="row-between">
            <span className="small">
              {plural(ready.length, 'card')} ready to add ({plural(
                ready.reduce((n, i) => n + i.usable.length, 0),
                'player',
              )}).
            </span>
            <button type="button" className="btn btn-primary" onClick={() => accept(ready)}>
              <Icon name="check" /> Accept all {ready.length} cards
            </button>
          </div>
        )}

        {feed.cards == null && feed.loading && <p className="muted">Checking the score inbox…</p>}
        {feed.cards != null && waiting.length === 0 && (
          <EmptyState icon="📭" title="No new cards">
            Cards appear here when players submit them. Check again during or after the match.
          </EmptyState>
        )}
        {waiting.map((item) => (
          <InboxCard
            key={item.card.id}
            item={item}
            max={data.settings.maxStrokesPerFairway}
            onAccept={(i) => accept([i])}
            onDismiss={(i) => {
              mark([i.card.id], 'dismissed')
              toast.success('Card dismissed. You can bring it back under “Handled cards”.')
            }}
          />
        ))}

        <PublishPanel />

        {done.length > 0 && (
          <details className="card table-toggle">
            <summary>Handled cards ({done.length})</summary>
            <ul className="list mt-1">
              {done.slice(0, 40).map((item) => {
                const [tagClass, tagLabel] = STATUS[item.status]
                return (
                  <li key={item.card.id} className="list-item">
                    <div className="list-main">
                      <div className="list-title">
                        Card {item.card.card} · Round {item.card.round.number} — {item.card.match.title}
                      </div>
                      <div className="list-meta">
                        <span>{formatDate(item.card.match.date)}</span>
                        <span>Kept by {item.card.scorer}</span>
                        <span>Sent {formatDateTime(item.card.submittedAt)}</span>
                        <span className={`tag ${tagClass}`}>{tagLabel}</span>
                      </div>
                    </div>
                    {item.status === 'dismissed' && (
                      <button type="button" className="btn btn-sm" onClick={() => mark([item.card.id], null)}>
                        Bring back
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            {done.length > 40 && <p className="small muted mb-0">Showing the 40 newest. Download the CSV for all cards.</p>}
          </details>
        )}
      </div>
    </>
  )
}
