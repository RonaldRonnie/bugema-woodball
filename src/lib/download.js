/** Triggers a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadText(text, filename, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

/** CSV with a UTF-8 byte-order mark so Excel shows names correctly. */
export function downloadCSV(csv, filename) {
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename)
}

export function slugify(text) {
  return (
    String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'export'
  )
}

export function rangeSlug(range) {
  if (!range || (!range.from && !range.to)) return 'all-time'
  if (range.from === range.to) return range.from
  return `${range.from || 'start'}_to_${range.to || 'now'}`
}
