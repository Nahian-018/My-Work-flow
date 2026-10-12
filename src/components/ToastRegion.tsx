import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { usePreview } from '../PreviewContext'

export function ToastRegion() {
  const { toasts } = usePreview()
  return <div className="toast-region" aria-live="polite" aria-relevant="additions text">{toasts.map((toast) => {
    const Icon = toast.kind === 'error' ? CircleAlert : toast.kind === 'info' ? Info : CheckCircle2
    return <div className={`toast toast-${toast.kind}`} role="status" key={toast.id}><Icon size={17} /><span>{toast.message}</span><X size={14} className="toast-close-mark" aria-hidden="true" /></div>
  })}</div>
}
