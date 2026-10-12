import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, icon: Icon, action }: {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  action?: ReactNode
}) {
  return <div className="page-header"><div className="page-header-icon"><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></div><div className="page-header-copy"><span className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-header-action">{action}</div>}</div>
}

export function DemoTag({ children = 'DEMO' }: { children?: ReactNode }) {
  return <span className="demo-tag"><span className="demo-tag-dot" />{children}</span>
}
