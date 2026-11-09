import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { StatTile, EmptyState, GroupBadge } from '../components/common.jsx'
import { StandingsTable, PlayerRankingTable, MatchRow } from '../components/tables.jsx'
import { GroupTrendChart, PointsChart } from '../components/charts.jsx'
import { StoredImage, DefaultMark } from '../components/media.jsx'
import { computeStandings, sortMatches } from '../lib/scoring.js'
import { teamSummary, allPlayerStats, groupTrend, formatAvg } from '../lib/stats.js'
import { upcomingCardMatches } from '../lib/cards.js'
import { formatDate, todayISO } from '../lib/dates.js'
import Icon from '../components/Icons.jsx'

/** Upcoming matches whose playing cards are out. */
function UpcomingCards({ matches, groupsById }) {
  if (!matches.length) return null
  return (
    <section className="card card-flush" aria-labelledby="upcoming-title">
      <div className="card-header">
        <div>
          <h2 id="upcoming-title">Playing cards are out</h2>
          <p className="card-sub">See who you are playing with</p>
        </div>
      </div>
      <div className="list">
        {matches.map((m) => (
          <Link key={m.id} to={`/matches/${m.id}`} className="list-item">
            <div className="list-main">
              <div className="list-title">{m.title || m.groupIds.map((g) => groupsById[g]?.name).join(' vs ')}</div>
              <div className="list-meta">
                <span>{formatDate(m.date, { weekday: true })}</span>
                {m.venue && <span>{m.venue}</span>}
                <span>
                  {m.cards.length} card{m.cards.length === 1 ? '' : 's'} · {m.participants.length} players
                </span>
              </div>
            </div>
            <span className="list-end small strong nowrap">
              View cards <Icon name="next" width="16" height="16" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Hero({ settings, photo }) {
  return (
    <section className="hero" aria-label="Team">
      {photo ? (
        <StoredImage
          imageId={photo.imageId}
          className="hero-img"
          alt={photo.caption || 'Team photo'}
          fallback={<DefaultMark className="hero-mark" size={220} />}
        />
      ) : (
        <DefaultMark className="hero-mark" size={220} />
      )}
      <div className="hero-content">
        <h1>{settings.teamName}</h1>
        {settings.tagline && <p>{settings.tagline}</p>}
        {photo?.caption && <div className="hero-caption">{photo.caption}</div>}
      </div>
    </section>
  )
}

export default function Dashboard() {
  useTitle(null)
  const { data } = useData()
  const { groupsById } = useLookups()

  const summary = useMemo(() => teamSummary(data), [data])
  const standings = useMemo(() => computeStandings(data), [data])
  const players = useMemo(() => allPlayerStats(data), [data])
  const trend = useMemo(() => groupTrend(data), [data])
  const recent = useMemo(() => sortMatches(data.matches, 'desc').slice(0, 5), [data])
  const upcoming = useMemo(() => upcomingCardMatches(data.matches, todayISO()).slice(0, 3), [data])
  const [heroPhoto, ...galleryPhotos] = data.teamPhotos

  return (
    <div className="stack">
      <Hero settings={data.settings} photo={heroPhoto} />

      <UpcomingCards matches={upcoming} groupsById={groupsById} />

      <section className="stat-grid" aria-label="Team totals">
        <StatTile label="Players" value={summary.activePlayers} note={`${summary.totalGroups} groups · ${summary.totalPlayers} registered`} />
        <StatTile
          label="Matches"
          value={summary.competitiveMatches}
          note={`${summary.practiceSessions} practice session${summary.practiceSessions === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Rounds completed"
          value={summary.playerRounds}
          note={summary.incompleteRounds ? `+${summary.incompleteRounds} in progress` : '12 fairways each'}
        />
        <StatTile label="Team average" value={formatAvg(summary.avgStrokes)} note="strokes per round · lower is better" />
      </section>

      <div className="grid-2">
        <section className="card card-flush">
          <div className="card-header">
            <h2>Group standings</h2>
            <Link to="/leaderboard" className="small">
              Full leaderboard →
            </Link>
          </div>
          <StandingsTable standings={standings} compact />
          <p className="small muted" style={{ padding: '8px 16px 12px', margin: 0 }}>
            Win 3 pts · Draw 1 pt · Loss 0 pts
          </p>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Points by group</h2>
          </div>
          <PointsChart standings={standings} />
        </section>

        <section className="card span-2">
          <div className="card-header">
            <div>
              <h2>Performance over time</h2>
              <p className="card-sub">Average strokes per round (per fairway × 12), per group — lower is better</p>
            </div>
          </div>
          <GroupTrendChart data={trend} groups={data.groups} />
        </section>

        <section className="card card-flush">
          <div className="card-header">
            <h2>Recent results</h2>
            <Link to="/matches" className="small">
              All matches →
            </Link>
          </div>
          {recent.length ? (
            <div className="list">
              {recent.map((m) => (
                <MatchRow key={m.id} match={m} data={data} groupsById={groupsById} />
              ))}
            </div>
          ) : (
            <EmptyState title="No matches yet">Results appear here once the coach records a match.</EmptyState>
          )}
        </section>

        <section className="card card-flush">
          <div className="card-header">
            <h2>Top performers</h2>
            <Link to="/leaderboard" className="small">
              All rankings →
            </Link>
          </div>
          <PlayerRankingTable rows={players} groupsById={groupsById} limit={5} />
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Groups</h2>
          <Link to="/groups" className="small">
            Group pages →
          </Link>
        </div>
        <div className="grid-3">
          {data.groups.map((g) => {
            const row = standings.find((s) => s.groupId === g.id)
            const count = data.players.filter((p) => p.groupId === g.id && p.active).length
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="quick-action" style={{ borderTop: `4px solid ${g.color}` }}>
                <GroupBadge group={g} />
                <span>
                  {count} players · {row?.points ?? 0} pts · rank {row?.rank ?? '–'}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {galleryPhotos.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2>Team photos</h2>
          </div>
          <div className="gallery">
            {galleryPhotos.map((p) => (
              <figure key={p.id}>
                <StoredImage imageId={p.imageId} alt={p.caption || 'Team photo'} fallback={<div className="gallery-missing">Photo not on this device</div>} />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
