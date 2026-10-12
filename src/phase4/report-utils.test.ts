import { describe, expect, it } from 'vitest'
import type { LiveTask } from '../lib/task-service'
import { getDhakaDateRange, groupReportTasks, groupTasksByDhakaDay, isValidDhakaDateKey, summarizeReportTasks } from './report-utils'

const baseTask = (overrides: Partial<LiveTask> = {}): LiveTask => ({
  id: 't1', workspace_id: 'workspace', template_id: null, work_list_id: null, planned_date: '2026-10-10',
  title: 'Task', description: '', category: 'work', priority: 'medium', scheduled_start_time: '09:00:00',
  duration_minutes: 30, reminder_minutes: null, planned_start_at: '2026-10-10T03:00:00Z', planned_end_at: '2026-10-10T03:30:00Z',
  reminder_at: null, status: 'pending', effective_status: 'pending', actual_started_at: null, actual_completed_at: null,
  accumulated_seconds: 0, running_since: null, elapsed_seconds: 0, remaining_seconds: 1800, overtime_seconds: 0,
  schedule_delta_seconds: null, version: 1, deleted_at: null, created_by: 'user-a', ...overrides,
})

describe('Phase 4 date-filtered reports', () => {
  it('computes daily, Saturday-start weekly, and calendar-month Dhaka ranges', () => {
    const now = new Date('2026-10-10T18:15:00.000Z')
    expect(getDhakaDateRange('daily', now)).toEqual({ from: '2026-10-11', to: '2026-10-11' })
    expect(getDhakaDateRange('weekly', now)).toEqual({ from: '2026-10-10', to: '2026-10-16' })
    expect(getDhakaDateRange('monthly', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('rejects invalid custom date keys', () => {
    expect(isValidDhakaDateKey('2026-02-28')).toBe(true)
    expect(isValidDhakaDateKey('2026-02-30')).toBe(false)
    expect(isValidDhakaDateKey('10/11/2026')).toBe(false)
  })

  it('summarizes real task statuses and groups by category/user and Dhaka date', () => {
    const tasks = [
      baseTask({ id: '1', status: 'completed', effective_status: 'completed', elapsed_seconds: 1800 }),
      baseTask({ id: '2', status: 'in_progress', effective_status: 'in_progress', category: 'study', created_by: 'user-b', elapsed_seconds: 300 }),
      baseTask({ id: '3', status: 'pending', effective_status: 'overdue', planned_date: '2026-10-09', created_by: 'user-b' }),
    ]
    expect(summarizeReportTasks(tasks)).toMatchObject({ total: 3, completed: 1, pending: 0, inProgress: 1, overdue: 1, completionRate: 33 })
    expect(groupReportTasks(tasks, 'category').map((row) => row.name)).toEqual(['work', 'study'])
    expect(groupReportTasks(tasks, 'user', { 'user-a': 'Admin', 'user-b': 'Member' }).map((row) => row.name)).toEqual(['Member', 'Admin'])
    expect(groupTasksByDhakaDay(tasks).map((row) => row.date)).toEqual(['2026-10-09', '2026-10-10'])
  })
})
