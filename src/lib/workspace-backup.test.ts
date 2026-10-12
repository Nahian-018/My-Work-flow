import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createWorkspaceBackup, validateWorkspaceBackup, WORKSPACE_BACKUP_FORMAT, WORKSPACE_BACKUP_SCHEMA_VERSION } from './workspace-backup'

const base = () => ({
  format: WORKSPACE_BACKUP_FORMAT,
  schema_version: WORKSPACE_BACKUP_SCHEMA_VERSION,
  workspace_id: 'workspace-1',
  exported_at: '2026-10-10T10:00:00.000Z',
  exported_by: 'user-a',
  work_lists: [], task_templates: [], task_instances: [],
  workspace_notes: [], notification_preferences: [], task_time_events: [], activity_events: [], history_archive: [],
})

type Row = Record<string, unknown>
function makeBackupClient(tables: Record<string, Row[]>) {
  const ranges: Array<{ table: string; from: number; to: number }> = []
  const client = {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = []
      const builder: Record<string, any> = {}
      builder.select = () => builder
      builder.eq = (column: string, value: unknown) => { filters.push({ column, value }); return builder }
      builder.is = (column: string, value: unknown) => { filters.push({ column, value }); return builder }
      builder.order = () => builder
      builder.range = (from: number, to: number) => {
        ranges.push({ table, from, to })
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => row[filter.column] === filter.value))
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length })
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, ranges }
}

describe('workspace backup validation and privacy boundary', () => {
  it('rejects an unsupported schema, wrong workspace, wrong collections, and oversized file', () => {
    expect(() => validateWorkspaceBackup({ ...base(), schema_version: 99 }, 'workspace-1', 'user-a')).toThrow(/schema version/)
    expect(() => validateWorkspaceBackup(base(), 'workspace-2', 'user-a')).toThrow(/অন্য workspace/)
    expect(() => validateWorkspaceBackup({ ...base(), task_instances: {} }, 'workspace-1', 'user-a')).toThrow(/task_instances/)
    expect(() => validateWorkspaceBackup(base(), 'workspace-1', 'user-a', 11 * 1024 * 1024)).toThrow(/১০ MiB/)
  })

  it('excludes a foreign private note but retains own private and shared notes', () => {
    const candidate = { ...base(), workspace_notes: [
      { id: 'private-own', visibility: 'private', owner_id: 'user-a' },
      { id: 'private-other', visibility: 'private', owner_id: 'user-b' },
      { id: 'shared', visibility: 'shared', owner_id: 'user-b' },
    ] }
    const result = validateWorkspaceBackup(candidate, 'workspace-1', 'user-a')
    expect(result.backup.workspace_notes.map((note) => note.id)).toEqual(['private-own', 'shared'])
    expect(result.excludedForeignPrivateNotes).toBe(1)
  })

  it('pages export rows completely and excludes foreign private notes and another user preferences', async () => {
    const tasks = Array.from({ length: 501 }, (_, index) => ({
      id: `task-${index}`, workspace_id: 'workspace-1', title: `Task ${index}`,
    }))
    const { client, ranges } = makeBackupClient({
      work_lists: [], task_templates: [], task_instances: tasks,
      workspace_notes: [
        { id: 'own-private', workspace_id: 'workspace-1', owner_id: 'user-a', visibility: 'private', deleted_at: null },
        { id: 'foreign-private', workspace_id: 'workspace-1', owner_id: 'user-b', visibility: 'private', deleted_at: null },
        { id: 'shared', workspace_id: 'workspace-1', owner_id: 'user-b', visibility: 'shared', deleted_at: null },
      ],
      notification_preferences: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      task_time_events: [], activity_events: [], workspace_history_archive: [],
    })

    const backup = await createWorkspaceBackup(client, 'user-a', 'workspace-1')
    expect(backup.task_instances).toHaveLength(501)
    expect(ranges.filter((range) => range.table === 'task_instances').map(({ from, to }) => [from, to]))
      .toEqual([[0, 499], [500, 999]])
    expect(backup.workspace_notes.map((note) => note.id)).toEqual(['own-private', 'shared'])
    expect(backup.notification_preferences).toEqual([{ user_id: 'user-a' }])
  })

  it('does not rewrite or treat local exports as cloud backup', () => {
    const result = validateWorkspaceBackup(base(), 'workspace-1', 'user-a')
    expect(result.backup.format).toBe('smartflow-duo-backup')
    expect(result.backup.schema_version).toBe(1)
  })
})
