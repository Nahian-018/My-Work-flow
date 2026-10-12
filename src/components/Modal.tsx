import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useCopy } from './useCopy'

export function Modal({ title, children, onClose, onSubmit, submitLabel, danger = false, width = 'normal' }: {
  title: string
  children: ReactNode
  onClose: () => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  danger?: boolean
  width?: 'normal' | 'wide'
}) {
  const t = useCopy()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    const firstFocus = dialog.querySelector<HTMLElement>('[data-dialog-autofocus], [autofocus]') ?? focusables()[0]
    firstFocus?.focus()
    if (!firstFocus) dialog.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
      else document.querySelector<HTMLElement>('[data-focus-fallback]')?.focus()
    }
  }, [onClose])

  const content = (
    <>
      <div className="modal-heading"><div><span className="panel-kicker">{t.commonDemoOnly.toUpperCase()}</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label={t.commonClose} onClick={onClose}><X size={18} /></button></div>
      <div className="modal-body">{children}</div>
      {(onSubmit || submitLabel) && <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>{t.commonCancel}</button>{onSubmit && <button form="active-modal-form" type="submit" className={`button ${danger ? 'button-danger' : 'button-primary'}`}>{submitLabel ?? t.commonSave}</button>}</div>}
    </>
  )

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} className={`modal-card ${width === 'wide' ? 'modal-wide' : ''}`}><ModalTitleAnchor title={title} />{onSubmit ? <form id="active-modal-form" noValidate onSubmit={onSubmit}>{content}</form> : content}</div></div>
}

function ModalTitleAnchor({ title }: { title: string }) {
  return <span id="modal-title" className="sr-only">{title}</span>
}

export function ConfirmDialog({ title, description, onCancel, onConfirm, confirmLabel }: {
  title: string
  description: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
}) {
  const t = useCopy()
  return <Modal title={title} onClose={onCancel}><div className="confirm-dialog-copy"><span className="confirm-warning"><X size={20} /></span><p>{description}</p></div><div className="modal-actions"><button type="button" data-dialog-autofocus className="button button-quiet" onClick={onCancel}>{t.commonCancel}</button><button type="button" className="button button-danger" onClick={onConfirm}>{confirmLabel}</button></div></Modal>
}
