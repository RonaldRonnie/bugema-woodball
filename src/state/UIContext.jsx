import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// ------------------------------------------------------------------ toasts

const ToastContext = createContext(null)
let toastSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind, message, timeout) => {
      const id = ++toastSeq
      setToasts((list) => [...list.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), timeout)
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (m) => push('success', m, 3000),
      error: (m) => push('error', m, 7000),
      info: (m) => push('info', m, 4500),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// --------------------------------------------------------- confirm dialog

const ConfirmContext = createContext(null)

/**
 * Promise-based confirmation dialog using the native <dialog> element
 * (keyboard and screen-reader friendly). Usage:
 *   if (await confirm({ title, message, confirmLabel, danger: true })) …
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const dialogRef = useRef(null)
  const resolverRef = useRef(null)

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolverRef.current = resolve
        setRequest(typeof opts === 'string' ? { message: opts } : opts)
      }),
    [],
  )

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (request && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
  }, [request])

  const close = (answer) => {
    const d = dialogRef.current
    if (d?.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
    resolverRef.current?.(answer)
    resolverRef.current = null
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        className="dialog"
        aria-labelledby="confirm-title"
        onCancel={(e) => {
          e.preventDefault()
          close(false)
        }}
      >
        {request && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              close(true)
            }}
          >
            <h2 id="confirm-title" className="dialog-title">
              {request.title || 'Please confirm'}
            </h2>
            <div className="dialog-body">{request.message}</div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => close(false)} autoFocus={request.danger}>
                {request.cancelLabel || 'Cancel'}
              </button>
              <button type="submit" className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus={!request.danger}>
                {request.confirmLabel || 'Confirm'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
