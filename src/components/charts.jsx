import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts'
import { formatShortDate, formatDate } from '../lib/dates.js'
import { NEUTRAL_SERIES } from '../lib/colors.js'

const AXIS = { fontSize: 12, fill: '#64748b' }
const GRID = '#e6e9ee'
const SURFACE = '#ffffff'

function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.key} className="legend-item">
          <span className="legend-swatch" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function TooltipBox({ title, rows }) {
  return (
    <div className="chart-tooltip">
      {title && <div className="chart-tooltip-title">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="chart-tooltip-row">
          {r.color && <span className="group-dot" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  )
}

function DataTable({ caption, columns, rows }) {
  return (
    <details className="table-toggle">
      <summary>Show data table</summary>
      <div className="table-wrap">
        <table className="table table-compact">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : undefined}>
                    {r[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const dot = (color) => ({ r: 4, fill: color, stroke: SURFACE, strokeWidth: 2 })
const activeDot = (color) => ({ r: 6, fill: color, stroke: SURFACE, strokeWidth: 2 })

/** Average strokes per player round, one line per group, across session dates. */
export function GroupTrendChart({ data, groups }) {
  const present = groups.filter((g) => data.some((row) => row[g.id] != null))
  if (!data.length || !present.length) return <p className="muted small">No completed rounds in this period yet.</p>
  return (
    <>
      <Legend items={present.map((g) => ({ key: g.id, label: g.name, color: g.color }))} />
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatShortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={formatDate(label)}
                    rows={payload.map((p) => ({
                      label: groups.find((g) => g.id === p.dataKey)?.name,
                      value: p.value?.toFixed(1),
                      color: p.color,
                    }))}
                  />
                ) : null
              }
            />
            {present.map((g) => (
              <Line
                key={g.id}
                type="monotone"
                dataKey={g.id}
                name={g.name}
                stroke={g.color}
                strokeWidth={2}
                dot={dot(g.color)}
                activeDot={activeDot(g.color)}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Average strokes per player round by date"
        columns={[{ key: 'date', label: 'Date' }, ...present.map((g) => ({ key: g.id, label: g.name, num: true }))]}
        rows={data.map((r) => ({ ...r, date: formatDate(r.date) }))}
      />
    </>
  )
}

/** League points per group — colour follows each group. */
export function PointsChart({ standings }) {
  if (!standings.some((s) => s.played > 0)) return <p className="muted small">No decided matches in this period yet.</p>
  const rows = standings.map((s) => ({ name: s.name, points: s.points, color: s.color, played: s.played }))
  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 24, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ fill: 'rgba(15,23,42,0.04)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={payload[0].payload.name}
                    rows={[
                      { label: 'Points', value: payload[0].payload.points },
                      { label: 'Played', value: payload[0].payload.played },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="points" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} />
              ))}
              <LabelList dataKey="points" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#3f4b5e' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Points by group"
        columns={[
          { key: 'name', label: 'Group' },
          { key: 'played', label: 'Played', num: true },
          { key: 'points', label: 'Points', num: true },
        ]}
        rows={rows}
      />
    </>
  )
}

/** A player's total strokes for each completed round, in date order. */
export function PlayerTrendChart({ history, color = NEUTRAL_SERIES }) {
  const rows = history
    .filter((e) => e.complete)
    .map((e, i) => ({ i: i + 1, total: e.total, date: e.date, round: e.roundNumber, match: e.matchTitle }))
  if (!rows.length) return <p className="muted small">No completed rounds in this period.</p>
  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="i"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tickFormatter={(i) => formatShortDate(rows[i - 1]?.date)}
              minTickGap={20}
            />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={['dataMin - 3', 'dataMax + 3']} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`${formatDate(payload[0].payload.date)} · Round ${payload[0].payload.round}`}
                    rows={[
                      { label: payload[0].payload.match || 'Match', value: '' },
                      { label: 'Total strokes', value: payload[0].payload.total },
                    ]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="total" stroke={color} strokeWidth={2} dot={dot(color)} activeDot={activeDot(color)} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Total strokes per round"
        columns={[
          { key: 'date', label: 'Date' },
          { key: 'round', label: 'Round', num: true },
          { key: 'total', label: 'Total strokes', num: true },
        ]}
        rows={rows.map((r) => ({ ...r, date: formatDate(r.date) }))}
      />
    </>
  )
}

/** Average strokes on each of the 12 fairways. */
export function FairwayChart({ averages, color = NEUTRAL_SERIES }) {
  if (!averages.some((v) => v != null)) return <p className="muted small">No completed rounds in this period.</p>
  const rows = averages.map((v, i) => ({ fairway: `F${i + 1}`, avg: v == null ? null : Math.round(v * 10) / 10 }))
  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="fairway" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(15,23,42,0.04)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`Fairway ${payload[0].payload.fairway.slice(1)}`}
                    rows={[{ label: 'Average strokes', value: payload[0].payload.avg?.toFixed(1) ?? '—' }]}
                  />
                ) : null
              }
            />
            <Bar dataKey="avg" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Average strokes per fairway"
        columns={[
          { key: 'fairway', label: 'Fairway' },
          { key: 'avg', label: 'Average strokes', num: true },
        ]}
        rows={rows}
      />
    </>
  )
}

/** Average strokes per group (lower is better). */
export function GroupAverageChart({ rows }) {
  const present = rows.filter((r) => r.avg != null)
  if (!present.length) return <p className="muted small">No completed rounds in this period yet.</p>
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={present} margin={{ top: 24, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(15,23,42,0.04)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={payload[0].payload.name} rows={[{ label: 'Average strokes', value: payload[0].payload.avg.toFixed(1) }]} />
              ) : null
            }
          />
          <Bar dataKey="avg" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {present.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
            <LabelList dataKey="avg" position="top" formatter={(v) => v.toFixed(1)} style={{ fontSize: 12, fontWeight: 700, fill: '#3f4b5e' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
