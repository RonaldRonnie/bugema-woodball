import { useMemo, useState } from 'react'
import { useData, useLookups } from '../state/DataContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader } from '../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../components/DateRangeFilter.jsx'
import { StandingsTable, PlayerRankingTable } from '../components/tables.jsx'
import { PointsChart, GroupAverageChart } from '../components/charts.jsx'
import { computeStandings } from '../lib/scoring.js'
import { allPlayerStats, groupStats } from '../lib/stats.js'
import { TIE_BREAKER_OPTIONS } from '../data/defaults.js'

export default function Leaderboard() {
  useTitle('Standings')
  const { data } = useData()
  const { groupsById } = useLookups()
  const filter = useDateRange()
  const { range } = filter
  const [groupFilter, setGroupFilter] = useState('all')

  const standings = useMemo(() => computeStandings(data, range), [data, range])
  const players = useMemo(() => allPlayerStats(data, range), [data, range])
  const averages = useMemo(
    () =>
      data.groups.map((g) => {
        const s = groupStats(data, g.id, range)
        return { name: g.name, color: g.color, avg: s.avgStrokes }
      }),
    [data, range],
  )
  const tieBreakers = data.settings.tieBreakers.filter((t) => t.enabled)
  const playerRows = groupFilter === 'all' ? players : players.filter((r) => r.player.groupId === groupFilter)

  return (
    <>
      <PageHeader title="Standings" subtitle="Group leaderboard and individual rankings" />
      <DateRangeFilter state={filter} />

      <div className="stack">
        <section className="card card-flush">
          <div className="card-header">
            <div>
              <h2>Group leaderboard</h2>
              <p className="card-sub">Win 3 · Draw 1 · Loss 0. Strokes and points are separate measures.</p>
            </div>
          </div>
          <StandingsTable standings={standings} />
          <div className="small muted" style={{ padding: '10px 16px 14px' }}>
            <strong>Ties are broken by:</strong>{' '}
            {tieBreakers.length ? tieBreakers.map((t, i) => `${i + 1}. ${TIE_BREAKER_OPTIONS[t.key]}`).join(' · ') : 'none (tied groups share a rank)'}
            . Groups still level share a rank.
          </div>
        </section>

        <div className="grid-2">
          <section className="card">
            <div className="card-header">
              <h2>Points</h2>
            </div>
            <PointsChart standings={standings} />
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Average strokes per round</h2>
                <p className="card-sub">All sessions · lower is better</p>
              </div>
            </div>
            <GroupAverageChart rows={averages} />
          </section>
        </div>

        <section className="card card-flush" id="players">
          <div className="card-header">
            <div>
              <h2>Player rankings</h2>
              <p className="card-sub">
                By average strokes per round — every fairway entered counts, scaled to 12 fairways (lower is better). Minimum{' '}
                {data.settings.minRoundsForRanking} round
                {data.settings.minRoundsForRanking === 1 ? '' : 's'} to be ranked.
              </p>
            </div>
            <select className="select" style={{ width: 'auto' }} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Filter rankings by group">
              <option value="all">All groups</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <PlayerRankingTable rows={playerRows} groupsById={groupsById} showGroup={groupFilter === 'all'} />
        </section>
      </div>
    </>
  )
}
