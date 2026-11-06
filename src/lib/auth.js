// Admin password check.
//
// The password itself is NOT stored here — only a slow, salted one-way
// fingerprint of it (PBKDF2-SHA256). The repository is public, so storing
// the plain password would let anyone read it.
//
// To change the password run:   npm run set-password -- "new password"
// then commit and push. (See README → "Admin password".)
//
// Honest limits: this check runs in the visitor's browser, so a technically
// skilled person could bypass it on their OWN device. That only lets them
// edit a private copy in their own browser. What everyone sees changes only
// when results are published, which needs the coach's GitHub access key.

export const ADMIN_PASSWORD = Object.freeze({
  salt: '8383a41acf421372bda2b5dcb167e679',
  iterations: 310000,
  hash: '58089207f21f7a128d44cda5d0332d019f62a6c6ade5bf9fec28b6c9f0e8fad6',
})

/** Short tag stored with a signed-in session; changes when the password changes. */
export const SESSION_TAG = ADMIN_PASSWORD.hash.slice(0, 16)

const hexToBytes = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)))
const bytesToHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

export async function hashPassword(password, { salt, iterations } = ADMIN_PASSWORD) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('This browser cannot check the password on this connection. Open the site through its https:// address.')
  }
  const key = await subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt), iterations, hash: 'SHA-256' }, key, 256)
  return bytesToHex(bits)
}

/** True when `password` is the admin password. */
export async function verifyAdminPassword(password) {
  if (!password) return false
  return (await hashPassword(password)) === ADMIN_PASSWORD.hash
}
