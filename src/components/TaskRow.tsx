import { Check, Clock3, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { DemoTask } from '../demo-data'
import { localize } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'

export function TaskRow({ task, compact = false, onEdit, onDelete }: {
  task: DemoTask
  compact?: boolean
  onEdit?: (task: DemoTask) => void
  onDelete?: (task: DemoTask) => void
}) {
  const { language, setTasks, notify } = usePreview()
  const t = useCopy()
  const complete = task.status === 'completed'
  const statusLabel = task.status === 'completed' ? t.taskCompleted : task.status === 'in-progress' ? t.taskInProgress : task.status === 'overdue' ? t.taskOverdue : t.taskNotStarted
  const priorityLabel = task.priority === 'high' ? t.priorityHigh : task.priority === 'medium' ? t.priorityMedium : t.priorityLow

  const toggle = () => {
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: item.status === 'completed' ? 'pending' : 'completed' } : item))
    notify(t.toastTaskDone, 'info')
  }

  return (
    <article className={`task-row ${compact ? 'task-row-compact' : ''} ${complete ? 'task-row-complete' : ''}`}>
      <button type="button" className={`task-checkbox ${complete ? 'task-checkbox-checked' : ''}`} aria-label={`${complete ? t.taskCompleted : t.commonPending}: ${localize(task.title, language)}`} aria-pressed={complete} onClick={toggle}>{complete && <Check size={14} strokeWidth={2.6} />}</button>
      <div className="task-main-copy">
        <strong className="task-name">{localize(task.title, language)}</strong>
        <div className="task-meta-row"><span className={`priority-pill priority-${task.priority}`}><span />{priorityLabel}</span><span className="task-time-meta"><Clock3 size={12} />{task.startTime} · {task.durationMinutes} {t.commonMinutes}</span></div>
      </div>
      {!compact && <div className="task-assignee"><span className={`assignee-avatar ${task.assignee === 'Admin' ? 'assignee-admin' : 'assignee-member'}`}>{task.assignee === 'Admin' ? 'A' : 'M'}</span><span>{task.assignee === 'Admin' ? t.adminRole : t.memberRole}</span></div>}
      <div className="task-trailing">
        <span className={`task-status-pill status-${task.status}`}>{statusLabel}</span>
        {!compact && task.countdown && <span className="countdown-pill"><Clock3 size={12} />{task.countdown}<small>DEMO</small></span>}
        {onEdit && <button type="button" className="row-icon-button" aria-label={`${t.commonEdit}: ${localize(task.title, language)}`} onClick={() => onEdit(task)}><Pencil size={14} /></button>}
        {onDelete && <button type="button" className="row-icon-button row-delete-button" aria-label={`${t.commonDelete}: ${localize(task.title, language)}`} onClick={() => onDelete(task)}><Trash2 size={14} /></button>}
        {!onEdit && !onDelete && compact && <MoreHorizontal size={15} className="task-more-icon" aria-hidden="true" />}
      </div>
    </article>
  )
}
