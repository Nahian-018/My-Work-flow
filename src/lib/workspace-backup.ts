import type { SupabaseClient } from '@supabase/supabase-js'

export const WORKSPACE_BACKUP_FORMAT = 'smartflow-duo-backup'
export const WORKSPACE_BACKUP_SCHEMA_VERSION = 1
export const MAX_WORKSPACE_BACKUP_BYTES = 10 * 1024 * 1024

export interface WorkspaceBackup {
  format: typeof WORKSPACE_BACKUP_FORMAT
  schema_version: typeof WORKSPACE_BACKUP_SCHEMA_VERSION
  workspace_id: string
  exported_at: string
  exported_by: string
  work_lists: Record<string, unknown>[]
  task_templates: Record<string, unknown>[]
  task_instances: Record<string, unknown>[]
  workspace_notes: Record<string, unknown>[]
  notification_preferences: Record<string, unknown>[]
  task_time_events: Record<string, unknown>[]
  activity_events: Record<string, unknown>[]
  history_archive: Record<string, unknown>[]
}

export interface BackupValidation {
  backup: WorkspaceBackup
  excludedForeignPrivateNotes: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function records(value: unknown, field: string, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max || !value.every(isRecord)) {
    throw new Error(`Backup-এর ${field} list অনুপস্থিত, ভুল format বা সীমার চেয়ে বড়।`)
  }
  return value
}

export function validateWorkspaceBackup(value: unknown, workspaceId: string, userId: string, byteLength?: number): BackupValidation {
  if (byteLength !== undefined && byteLength > MAX_WORKSPACE_BACKUP_BYTES) throw new Error('Backup file ১০ MiB সীমা ছাড়িয়েছে।')
  if (!isRecord(value) || value.format !== WORKSPACE_BACKUP_FORMAT || value.schema_version !== WORKSPACE_BACKUP_SCHEMA_VERSION) {
    throw new Error('Backup format/schema version অসমর্থিত; file restore করা হয়নি।')
  }
  if (value.workspace_id !== workspaceId) throw new Error('এই Backup অন্য workspace-এর; নিরাপত্তার জন্য restore বন্ধ করা হয়েছে।')
  const notes = records(value.workspace_notes, 'workspace_notes', 500)
  const foreignPrivate = notes.filter((note) => note.visibility === 'private' && note.owner_id !== userId)
  const filteredNotes = notes.filter((note) => note.visibility !== 'private' || note.owner_id === userId)
  const validated: WorkspaceBackup = {
    format: WORKSPACE_BACKUP_FORMAT,
    schema_version: WORKSPACE_BACKUP_SCHEMA_VERSION,
    workspace_id: workspaceId,
    exported_at: typeof value.exported_at === 'string' ? value.exported_at : '',
    exported_by: typeof value.exported_by === 'string' ? value.exported_by : '',
    work_lists: records(value.work_lists, 'work_lists', 500),
    task_templates: records(value.task_templates, 'task_templates', 500),
    task_instances: records(value.task_instances, 'task_instances', 5000),
    workspace_notes: filteredNotes,
    notification_preferences: records(value.notification_preferences, 'notification_preferences', 1),
    task_time_events: records(value.task_time_events, 'task_time_events', 10000),
    activity_events: records(value.activity_events, 'activity_events', 10000),
    history_archive: records(value.history_archive, 'history_archive', 10000),
  }
  return { backup: validated, excludedForeignPrivateNotes: foreignPrivate.length }
}

const BACKUP_PAGE_SIZE = 500

async function exportRows(
  requestPage: (from: number, to: number) => PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
    count: number | null
  }>,
  label: string,
  maxRows: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let expectedRows: number | null = null
  for (let offset = 0; offset < maxRows; offset += BACKUP_PAGE_SIZE) {
    const { data, error, count } = await requestPage(offset, offset + BACKUP_PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    if (count !== null) expectedRows = count
    if (expectedRows !== null && expectedRows > maxRows) {
      throw new Error(`${label}: ${expectedRows} row সীমা ${maxRows}-এর বেশি; সম্পূর্ণ backup করা হয়নি।`)
    }
    const page = data ?? []
    rows.push(...page)
    if (expectedRows !== null && rows.length >= expectedRows) return rows
    if (page.length < BACKUP_PAGE_SIZE) break
  }
  if (expectedRows === null && rows.length === maxRows) {
    const { data, error } = await requestPage(maxRows, maxRows)
    if (error) throw new Error(`${label}: ${error.message}`)
    if (data?.length) throw new Error(`${label}: row-count যাচাই করা যায়নি; ${maxRows}-row সীমা ছুঁয়েছে, তাই partial backup বাতিল।`)
  }
  if (expectedRows !== null && rows.length < expectedRows) {
    throw new Error(`${label}: ${expectedRows}টির মধ্যে ${rows.length}টি row এসেছে; partial backup বাতিল।`)
  }
  return rows
}

export async function createWorkspaceBackup(client: SupabaseClient, userId: string, workspaceId: string): Promise<WorkspaceBackup> {
  const [lists, templates, tasks, notes, preferences, timeEvents, activityEvents, archive] = await Promise.all([
    exportRows((from, to) => client.from('work_lists').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('id').range(from, to), 'Work list export ব্যর্থ', 500),
    exportRows((from, to) => client.from('task_templates').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('id').range(from, to), 'Template export ব্যর্থ', 500),
    exportRows((from, to) => client.from('task_instances').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('planned_date').order('id').range(from, to), 'Task export ব্যর্থ', 5000),
    exportRows((from, to) => client.from('workspace_notes').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).is('deleted_at', null).order('id').range(from, to), 'Note export ব্যর্থ', 500),
    exportRows((from, to) => client.from('notification_preferences').select('*', { count: 'exact' }).eq('user_id', userId).order('user_id').range(from, to), 'Settings export ব্যর্থ', 1),
    exportRows((from, to) => client.from('task_time_events').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('event_at').order('id').range(from, to), 'Timer history export ব্যর্থ', 10000),
    exportRows((from, to) => client.from('activity_events').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('created_at').order('id').range(from, to), 'Activity history export ব্যর্থ', 10000),
    exportRows((from, to) => client.from('workspace_history_archive').select('*', { count: 'exact' }).eq('workspace_id', workspaceId).order('imported_at').order('id').range(from, to), 'History archive export ব্যর্থ', 10000),
  ])
  const allowedNotes = notes.filter((note) => note.visibility === 'shared' || note.owner_id === userId)
  const backup: WorkspaceBackup = {
    format: WORKSPACE_BACKUP_FORMAT,
    schema_version: WORKSPACE_BACKUP_SCHEMA_VERSION,
    workspace_id: workspaceId,
    exported_at: new Date().toISOString(),
    exported_by: userId,
    work_lists: lists,
    task_templates: templates,
    task_instances: tasks,
    workspace_notes: allowedNotes,
    notification_preferences: preferences.filter((row) => row.user_id === userId),
    task_time_events: timeEvents,
    activity_events: activityEvents,
    history_archive: archive,
  }
  const size = new Blob([JSON.stringify(backup, null, 2)]).size
  if (size > MAX_WORKSPACE_BACKUP_BYTES) throw new Error('Pretty-printed Backup ১০ MiB-এর বেশি; scope ছোট করে আবার export করুন।')
  return backup
}

export function downloadWorkspaceBackup(backup: WorkspaceBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `smartflow-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.rel = 'noopener'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
