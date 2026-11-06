import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData, useLookups } from '../../state/DataContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, StatTile, Banner } from '../../components/common.jsx'
import { MatchRow } from '../../components/tables.jsx'
import Icon from '../../components/Icons.jsx'
import { teamSummary } from '../../lib/stats.js'
import { collectEntries, sortMatches, computeOutcome } from '../../lib/scoring.js'
import { formatDateTime, formatDate } from '../../lib/dates.js'
import { hasUnpublishedChanges } from '../../components/PublishPanel.jsx'

const DAY = 24 * 60 * 60 * 1000

/** Backup reminder: never backed up, changes since the last backup, or over a week old. */
export function backupStatus(data, meta = {}) {
  const last = meta.lastBackupAt ? new Date(meta.lastBackupAt) : null
  // Compare timestamps (not revision numbers, which restart after a reset or restore).
  const changedSince = !last || (data.updatedAt ? new Date(data.updatedAt) > last : true)
  const ageDays = last ? Math.floor((Date.now() - last.getTime()) / DAY) : null
  let level = 'success'
  if (!last && data.revision > 0) level = 'danger'
  else if (changedSince && (ageDays == null || ageDays >= 7)) level = 'danger'
  else if (changedSince) level = 'warning'
  return { last, changedSince, ageDays, level }
}

export function BackupReminder() {
  const { data, meta } = useData()
  const b = backupStatus(data, meta)
  if (data.revision === 0 && !b.last) return null
  return (
    <Banner kind={b.level}>
      <p>
        <strong>
          {b.level === 'success'
            ? 'Backup up to date.'
            : b.last
              ? `Changes since your last backup (${formatDateTime(b.last.toISOString())}).`
              : 'You have never downloaded a backup.'}
        </strong>{' '}
        Records live only in this browser. Download a JSON backup after each training or match day and keep it somewhere safe (e.g. Google
        Drive or email).
      </p>
      {b.level !== 'success' && (
        <Link to="/admin/data" className="btn btn-sm btn-primary">
          <Icon name="download" /> Back up now
        </Link>
      )}
    </Banner>
  )
}

function PublishReminder() {
  const { data, meta, snapshot, source } = useData()
  if (!hasUnpublishedChanges({ data, meta, snapshot, source })) return null
  return (
    <Banner kind="warning">
      <p>
        <strong>The team cannot see your latest changes yet.</strong> Publish the results to update the website for everyone.
      </p>
      <Link to="/admin/data" className="btn btn-sm btn-accent">
        <Icon name="upload" /> Publish results
      </Link>
    </Banner>
  )
}

export default function AdminHome() {
  useTitle('Admin dashboard')
  const { data, source } = useData()
  const { groupsById, playersById } = useLookups()
  const summary = useMemo(() => teamSummary(data), [data])
  const recent = useMemo(() => sortMatches(data.matches, 'desc').slice(0, 5), [data])

  const issues = useMemo(() => {
    const incomplete = collectEntries(data.matches).filter((e) => !e.complete)
    const pending = data.matches.filter((m) => computeOutcome(m, data.settings).status === 'pending')
    return { incomplete, pending }
  }, [data])

  return (
    <>
      <PageHeader title="Admin dashboard" subtitle={source === 'seed' ? 'Initial roster loaded — nothing has been saved on this device yet.' : `Last change ${formatDateTime(data.updatedAt)}`} />
      <PublishReminder />
      <BackupReminder />

      <div className="stack">
        <section className="quick-actions" aria-label="Quick actions">
          <Link to="/admin/matches/new" className="quick-action">
            <Icon name="plus" />
            Record a match
            <span>Date, groups, line-up</span>
          </Link>
          <Link to="/admin/matches" className="quick-action">
            <Icon name="clipboard" />
            Enter scores
            <span>12 fairways per round</span>
          </Link>
          <Link to="/admin/players?new=1" className="quick-action">
            <Icon name="users" />
            Register a player
            <span>Name, group, photo</span>
          </Link>
          <Link to="/admin/data" className="quick-action">
            <Icon name="upload" />
            Publish results
            <span>Update the website for everyone</span>
          </Link>
        </section>

        <section className="stat-grid">
          <StatTile label="Active players" value={summary.activePlayers} note={`${summary.totalPlayers - summary.activePlayers} inactive`} />
          <StatTile label="Groups" value={summary.totalGroups} />
          <StatTile label="Sessions recorded" value={summary.totalSessions} note={`${summary.competitiveMatches} matches · ${summary.practiceSessions} practice`} />
          <StatTile label="Rounds completed" value={summary.playerRounds} />
        </section>

        {(issues.incomplete.length > 0 || issues.pending.length > 0) && (
          <section className="card">
            <h2>Needs attention</h2>
            {issues.pending.length > 0 && (
              <>
                <p className="small muted mb-0">Matches without a result yet (no points awarded until decided):</p>
                <ul>
                  {issues.pending.slice(0, 8).map((m) => (
                    <li key={m.id}>
                      <Link to={`/admin/matches/${m.id}/scores`}>
                        {m.title || 'Match'} — {formatDate(m.date)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {issues.incomplete.length > 0 && (
              <>
                <p className="small muted mb-0">Rounds with missing fairway scores (not counted in statistics):</p>
                <ul>
                  {issues.incomplete.slice(0, 8).map((e) => (
                    <li key={`${e.roundId}-${e.playerId}`}>
                      <Link to={`/admin/matches/${e.matchId}/scores?round=${e.roundId}&player=${e.playerId}`}>
                        {playersById[e.playerId]?.name} — {formatDate(e.date)}, round {e.roundNumber} ({e.fairways.filter((v) => v != null).length}/12)
                      </Link>
                    </li>
                  ))}
                </ul>
                {issues.incomplete.length > 8 && <p className="small muted">…and {issues.incomplete.length - 8} more.</p>}
              </>
            )}
          </section>
        )}

        <section className="card card-flush">
          <div className="card-header">
            <h2>Latest sessions</h2>
            <Link to="/admin/matches" className="small">
              Manage matches →
            </Link>
          </div>
          {recent.length ? (
            <div className="list">
              {recent.map((m) => (
                <MatchRow key={m.id} match={m} data={data} groupsById={groupsById} to={`/admin/matches/${m.id}/scores`} />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ padding: '0 16px 16px' }}>
              No matches recorded yet. Start with “Record a match”.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
