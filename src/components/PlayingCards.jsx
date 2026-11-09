import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../state/UIContext.jsx'
import Icon from './Icons.jsx'
import { describeCards, cardsText } from '../lib/cards.js'
import { formatDate } from '../lib/dates.js'

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / non-secure pages: fall back to a hidden text box.
    const box = document.createElement('textarea')
    box.value = text
    box.setAttribute('readonly', '')
    box.style.position = 'fixed'
    box.style.opacity = '0'
    document.body.appendChild(box)
    box.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    box.remove()
    return ok
  }
}

function PlayerLine({ entry, groupsById, link, mark, children }) {
  const group = groupsById[entry.groupId]
  const name = entry.player?.name || 'Unknown player'
  return (
    <li className={mark ? 'is-found' : undefined}>
      <span className="group-dot" style={{ background: group?.color }} aria-hidden="true" />
      <span className="play-card-name">
        {link ? <Link to={`/players/${entry.playerId}`}>{name}</Link> : name}
        <span className="play-card-group">{group?.name || 'No group'}</span>
      </span>
      {children}
    </li>
  )
}

/** Read-only cards for a match, with "find your name" and sharing. */
export function MatchCards({ match, playersById, groupsById }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const { cards, unplaced } = useMemo(() => describeCards(match, playersById), [match, playersById])
  if (!cards.length) return null

  const q = query.trim().toLowerCase()
  const isFound = (e) => q && (e.player?.name || '').toLowerCase().includes(q)
  const shown = q ? cards.filter((c) => c.players.some(isFound)) : cards
  const sizes = new Set(cards.map((c) => c.players.length))

  const share = async () => {
    const text = cardsText(match, { playersById, groupsById, dateLabel: formatDate(match.date, { weekday: true }) })
    if (canShare()) {
      try {
        await navigator.share({ title: 'Playing cards', text })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return // the user closed the share sheet
      }
    }
    if (await copyText(text)) toast.success('Card list copied. Paste it into WhatsApp or a message.')
    else toast.error('Copying is blocked in this browser. Take a screenshot of the cards instead.')
  }

  return (
    <section className="card" aria-labelledby="cards-title">
      <div className="card-header">
        <div>
          <h2 id="cards-title">Playing cards</h2>
          <p className="card-sub">
            {cards.length} card{cards.length === 1 ? '' : 's'} of {[...sizes].sort((a, b) => b - a).join(' or ')} players · each card plays together and
            shares a scorecard
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={share}>
          <Icon name="share" /> {canShare() ? 'Share' : 'Copy list'}
        </button>
      </div>
      {cards.length > 2 && (
        <input
          type="search"
          className="input cards-search"
          placeholder="Find your name…"
          aria-label="Find a player's card"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {shown.length ? (
        <div className="cards-grid">
          {shown.map((c) => (
            <article key={c.number} className="play-card" aria-label={`Card ${c.number}`}>
              <h3>Card {c.number}</h3>
              <ul>
                {c.players.map((e) => (
                  <PlayerLine key={e.playerId} entry={e} groupsById={groupsById} link mark={isFound(e)} />
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted mb-0">No player on a card matches “{query.trim()}”.</p>
      )}
      {unplaced.length > 0 && !q && (
        <p className="small muted mt-1 mb-0">Not on a card yet: {unplaced.map((e) => e.player?.name).join(', ')}</p>
      )}
    </section>
  )
}

/**
 * Editable cards for the match form. `cards` is a list of player-ID lists;
 * `onMove(playerId, targetIndex | 'new')` moves a player to another card.
 */
export function CardsEditor({ groupIds, participants, cards, playersById, groupsById, onMove }) {
  const described = useMemo(
    () => describeCards({ groupIds, participants, cards: cards.map((playerIds) => ({ playerIds })) }, playersById),
    [groupIds, participants, cards, playersById],
  )
  const odd = described.cards.filter((c) => c.players.length < 3 || c.players.length > 4)

  return (
    <>
      <div className="cards-grid">
        {described.cards.map((c, index) => (
          <article key={c.number} className="play-card" aria-label={`Card ${c.number}`}>
            <h3>
              Card {c.number} <span className="play-card-count">{c.players.length} players</span>
            </h3>
            <ul>
              {c.players.map((e) => (
                <PlayerLine key={e.playerId} entry={e} groupsById={groupsById}>
                  <select
                    className="select select-compact"
                    aria-label={`Card for ${e.player?.name || 'player'}`}
                    value={index}
                    onChange={(ev) => onMove(e.playerId, ev.target.value === 'new' ? 'new' : Number(ev.target.value))}
                  >
                    {described.cards.map((_, i) => (
                      <option key={i} value={i}>
                        Card {i + 1}
                      </option>
                    ))}
                    <option value="new">New card</option>
                  </select>
                </PlayerLine>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {odd.length > 0 && (
        <p className="small mt-1 mb-0" style={{ color: 'var(--warning-text)' }} role="status">
          {odd.map((c) => `Card ${c.number} has ${c.players.length} player${c.players.length === 1 ? '' : 's'}`).join(' · ')}. Move players or reshuffle if
          that is not what you want.
        </p>
      )}
    </>
  )
}
