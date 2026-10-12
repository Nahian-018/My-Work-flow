// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { LiveTask } from './task-service'
import {
  cacheTasks,
  cacheVerifiedMembership,
  cacheWorkspaceRecords,
  enqueueWorkspaceOperation,
  claimNotificationReceipt,
  clearUserTaskData,
  getPendingTaskStatuses,
  getPendingWorkspaceOperations,
  markQueuedStatusConflict,
  markWorkspaceOperationConflict,
  queueTaskStatus,
  readCachedTasks,
  readCachedWorkspaceRecords,
  removeWorkspaceOperation,
  updateWorkspaceOperationVersion,
  readVerifiedMembership,
  removeQueuedStatus,
  updateQueuedStatusVersion,
} from './offline-task-store'

const task: LiveTask = {
  id: 'task-a', workspace_id: 'workspace-a', template_id: null, work_list_id: null,
  planned_date: '2026-10-10', title: 'Test task', description: '', category: 'work', priority: 'medium',
  scheduled_start_time: '09:00:00', duration_minutes: 30, reminder_minutes: 10,
  planned_start_at: '2026-10-10T03:00:00.000Z', planned_end_at: '2026-10-10T03:30:00.000Z',
  reminder_at: '2026-10-10T02:50:00.000Z', status: 'pending', effective_status: 'pending',
  actual_started_at: null, actual_completed_at: null, accumulated_seconds: 0, running_since: null,
  elapsed_seconds: 0, remaining_seconds: 1800, overtime_seconds: 0, schedule_delta_seconds: null,
  version: 1, deleted_at: null, created_by: 'user-a',
}

const createdUsers = new Set<string>()
afterEach(async () => {
  for (const userId of createdUsers) await clearUserTaskData(userId)
  createdUsers.clear()
})

