import { useState } from 'react'
import { useData } from '../state/DataContext.jsx'
import { useToast } from '../state/UIContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader } from '../components/common.jsx'
import DateRangeFilter, { useDateRange } from '../components/DateRangeFilter.jsx'
import Icon from '../components/Icons.jsx'
import { buildCSV, buildPDF } from '../components/ExportButtons.jsx'
import { downloadCSV } from '../lib/download.js'

function ReportCard({ title, description, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="small muted">{description}</p>
      {children}
    </section>
  )
}

export default function Reports() {
  useTitle('Reports')
  const { data, snapshotImages } = useData()
  const { isAdmin } = useAdmin()
  const toast = useToast()
  const filter = useDateRange()
  const { range } = filter
  const sortedPlayers = [...data.players].sort((a, b) => a.name.localeCompare(b.name))
  const [playerId, setPlayerId] = useState(sortedPlayers[0]?.id || '')
  const [groupId, setGroupId] = useState(data.groups[0]?.id || '')
  const [busy, setBusy] = useState(null)

  const csv = (opts) => {
    try {
      const { csv: text, name } = buildCSV(data, { ...opts, range })
      downloadCSV(text, name)
    } catch (e) {
      toast.error(e.message || 'Export failed.')
    }
  }
  const pdf = async (key, opts) => {
    setBusy(key)
    try {
      await buildPDF(data, { ...opts, range, snapshotImages })
    } catch (e) {
      toast.error(e.message || 'PDF export failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        back={isAdmin ? { to: '/admin', label: 'Admin' } : undefined}
        title="Reports & exports"
        subtitle="Choose a period, then download CSV (spreadsheets) or PDF (printable) reports."
      />
      <DateRangeFilter state={filter} label="Report period" />

      <div className="grid-2">
        <ReportCard title="Individual player" description="Statistics, ranking, performance charts and every round with all 12 fairway scores.">
          <div className="field">
            <label htmlFor="report-player">Player</label>
            <select id="report-player" className="select" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              {sortedPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row mt-1">
            <button type="button" className="btn" onClick={() => csv({ kind: 'player', playerId })} disabled={!playerId}>
              <Icon name="download" /> CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => pdf('player', { kind: 'player', playerId })} disabled={!playerId || busy}>
              <Icon name="file" /> {busy === 'player' ? 'Preparing…' : 'PDF report'}
            </button>
          </div>
        </ReportCard>

        <ReportCard title="Group performance" description="Standings, points, stroke averages, match log and member rankings.">
          <div className="field">
            <label htmlFor="report-group">Group (for the PDF report)</label>
            <select id="report-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row mt-1">
            <button type="button" className="btn" onClick={() => csv({ kind: 'groups' })}>
              <Icon name="download" /> CSV (all groups)
            </button>
            <button type="button" className="btn btn-primary" onClick={() => pdf('group', { kind: 'group', groupId })} disabled={!groupId || busy}>
              <Icon name="file" /> {busy === 'group' ? 'Preparing…' : 'PDF report'}
            </button>
          </div>
        </ReportCard>

        <ReportCard title="Overall team" description="Group standings, player rankings, charts and recent results for the whole team.">
          <div className="row">
            <button type="button" className="btn" onClick={() => csv({ kind: 'team' })}>
              <Icon name="download" /> CSV
            </button>
            <button type="button" className="btn" onClick={() => csv({ kind: 'players' })}>
              <Icon name="download" /> Player summary CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => pdf('team', { kind: 'team' })} disabled={busy}>
              <Icon name="file" /> {busy === 'team' ? 'Preparing…' : 'PDF report'}
            </button>
          </div>
        </ReportCard>

        <ReportCard title="Complete match history" description="Every recorded round: date, match, outcome, player, 12 fairway scores and total strokes.">
          <button type="button" className="btn" onClick={() => csv({ kind: 'matches' })}>
            <Icon name="download" /> CSV
          </button>
        </ReportCard>
      </div>
    </>
  )
}
