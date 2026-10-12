import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state-component"><span className="empty-state-icon"><Icon size={22} aria-hidden="true" /></span><strong>{title}</strong><p>{description}</p>{action}</div>
}
