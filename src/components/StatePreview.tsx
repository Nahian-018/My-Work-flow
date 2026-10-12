import { CheckCircle2, CircleAlert, CloudOff, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export type PreviewState = 'loading' | 'empty' | 'error' | 'offline' | 'success'

export function StatePreview({ state, label, children }: { state: PreviewState; label: string; children?: ReactNode }) {
  const config = {
    loading: { icon: LoaderCircle, className: 'state-loading' },
    empty: { icon: Inbox, className: 'state-empty' },
    error: { icon: CircleAlert, className: 'state-error' },
    offline: { icon: CloudOff, className: 'state-offline' },
    success: { icon: CheckCircle2, className: 'state-success' },
  }[state]
  const Icon = config.icon
  return <div className={`state-preview ${config.className}`} role="status"><Icon size={17} aria-hidden="true" /><span><strong>{label}</strong>{children && <small>{children}</small>}</span></div>
}
