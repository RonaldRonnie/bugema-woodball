import { useEffect, useRef } from 'react'

/** Modal built on the native <dialog> element (focus trap and Esc for free). */
export default function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {open && (
        <>
          <h2 id="modal-title" className="dialog-title">
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  )
}
