import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RANGE_PRESETS, resolveRange, todayISO } from '../lib/dates.js'

/**
 * Date-range filter state kept in the URL (?range=week&ref=2026-11-05), so a
 * filtered view survives refreshes and the back button.
 */
export function useDateRange(defaultPreset = 'all') {
  const [params, setParams] = useSearchParams()
  const preset = params.get('range') || defaultPreset
  const ref = params.get('ref') || todayISO()
  const from = params.get('from') || ''
  const to = params.get('to') || ''

  const range = useMemo(() => resolveRange({ preset, ref, from, to }), [preset, ref, from, to])

  const update = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === undefined) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  return { preset, ref, from, to, range, update }
}

export default function DateRangeFilter({ state, label = 'Period' }) {
  const { preset, ref, from, to, range, update } = state
  return (
    <div className="filter-bar" role="group" aria-label={`${label} filter`}>
      <div className="segmented" role="toolbar" aria-label="Period">
        {RANGE_PRESETS.map((p) => (
          <button key={p.key} type="button" aria-pressed={preset === p.key} onClick={() => update({ range: p.key === 'all' ? null : p.key })}>
            {p.label}
          </button>
        ))}
      </div>
      {['day', 'week', 'month'].includes(preset) && (
        <div className="row">
          <label className="filter-label" htmlFor="range-ref">
            {preset === 'day' ? 'Day' : preset === 'week' ? 'Any day in the week' : 'Any day in the month'}
          </label>
          <input id="range-ref" className="input" type="date" value={ref} onChange={(e) => update({ ref: e.target.value })} />
        </div>
      )}
      {preset === 'custom' && (
        <div className="row">
          <label className="filter-label" htmlFor="range-from">
            From
          </label>
          <input id="range-from" className="input" type="date" value={from} onChange={(e) => update({ from: e.target.value })} />
          <label className="filter-label" htmlFor="range-to">
            To
          </label>
          <input id="range-to" className="input" type="date" value={to} onChange={(e) => update({ to: e.target.value })} />
        </div>
      )}
      <div className="filter-label">
        Showing: <strong>{range.label}</strong>
      </div>
    </div>
  )
}
