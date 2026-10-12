// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { LiveTask } from '../lib/task-service'
import { getDueNotifications, isQuietHours } from './LiveNotificationProvider'
import type { NotificationPreferences } from './LiveNotificationProvider'

const task: LiveTask = {
  id: 'task-a', workspace_id: 'workspace-a', template_id: null, work_list_id: null,
  planned_date: '2026-10-10', title: 'Dhaka task', description: '', category: 'work', priority: 'high',
  scheduled_start_time: '09:00:00', duration_minutes: 30, reminder_minutes: 10,
  planned_start_at: '2026-10-10T03:00:00.000Z', planned_end_at: '2026-10-10T03:30:00.000Z',
  reminder_at: '2026-10-10T02:50:00.000Z', status: 'pending', effective_status: 'pending',
  actual_started_at: null, actual_completed_at: null, accumulated_seconds: 0, running_since: null,
  elapsed_seconds: 0, remaining_seconds: 1800, overtime_seconds: 0, schedule_delta_seconds: null,
  version: 1, deleted_at: null, created_by: 'user-a',
}
const preferences: NotificationPreferences = {
  user_id: 'user-a', workspace_id: 'workspace-a', pre_start_enabled: true, task_start_enabled: true,
  overdue_enabled: true, upcoming_enabled: true, daily_summary_enabled: true, daily_summary_time: '20:00:00',
  quiet_hours_enabled: false, quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00', updated_at: '',
}

describe('foreground reminder schedule evaluation', () => {
  it('deduplicates each due event with a schedule-stable key and includes pre-start, upcoming, and start', () => {
    const due = getDueNotifications(task, preferences, Date.parse('2026-10-10T03:00:00.000Z'))
    expect(due.map((entry) => entry.key.split(':')[1])).toEqual(['pre_start', 'upcoming', 'start'])
    expect(new Set(due.map((entry) => entry.key)).size).toBe(3)
    expect(due.every((entry) => entry.at <= Date.parse('2026-10-10T03:00:00.000Z'))).toBe(true)
  })

  it('emits one planned-end overdue event, skips start alerts after timer started, and skips completed tasks', () => {
    const atEnd = getDueNotifications(task, preferences, Date.parse('2026-10-10T03:31:00.000Z'))
    expect(atEnd.some((entry) => entry.key.includes(':overdue:'))).toBe(true)
    const started = getDueNotifications({ ...task, actual_started_at: '2026-10-10T03:00:00.000Z' }, preferences, Date.parse('2026-10-10T03:31:00.000Z'))
    expect(started.some((entry) => entry.key.includes(':start:'))).toBe(false)
    expect(getDueNotifications({ ...task, status: 'completed', actual_completed_at: '2026-10-10T03:15:00.000Z' }, preferences, Date.parse('2026-10-10T05:00:00.000Z'))).toEqual([])
  })

  it('respects per-type preferences', () => {
    const disabled = { ...preferences, pre_start_enabled: false, upcoming_enabled: false, task_start_enabled: false, overdue_enabled: false }
    expect(getDueNotifications(task, disabled, Date.parse('2026-10-10T05:00:00.000Z'))).toEqual([])
  })
})

describe('Asia/Dhaka quiet hours', () => {
  it('supports a quiet window crossing midnight and a daytime window', () => {
    expect(isQuietHours(Date.parse('2026-10-10T17:30:00.000Z'), '22:00:00', '08:00:00')).toBe(true) // 23:30 Dhaka
    expect(isQuietHours(Date.parse('2026-10-10T01:30:00.000Z'), '22:00:00', '08:00:00')).toBe(true) // 07:30 Dhaka
    expect(isQuietHours(Date.parse('2026-10-10T03:30:00.000Z'), '09:00:00', '10:00:00')).toBe(true) // 09:30 Dhaka
    expect(isQuietHours(Date.parse('2026-10-10T05:00:00.000Z'), '09:00:00', '10:00:00')).toBe(false) // 11:00 Dhaka
  })
})
