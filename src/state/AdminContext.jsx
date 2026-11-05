import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Local administration mode.
//
// There are no user accounts and no server, so this is NOT security: anyone
// who can use this browser can switch admin mode on, and anyone with the
// browser's developer tools can read or change the stored data. Admin mode
// only separates "viewing" from "editing" so results are not changed by
// accident. The optional PIN is a speed bump for a shared device, nothing more.

const AdminContext = createContext(null)
const SESSION_KEY = 'bu-woodball:admin-session'
const PIN_KEY = 'bu-woodball:edit-lock-pin'

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
    /* storage unavailable — admin mode simply won't persist */
  }
}

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => read('sessionStorage', SESSION_KEY) === '1')
  const [pin, setPinState] = useState(() => read('localStorage', PIN_KEY))

  const enter = useCallback(
    (attempt) => {
      if (pin && attempt !== pin) return false
      write('sessionStorage', SESSION_KEY, '1')
      setIsAdmin(true)
      return true
    },
    [pin],
  )

  const exit = useCallback(() => {
    write('sessionStorage', SESSION_KEY, null)
    setIsAdmin(false)
  }, [])

  const setPin = useCallback((value) => {
    const v = value ? String(value).trim() : null
    write('localStorage', PIN_KEY, v || null)
    setPinState(v || null)
  }, [])

  const value = useMemo(() => ({ isAdmin, enter, exit, hasPin: Boolean(pin), setPin }), [isAdmin, enter, exit, pin, setPin])
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider')
  return ctx
}
