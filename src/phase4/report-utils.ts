import { addDhakaCalendarDays, dhakaDateKey } from '../domain/task-time'
import type { LiveTask } from '../lib/task-service'

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom'
export interface DateRange { from: string; to: string }
export interface ReportGroup { name: string; total: number; completed: number; pending: number; inProgress: number; overdue: number; elapsedSeconds: number }

export function getDhakaDateRange(period: Exclude<ReportPeriod, 'custom'>, now: Date = new Date()): DateRange {
  const today = dhakaDateKey(now)
  if (period === 'daily') return { from: today, to: today }
  if (period === 'weekly') {
    const weekday = new Date(`${today}T12:00:00+06:00`).getUTCDay()
    const saturdayOffset = (weekday + 1) % 7
    const from = addDhakaCalendarDays(today, -saturdayOffset)
    return { from, to: addDhakaCalendarDays(from, 6) }
  }
  const from = `${today.slice(0, 7)}-01`
  const nextMonth = addDhakaCalendarDays(`${today.slice(0, 7)}-01`, 32).slice(0, 7)
  const lastDay = addDhakaCalendarDays(`${nextMonth}-01`, -1)
  return { from, to: lastDay }
}

export function isValidDhakaDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try { return addDhakaCalendarDays(value, 0) === value } catch { return false }
}

export function getReportStatus(task: LiveTask): 'completed' | 'pending' | 'in_progress' | 'overdue' {
  if (task.status === 'completed') return 'completed'
  return task.effective_status === 'overdue' ? 'overdue' : task.status
}

export function groupReportTasks(tasks: LiveTask[], dimension: 'category' | 'user', userNames: Record<string, string> = {}): ReportGroup[] {
  const groups = new Map<string, ReportGroup>()
  for (const task of tasks) {
    const key = dimension === 'category' ? task.category || 'general'
      : task.created_by ? userNames[task.created_by] ?? 'অনুমোদিত সদস্য' : 'নির্ধারিত নয়'
    const group = groups.get(key) ?? { name: key, total: 0, completed: 0, pending: 0, inProgress: 0, overdue: 0, elapsedSeconds: 0 }
    group.total += 1
    group.elapsedSeconds += task.elapsed_seconds ?? task.accumulated_seconds ?? 0
    const status = getReportStatus(task)
    if (status === 'completed') group.completed += 1
    else if (status === 'pending') group.pending += 1
    else if (status === 'in_progress') group.inProgress += 1
    else group.overdue += 1
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
}

export function groupTasksByDhakaDay(tasks: LiveTask[]) {
  const days = new Map<string, { date: string; total: number; completed: number }>()
  for (const task of tasks) {
    const row = days.get(task.planned_date) ?? { date: task.planned_date, total: 0, completed: 0 }
    row.total += 1
    if (getReportStatus(task) === 'completed') row.completed += 1
    days.set(task.planned_date, row)
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date))
}

export function summarizeReportTasks(tasks: LiveTask[]) {
  const completed = tasks.filter((task) => getReportStatus(task) === 'completed').length
  const plannedSeconds = tasks.reduce((sum, task) => sum + task.duration_minutes * 60, 0)
  const elapsedSeconds = tasks.reduce((sum, task) => sum + (task.elapsed_seconds ?? task.accumulated_seconds ?? 0), 0)
  return {
    total: tasks.length,
    completed,
    pending: tasks.filter((task) => getReportStatus(task) === 'pending').length,
    inProgress: tasks.filter((task) => getReportStatus(task) === 'in_progress').length,
    overdue: tasks.filter((task) => getReportStatus(task) === 'overdue').length,
    completionRate: tasks.length ? Math.round(completed * 100 / tasks.length) : 0,
    plannedSeconds,
    elapsedSeconds,
  }
}
