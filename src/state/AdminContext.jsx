import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { verifyAdminPassword, SESSION_TAG } from '../lib/auth.js'

// Admin sign-in with the coach's password (see lib/auth.js).
// A signed-in session is remembered for the browser tab, or on this device
// when "keep me signed in" is ticked. Sessions from an older password are
// ignored automatically because the stored tag no longer matches.

const AdminContext = createContext(null)
const SESSION_KEY = 'bu-woodball:admin-session'
const LEGACY_PIN_KEY = 'bu-woodball:edit-lock-pin'

function read(store, key) {
  try {
    return window[store].getItem(key)
  } catch {
    return null
  }
}
function write(store, key, value) {
  try {
    if (value == null) window[store].removeItem(key)
    else window[store].setItem(key, value)
  } catch {
    /* storage unavailable — the session simply won't persist */
  }
}

const signedIn = () => read('sessionStorage', SESSION_KEY) === SESSION_TAG || read('localStorage', SESSION_KEY) === SESSION_TAG

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(signedIn)

  useEffect(() => {
    write('localStorage', LEGACY_PIN_KEY, null) // the old optional PIN is replaced by the password
  }, [])

  /** Checks the password; returns true when signed in. */
  const enter = useCallback(async (password, { remember = false } = {}) => {
    const ok = await verifyAdminPassword(password)
    if (!ok) return false
    write('sessionStorage', SESSION_KEY, SESSION_TAG)
    write('localStorage', SESSION_KEY, remember ? SESSION_TAG : null)
    setIsAdmin(true)
    return true
  }, [])

  const exit = useCallback(() => {
    write('sessionStorage', SESSION_KEY, null)
    write('localStorage', SESSION_KEY, null)
    setIsAdmin(false)
  }, [])

  const value = useMemo(() => ({ isAdmin, enter, exit }), [isAdmin, enter, exit])
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider')
  return ctx
}
