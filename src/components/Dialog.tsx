import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { IconButton } from '@giulioungaretti/home-design-system'
import { X } from 'lucide-react'

export function Dialog({ title, children, onClose, className = '', preventClose = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
  preventClose?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      dialog?.close()
      queueMicrotask(() => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
      })
    }
  }, [])
  return (
    <dialog ref={ref} className={`board-dialog ${className}`} aria-labelledby="board-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!preventClose) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!preventClose) onClose()
        }
      }}>
      <header className="board-dialog-header">
        <h2 id="board-dialog-title">{title}</h2>
        <IconButton label="Close" disabled={preventClose} onClick={onClose}><X size={18} /></IconButton>
      </header>
      {children}
    </dialog>
  )
}
