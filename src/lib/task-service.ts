import type { SupabaseClient } from '@supabase/supabase-js'
import { addDhakaCalendarDays, dhakaDateKey } from '../domain/task-time'

export type LiveTaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export interface LiveTask {
  id: string
  workspace_id: string
  template_id: string | null
  work_list_id: string | null
  planned_date: string
  title: string
  description: string
  category: string
  priority: 'low' | 'medium' | 'high'
  scheduled_start_time: string
  duration_minutes: number
  reminder_minutes: number | null
  planned_start_at: string
  planned_end_at: string
  reminder_at: string | null
  status: LiveTaskStatus
  effective_status: LiveTaskStatus
  actual_started_at: string | null
  actual_completed_at: string | null
  accumulated_seconds: number
  running_since: string | null
  elapsed_seconds: number
  remaining_seconds: number
  overtime_seconds: number
  schedule_delta_seconds: number | null
  version: number
  deleted_at: string | null
  created_by: string | null
}

export interface TaskDraft {
  title: string
  description: string
  category: string
  priority: 'low' | 'medium' | 'high'
  plannedDate: string
  startTime: string
  durationMinutes: number
  reminderMinutes: number | null
  recurringDaily: boolean
}

export function newOperationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  throw new Error('নিরাপদ unique operation ID তৈরির জন্য এই browser-এ crypto.randomUUID দরকার।')
}

export async function loadLiveTasks(client: SupabaseClient, fromDate = dhakaDateKey(), horizonDays = 14): Promise<LiveTask[]> {
  const untilDate = addDhakaCalendarDays(fromDate, horizonDays)
  const generated = await client.rpc('ensure_daily_task_instances', {
    p_start_date: fromDate,
    p_end_date: untilDate,
  })
  if (generated.error) throw generated.error

  const overdueRefresh = await client.rpc('refresh_overdue_tasks')
  if (overdueRefresh.error) throw overdueRefresh.error

  const base = () => client.from('task_instance_clock').select('*').is('deleted_at', null)
  const [scheduledResult, overdueResult] = await Promise.all([
    base().gte('planned_date', fromDate).lte('planned_date', untilDate).order('planned_start_at').limit(500),
    base().eq('status', 'overdue').order('planned_start_at').limit(500),
  ])
  if (scheduledResult.error) throw scheduledResult.error
  if (overdueResult.error) throw overdueResult.error

  const unique = new Map<string, LiveTask>()
  for (const task of [...(scheduledResult.data ?? []), ...(overdueResult.data ?? [])]) {
    unique.set(task.id, task as LiveTask)
  }
  return [...unique.values()].sort((a, b) => a.planned_start_at.localeCompare(b.planned_start_at))
}

export async function createLiveTask(client: SupabaseClient, draft: TaskDraft, operationId = newOperationId()): Promise<void> {
  if (draft.recurringDaily) {
    const { error } = await client.rpc('create_daily_task_template', {
      p_title: draft.title.trim(),
      p_description: draft.description.trim(),
      p_category: draft.category.trim() || 'work',
      p_priority: draft.priority,
      p_active_from: draft.plannedDate,
      p_start_time: draft.startTime,
      p_duration_minutes: draft.durationMinutes,
      p_reminder_minutes: draft.reminderMinutes,
      p_creation_key: operationId,
    })
    if (error) throw error
    const { error: generationError } = await client.rpc('ensure_daily_task_instances', {
      p_start_date: draft.plannedDate,
      p_end_date: draft.plannedDate,
    })
    if (generationError) throw generationError
    return
  }

  const { error } = await client.rpc('create_task_instance', {
    p_title: draft.title.trim(),
    p_description: draft.description.trim(),
    p_category: draft.category.trim() || 'work',
    p_priority: draft.priority,
    p_planned_date: draft.plannedDate,
    p_start_time: draft.startTime,
    p_duration_minutes: draft.durationMinutes,
    p_reminder_minutes: draft.reminderMinutes,
    p_work_list_id: null,
    p_creation_key: operationId,
  })
  if (error) throw error
}

export async function updateLiveTask(client: SupabaseClient, task: LiveTask, draft: TaskDraft, operationId = newOperationId()): Promise<void> {
  const { error } = await client.rpc('update_task_instance', {
    p_task_id: task.id,
    p_title: draft.title.trim(),
    p_description: draft.description.trim(),
    p_category: draft.category.trim() || 'work',
    p_priority: draft.priority,
    p_work_list_id: task.work_list_id,
    p_planned_date: draft.plannedDate,
    p_start_time: draft.startTime,
    p_duration_minutes: draft.durationMinutes,
    p_reminder_minutes: draft.reminderMinutes,
    p_expected_version: task.version,
    p_operation_id: operationId,
  })
  if (error) throw error
}

export async function deleteLiveTask(client: SupabaseClient, task: LiveTask, operationId = newOperationId()): Promise<void> {
  const { error } = await client.rpc('soft_delete_task_instance', {
    p_task_id: task.id,
    p_expected_version: task.version,
    p_operation_id: operationId,
  })
  if (error) throw error
}

export async function stopLiveDailyRecurrence(client: SupabaseClient, task: LiveTask, operationId = newOperationId()): Promise<void> {
  if (!task.template_id) throw new Error('এই task-এর সঙ্গে daily template যুক্ত নেই।')
  const { error } = await client.rpc('stop_daily_task_template', {
    p_template_id: task.template_id,
    p_operation_id: operationId,
  })
  if (error) throw error
}

export async function changeTaskStatus(client: SupabaseClient, task: LiveTask, target: 'pending' | 'in_progress' | 'completed', operationId = newOperationId()): Promise<void> {
  const { error } = await client.rpc('set_task_status', {
    p_task_id: task.id,
    p_target_status: target,
    p_expected_version: task.version,
    p_operation_id: operationId,
  })
  if (error) throw error
}

export async function startLiveTimer(client: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await client.rpc('start_task_timer', { p_task_id: taskId, p_operation_id: newOperationId() })
  if (error) throw error
}

export async function pauseLiveTimer(client: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await client.rpc('pause_task_timer', { p_task_id: taskId, p_operation_id: newOperationId() })
  if (error) throw error
}

export async function resumeLiveTimer(client: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await client.rpc('resume_task_timer', { p_task_id: taskId, p_operation_id: newOperationId() })
  if (error) throw error
}
