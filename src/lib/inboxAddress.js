// The score inbox address: the "Web app" URL Apps Script gives when the
// coach deploys apps-script/score-inbox.gs. Kept apart from lib/inbox.js so
// that data validation does not pull in the rest of the inbox code.

const INBOX_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+\/|macros\/)s\/[A-Za-z0-9_-]{20,}\/exec$/

export function cleanInboxUrl(text) {
  return String(text ?? '').trim()
}

export function isInboxUrl(url) {
  return INBOX_URL_RE.test(String(url ?? ''))
}
