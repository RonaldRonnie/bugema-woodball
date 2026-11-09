// Playing cards: the small groups of players who go round the course
// together and share one scorecard.
//
// Seeding rule: cards of 4 players, mixed across the competing groups. With
// three groups that means 2 players from one group and 1 from each of the
// other two; with two groups, 2 + 2. When the line-up does not divide by 4,
// some cards have 3 players (one from each group) so nobody plays alone.

export const CARD_SIZE = 4

function shuffle(list, rng) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function groupCounts(card, groupOf) {
  const counts = new Map()
  for (const pid of card) {
    const g = groupOf.get(pid)
    counts.set(g, (counts.get(g) || 0) + 1)
  }
  return counts
}

/**
 * Swaps players between cards while that spreads the groups more evenly.
 * "Evenly" = the sum over cards of (players per group)², which is smallest
 * when no group has more players on a card than it needs to — e.g. a card of
 * 4 scores 2+1+1 → 6 against 2+2 → 8. Card sizes never change.
 */
function balance(cards, groupOf) {
  for (let pass = 0; pass < 200; pass++) {
    let improved = false
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const ci = groupCounts(cards[i], groupOf)
        const cj = groupCounts(cards[j], groupOf)
        for (const a of ci.keys()) {
          for (const b of cj.keys()) {
            if (a === b) continue
            // Change in score when an `a` player from card i swaps with a `b` player from card j.
            const delta = 2 * ((ci.get(b) || 0) - ci.get(a) + (cj.get(a) || 0) - cj.get(b)) + 4
            if (delta >= 0) continue
            const x = cards[i].findIndex((pid) => groupOf.get(pid) === a)
            const y = cards[j].findIndex((pid) => groupOf.get(pid) === b)
            ;[cards[i][x], cards[j][y]] = [cards[j][y], cards[i][x]]
            improved = true
            break
          }
          if (improved) break
        }
        if (improved) break
      }
      if (improved) break
    }
    if (!improved) return
  }
}

/**
 * Seeds a line-up into playing cards at random, following the mixing rule.
 * `participants` is the match line-up ([{ playerId, groupId }]).
 * Returns an array of cards, each an array of player IDs; larger cards first.
 */
export function seedCards(participants, { size = CARD_SIZE, rng = Math.random } = {}) {
  const n = participants.length
  if (!n) return []
  const cardCount = Math.ceil(n / size)
  const groupOf = new Map(participants.map((p) => [p.playerId, p.groupId]))

  const byGroup = new Map()
  for (const p of participants) {
    if (!byGroup.has(p.groupId)) byGroup.set(p.groupId, [])
    byGroup.get(p.groupId).push(p.playerId)
  }
  // Each group in random order, biggest groups first (random among equals).
  const groups = shuffle([...byGroup.values()], rng)
    .map((list) => shuffle(list, rng))
    .sort((a, b) => b.length - a.length)

  // Deal the players out like playing cards: consecutive players of one group
  // land on different cards, so each group is spread as evenly as possible.
  const cards = Array.from({ length: cardCount }, () => [])
  groups.flat().forEach((pid, i) => cards[i % cardCount].push(pid))
  balance(cards, groupOf)

  return shuffle(cards, rng).sort((a, b) => b.length - a.length)
}

/**
 * Keeps existing cards in step with a changed line-up: players who left are
 * taken off their card (empty cards disappear) and new players join the card
 * with room that has the fewest players from their group.
 */
export function syncCards(cards, participants, { size = CARD_SIZE } = {}) {
  const groupOf = new Map(participants.map((p) => [p.playerId, p.groupId]))
  const placed = new Set()
  const next = cards
    .map((card) => card.filter((pid) => groupOf.has(pid) && !placed.has(pid) && placed.add(pid)))
    .filter((card) => card.length)
  for (const p of participants) {
    if (placed.has(p.playerId)) continue
    placed.add(p.playerId)
    let best = null
    let bestKey = null
    for (const card of next) {
      if (card.length >= size) continue
      const key = [card.filter((pid) => groupOf.get(pid) === p.groupId).length, card.length]
      if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = card
        bestKey = key
      }
    }
    if (best) best.push(p.playerId)
    else next.push([p.playerId])
  }
  return next
}

/** Number of the card a player is on in a match (1-based), or null. */
export function cardNumberOf(match, playerId) {
  const i = (match.cards || []).findIndex((c) => c.playerIds.includes(playerId))
  return i === -1 ? null : i + 1
}

/**
 * Cards ready for display: players in the match's group order, then by name.
 * `unplaced` lists line-up players who are not on any card.
 */
export function describeCards(match, playersById) {
  const groupOf = new Map(match.participants.map((p) => [p.playerId, p.groupId]))
  const groupRank = (gid) => {
    const i = match.groupIds.indexOf(gid)
    return i === -1 ? match.groupIds.length : i
  }
  const entry = (playerId) => ({ playerId, groupId: groupOf.get(playerId) ?? null, player: playersById[playerId] || null })
  const order = (a, b) => groupRank(a.groupId) - groupRank(b.groupId) || (a.player?.name || '').localeCompare(b.player?.name || '')
  const onCard = new Set()
  const cards = (match.cards || []).map((c, i) => {
    c.playerIds.forEach((pid) => onCard.add(pid))
    return { number: i + 1, players: c.playerIds.map(entry).sort(order) }
  })
  const unplaced = match.participants.filter((p) => !onCard.has(p.playerId)).map((p) => entry(p.playerId)).sort(order)
  return { cards, unplaced }
}

/** Plain-text list of the cards, for pasting into a chat group. */
export function cardsText(match, { playersById, groupsById, dateLabel }) {
  const { cards, unplaced } = describeCards(match, playersById)
  const title = match.title || match.groupIds.map((g) => groupsById[g]?.name).join(' vs ')
  const name = (e) => `${e.player?.name || 'Unknown player'}${groupsById[e.groupId] ? ` (${groupsById[e.groupId].name})` : ''}`
  const lines = [`${title}${dateLabel ? ` — ${dateLabel}` : ''}`, '']
  for (const c of cards) lines.push(`Card ${c.number}: ${c.players.map(name).join(', ')}`)
  if (unplaced.length) lines.push(`Not on a card yet: ${unplaced.map(name).join(', ')}`)
  return lines.join('\n')
}

/**
 * Matches on or after `today` that have cards, soonest first (same-day
 * matches in the order they were created).
 */
export function upcomingCardMatches(matches, today) {
  return matches
    .filter((m) => m.date >= today && m.cards?.length)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))
}
