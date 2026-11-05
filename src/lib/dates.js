// All match dates are stored as local calendar dates in ISO form (YYYY-MM-DD),
// so they compare correctly as plain strings and never shift with time zones.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidISODate(value) {
  if (typeof value !== 'string') return false
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(value) {
  const m = ISO_DATE.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function todayISO() {
  return toISODate(new Date())
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const WITH_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function formatDate(iso, { weekday = false } = {}) {
  const d = parseISODate(iso)
  if (!d) return iso || ''
  return (weekday ? WITH_DAY : LONG).format(d)
}

export function formatShortDate(iso) {
  const d = parseISODate(iso)
  return d ? SHORT.format(d) : iso || ''
}

export function formatDateTime(isoTimestamp) {
  if (!isoTimestamp) return 'never'
  const d = new Date(isoTimestamp)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export const RANGE_PRESETS = [
  { key: 'all', label: 'All time' },
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
]

/**
 * Resolves a filter selection into an inclusive { from, to } range of ISO
 * dates. `from`/`to` are null for "all time". Weeks run Monday to Sunday.
 */
export function resolveRange({ preset = 'all', ref, from, to } = {}) {
  const refDate = parseISODate(ref) || new Date()
  switch (preset) {
    case 'day': {
      const day = toISODate(refDate)
      return { from: day, to: day, label: formatDate(day, { weekday: true }) }
    }
    case 'week': {
      const offset = (refDate.getDay() + 6) % 7 // Monday = 0
      const start = addDays(refDate, -offset)
      const end = addDays(start, 6)
      return {
        from: toISODate(start),
        to: toISODate(end),
        label: `Week of ${formatDate(toISODate(start))}`,
      }
    }
    case 'month': {
      const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
      const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0)
      return {
        from: toISODate(start),
        to: toISODate(end),
        label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(start),
      }
    }
    case 'custom': {
      let f = isValidISODate(from) ? from : null
      let t = isValidISODate(to) ? to : null
      if (f && t && f > t) [f, t] = [t, f]
      const label =
        f && t ? `${formatDate(f)} – ${formatDate(t)}` : f ? `From ${formatDate(f)}` : t ? `Up to ${formatDate(t)}` : 'All time'
      return { from: f, to: t, label }
    }
    default:
      return { from: null, to: null, label: 'All time' }
  }
}

export function inRange(isoDate, range) {
  if (!range) return true
  if (range.from && isoDate < range.from) return false
  if (range.to && isoDate > range.to) return false
  return true
}