describe('user-partitioned IndexedDB task cache and offline status queue', () => {
  it('caches synced task snapshots separately for each authenticated user', async () => {
    createdUsers.add('user-cache-a')
    createdUsers.add('user-cache-b')
    await cacheTasks('user-cache-a', [task])
    await cacheTasks('user-cache-b', [{ ...task, id: 'task-b' }])

    expect((await readCachedTasks('user-cache-a')).map((row) => row.id)).toEqual(['task-a'])
    expect((await readCachedTasks('user-cache-b')).map((row) => row.id)).toEqual(['task-b'])
  })

  it('restores only the last server-verified membership for the matching Auth user', async () => {
    createdUsers.add('user-membership-a')
    await cacheVerifiedMembership({ userId: 'user-membership-a', workspaceId: 'workspace-a', memberRole: 'admin', displayName: 'Admin', avatarUrl: null })
    expect(await readVerifiedMembership('user-membership-a')).toMatchObject({ workspaceId: 'workspace-a', memberRole: 'admin' })
    expect(await readVerifiedMembership('user-membership-b')).toBeNull()
  })

  it('coalesces unsent status changes and preserves the first server version and operation id', async () => {
    createdUsers.add('user-queue-a')
    const first = await queueTaskStatus({ operationId: 'op-one', userId: 'user-queue-a', taskId: task.id, targetStatus: 'completed', expectedVersion: 1 })
    const second = await queueTaskStatus({ operationId: 'op-two', userId: 'user-queue-a', taskId: task.id, targetStatus: 'pending', expectedVersion: 9 })

    expect(first.operationId).toBe('op-one')
    expect(second.operationId).toBe('op-one')
    expect(second.expectedVersion).toBe(1)
    expect(second.targetStatus).toBe('pending')
    expect((await getPendingTaskStatuses('user-queue-a'))).toHaveLength(1)
  })

  it('retains conflicts until the user explicitly retries or discards them', async () => {
    createdUsers.add('user-queue-b')
    const queued = await queueTaskStatus({ operationId: 'op-conflict', userId: 'user-queue-b', taskId: task.id, targetStatus: 'completed', expectedVersion: 1 })
    await markQueuedStatusConflict(queued.operationId, 'TASK_VERSION_CONFLICT')
    const conflicting = await getPendingTaskStatuses('user-queue-b')
    expect(conflicting[0].state).toBe('conflict')
    expect(conflicting[0].error).toBe('TASK_VERSION_CONFLICT')

    await updateQueuedStatusVersion(queued.operationId, 2)
    expect((await getPendingTaskStatuses('user-queue-b'))[0]).toMatchObject({ state: 'pending', expectedVersion: 2, error: undefined })
    await removeQueuedStatus(queued.operationId)
    expect(await getPendingTaskStatuses('user-queue-b')).toEqual([])
  })

  it('claims a browser notification once and keeps receipts user-partitioned', async () => {
    createdUsers.add('user-notify-a')
    createdUsers.add('user-notify-b')
    expect(await claimNotificationReceipt('user-notify-a', 'task-a:pre_start:2026-10-10T03:00:00Z')).toBe(true)
    expect(await claimNotificationReceipt('user-notify-a', 'task-a:pre_start:2026-10-10T03:00:00Z')).toBe(false)
    expect(await claimNotificationReceipt('user-notify-b', 'task-a:pre_start:2026-10-10T03:00:00Z')).toBe(true)
  })

  it('does not clear another user’s cache or queued changes', async () => {
    createdUsers.add('user-clear-a')
    createdUsers.add('user-clear-b')
    await cacheTasks('user-clear-a', [task])
    await cacheTasks('user-clear-b', [{ ...task, id: 'task-b' }])
    await queueTaskStatus({ operationId: 'op-clear', userId: 'user-clear-a', taskId: task.id, targetStatus: 'completed', expectedVersion: 1 })

    await clearUserTaskData('user-clear-a')
    expect(await readCachedTasks('user-clear-a')).toEqual([])
    expect(await getPendingTaskStatuses('user-clear-a')).toEqual([])
    expect((await readCachedTasks('user-clear-b')).map((row) => row.id)).toEqual(['task-b'])
  })

  it('partitions cached notes by authenticated user and overlays only that user’s workspace records', async () => {
    createdUsers.add('user-note-cache-a')
    createdUsers.add('user-note-cache-b')
    const privateNoteA = { id: 'note-private-a', title: 'A private note' }
    const privateNoteB = { id: 'note-private-b', title: 'B private note' }
    await cacheWorkspaceRecords('user-note-cache-a', 'notes', [privateNoteA])
    await cacheWorkspaceRecords('user-note-cache-b', 'notes', [privateNoteB])

    expect(await readCachedWorkspaceRecords<typeof privateNoteA>('user-note-cache-a', 'notes')).toEqual([privateNoteA])
    expect(await readCachedWorkspaceRecords<typeof privateNoteB>('user-note-cache-b', 'notes')).toEqual([privateNoteB])
  })

  it('coalesces offline note edits with one stable operation id and the original expected version', async () => {
    createdUsers.add('user-note-queue')
    const first = await enqueueWorkspaceOperation({
      operationId: 'op-note-first', userId: 'user-note-queue', workspaceId: 'workspace-a',
      entityType: 'workspace_note', action: 'upsert_workspace_note', recordId: 'note-a', expectedVersion: 4,
      payload: { title: 'Draft one' },
    })
    const second = await enqueueWorkspaceOperation({
      operationId: 'op-note-second', userId: 'user-note-queue', workspaceId: 'workspace-a',
      entityType: 'workspace_note', action: 'upsert_workspace_note', recordId: 'note-a', expectedVersion: 9,
      payload: { title: 'Draft two' },
    })

    expect(second).toMatchObject({ operationId: first?.operationId, expectedVersion: 4, payload: { title: 'Draft two' }, state: 'pending' })
    expect((await getPendingWorkspaceOperations('user-note-queue'))).toHaveLength(1)
  })

  it('cancels an offline create when the same unsynced note is deleted', async () => {
    createdUsers.add('user-note-create-delete')
    await enqueueWorkspaceOperation({
      operationId: 'op-local-create', userId: 'user-note-create-delete', workspaceId: 'workspace-a',
      entityType: 'workspace_note', action: 'upsert_workspace_note', recordId: 'local-note', expectedVersion: null,
      payload: { title: 'Never synced' },
    })
    const deletion = await enqueueWorkspaceOperation({
      operationId: 'op-local-delete', userId: 'user-note-create-delete', workspaceId: 'workspace-a',
      entityType: 'workspace_note', action: 'delete_workspace_note', recordId: 'local-note', expectedVersion: null,
      payload: {},
    })

    expect(deletion).toBeNull()
    expect(await getPendingWorkspaceOperations('user-note-create-delete')).toEqual([])
  })

  it('holds workspace sync conflicts until a user retries with a new server version or discards', async () => {
    createdUsers.add('user-note-conflict')
    const queued = await enqueueWorkspaceOperation({
      operationId: 'op-note-conflict', userId: 'user-note-conflict', workspaceId: 'workspace-a',
      entityType: 'workspace_note', action: 'upsert_workspace_note', recordId: 'note-conflict', expectedVersion: 1,
      payload: { title: 'Local edit' },
    })
    await markWorkspaceOperationConflict(queued!.operationId, 'NOTE_VERSION_CONFLICT')
    expect((await getPendingWorkspaceOperations('user-note-conflict'))[0]).toMatchObject({ state: 'conflict', error: 'NOTE_VERSION_CONFLICT' })

    await updateWorkspaceOperationVersion(queued!.operationId, 2)
    expect((await getPendingWorkspaceOperations('user-note-conflict'))[0]).toMatchObject({ state: 'pending', expectedVersion: 2, error: undefined })
    await removeWorkspaceOperation(queued!.operationId)
    expect(await getPendingWorkspaceOperations('user-note-conflict')).toEqual([])
  })
})
