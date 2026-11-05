import { useState } from 'react'
import { useData } from '../state/DataContext.jsx'
import { useToast } from '../state/UIContext.jsx'
import Icon from './Icons.jsx'
import { downloadCSV, slugify, rangeSlug } from '../lib/download.js'
import { playerHistoryCSV, groupPerformanceCSV, teamPerformanceCSV, matchHistoryCSV, playerSummaryCSV } from '../lib/csv.js'

/** Builds the CSV text and file name for an export. */
export function buildCSV(data, { kind, playerId, range }) {
  const r = rangeSlug(range)
  switch (kind) {
    case 'player': {
      const p = data.players.find((x) => x.id === playerId)
      return { csv: playerHistoryCSV(data, playerId, range), name: `player_${slugify(p?.name)}_${r}.csv` }
    }
    case 'players':
      return { csv: playerSummaryCSV(data, range), name: `players_summary_${r}.csv` }
    case 'group':
    case 'groups':
      return { csv: groupPerformanceCSV(data, range), name: `group_performance_${r}.csv` }
    case 'team':
      return { csv: teamPerformanceCSV(data, range), name: `team_performance_${r}.csv` }
    case 'matches':
      return { csv: matchHistoryCSV(data, range), name: `match_history_${r}.csv` }
    default:
      throw new Error('Unknown export.')
  }
}

/** Generates a PDF report. jsPDF is loaded only when first needed. */
export async function buildPDF(data, { kind, playerId, groupId, range, snapshotImages }) {
  const pdf = await import('../lib/pdf.js')
  if (kind === 'player') return pdf.playerReportPDF(data, playerId, range, { snapshotImages })
  if (kind === 'group') return pdf.groupReportPDF(data, groupId, range)
  return pdf.teamReportPDF(data, range)
}

/** CSV + PDF download buttons for a player, a group or the whole team. */
export default function ExportButtons({ kind, playerId, groupId, range, compact = true }) {
  const { data, snapshotImages } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const csv = () => {
    try {
      const { csv: text, name } = buildCSV(data, { kind, playerId, range })
      downloadCSV(text, name)
    } catch (e) {
      toast.error(e.message || 'CSV export failed.')
    }
  }

  const pdf = async () => {
    setBusy(true)
    try {
      await buildPDF(data, { kind, playerId, groupId, range, snapshotImages })
    } catch (e) {
      toast.error(e.message || 'PDF export failed.')
    } finally {
      setBusy(false)
    }
  }

  const cls = compact ? 'btn btn-sm' : 'btn'
  return (
    <>
      <button type="button" className={cls} onClick={csv}>
        <Icon name="download" /> CSV
      </button>
      <button type="button" className={cls} onClick={pdf} disabled={busy}>
        <Icon name="file" /> {busy ? 'Preparing…' : 'PDF'}
      </button>
    </>
  )
}
