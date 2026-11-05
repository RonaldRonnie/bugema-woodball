/** Generates a unique internal ID with a readable prefix, e.g. "ply-3f9c…". */
export function newId(prefix) {
  let core
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    core = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    core = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } else {
    core = (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 16)
  }
  return `${prefix}-${core}`
}
