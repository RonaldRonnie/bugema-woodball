// Changes the admin password.
// Usage:  npm run set-password -- "new password"
// Writes a new salted PBKDF2 fingerprint into src/lib/auth.js. Commit and
// push afterwards so the live site uses the new password.

import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const password = process.argv[2]
if (!password || password.length < 6) {
  console.error('Usage: npm run set-password -- "new password"   (at least 6 characters)')
  process.exit(1)
}

const file = fileURLToPath(new URL('../src/lib/auth.js', import.meta.url))
const salt = randomBytes(16).toString('hex')
const iterations = 310000
const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex')

const source = readFileSync(file, 'utf8')
const updated = source.replace(
  /export const ADMIN_PASSWORD = Object\.freeze\(\{[\s\S]*?\}\)/,
  `export const ADMIN_PASSWORD = Object.freeze({\n  salt: '${salt}',\n  iterations: ${iterations},\n  hash: '${hash}',\n})`,
)
if (updated === source) {
  console.error('Could not find ADMIN_PASSWORD in src/lib/auth.js — nothing changed.')
  process.exit(1)
}
writeFileSync(file, updated)
console.log('Admin password updated in src/lib/auth.js. Commit and push to apply it to the live site.')
console.log('Everyone currently signed in will need to sign in again.')
