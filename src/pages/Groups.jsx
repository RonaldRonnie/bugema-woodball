import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state/DataContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader, FormStrip } from '../components/common.jsx'
import { StoredImage } from '../components/media.jsx'
import { computeStandings } from '../lib/scoring.js'
import { groupStats, formatAvg } from '../lib/stats.js'

export default function Groups() {
  useTitle('Groups')
  const { data } = useData()
  const standings = useMemo(() => computeStandings(data), [data])

  return (
    <>
      <PageHeader title="Groups" subtitle={`${data.groups.length} groups · ${data.players.filter((p) => p.active).length} active players`} />
      <div className="grid-3">
        {data.groups.map((g) => {
          const s = standings.find((r) => r.groupId === g.id)
          const stats = groupStats(data, g.id)
          return (
            <Link key={g.id} to={`/groups/${g.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', borderTop: `4px solid ${g.color}` }}>
              {g.photoId && <StoredImage imageId={g.photoId} className="group-photo" alt="" fallback={null} />}
              <div className="row-between">
                <h2 className="mb-0">{g.name}</h2>
                <span className="tag tag-navy">Rank {s?.rank ?? '–'}</span>
              </div>
              {g.description && <p className="small muted mt-1">{g.description}</p>}
              <div className="stat-grid mt-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div>
                  <div className="stat-label">Players</div>
                  <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                    {stats.activeMembers}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Points</div>
                  <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                    {s?.points ?? 0}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Avg strokes</div>
                  <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                    {formatAvg(stats.avgStrokes)}
                  </div>
                </div>
              </div>
              <div className="row mt-1 small muted">
                Form: <FormStrip form={s?.form} />
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
