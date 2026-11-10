import { useCallback, useEffect, useState } from 'react'
import { fetchCards } from '../lib/inbox.js'

// The cards in the coach's score inbox, shared by the admin pages so that
// moving between them does not download the list again every time.
const cache = new Map() // inbox URL → { cards, checkedAt }

export function useInboxFeed(url, { maxAgeMs = 0 } = {}) {
  const [state, setState] = useState(() => ({ cards: null, checkedAt: null, ...(cache.get(url) || {}), loading: false, error: '' }))

  const refresh = useCallback(async () => {
    if (!url) return
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const entry = { cards: await fetchCards(url), checkedAt: new Date().toISOString() }
      cache.set(url, entry)
      setState({ ...entry, loading: false, error: '' })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Could not read the score inbox.' }))
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    const cached = cache.get(url)
    if (cached) setState((s) => ({ ...s, ...cached }))
    if (cached && Date.now() - Date.parse(cached.checkedAt) < maxAgeMs) return
    refresh()
  }, [url, maxAgeMs, refresh])

  return { ...state, refresh }
}
