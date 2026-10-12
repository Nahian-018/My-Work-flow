import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiveBackupPage } from './LiveBackupPage'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(), useLiveTasks: vi.fn(), useLiveNotifications: vi.fn(), useCollaboration: vi.fn(),
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('../phase3/LiveTaskProvider', () => ({ useLiveTasks: mocks.useLiveTasks }))
vi.mock('../phase3/LiveNotificationProvider', () => ({ useLiveNotifications: mocks.useLiveNotifications }))
vi.mock('./WorkspaceCollaborationProvider', () => ({ useWorkspaceCollaboration: mocks.useCollaboration }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function makeBackup() {
  return {
    format: 'smartflow-duo-backup', schema_version: 1, workspace_id: 'workspace-1',
    exported_at: '2026-10-10T10:00:00.000Z', exported_by: 'user-a',
    work_lists: [], task_templates: [], task_instances: [], workspace_notes: [],
    notification_preferences: [], task_time_events: [], activity_events: [], history_archive: [],
  }
}

function backupFile(value: unknown, name: string) {
  const contents = JSON.stringify(value)
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => contents })
  return file
}

function setup() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ work_lists: 0, task_templates: 0, task_instances: 1, workspace_notes: 0, history_archive: 0, preferences: 0 }],
    error: null,
  })
  const refreshTasks = vi.fn().mockResolvedValue(undefined)
  const reloadPreferences = vi.fn().mockResolvedValue(undefined)
  const refreshNotes = vi.fn().mockResolvedValue(undefined)
  const refreshChat = vi.fn().mockResolvedValue(undefined)
  mocks.useAuth.mockReturnValue({ client: { rpc }, user: { id: 'user-a' }, membership: { workspace_id: 'workspace-1' } })
  mocks.useLiveTasks.mockReturnValue({ refresh: refreshTasks })
  mocks.useLiveNotifications.mockReturnValue({ reloadPreferences })
  mocks.useCollaboration.mockReturnValue({ refreshNotes, refreshChat })
  return { rpc, refreshTasks, reloadPreferences, refreshNotes, refreshChat }
}

describe('Phase 4 backup/restore page', () => {
  it('previews a valid backup, requires confirmation, restores once, and refreshes live data', async () => {
    const user = userEvent.setup()
    const { rpc, refreshTasks, reloadPreferences, refreshNotes, refreshChat } = setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<LiveBackupPage />)
    const file = backupFile(makeBackup(), 'smartflow-backup.json')
    await user.upload(document.querySelector('input[type="file"]')!, file)

    expect(await screen.findByText(/Restore preview/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmation দিয়ে Restore' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirmation দিয়ে Restore' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('restore_workspace_backup', expect.objectContaining({
      p_backup: makeBackup(), p_operation_id: expect.any(String),
    })))
    expect(await screen.findByText('Restore RPC সফল হয়েছে')).toBeInTheDocument()
    expect(refreshTasks).toHaveBeenCalledOnce()
    expect(reloadPreferences).toHaveBeenCalledOnce()
    expect(refreshNotes).toHaveBeenCalledOnce()
    expect(refreshChat).toHaveBeenCalledOnce()
  })

  it('rejects a backup for another workspace before offering restore', async () => {
    const user = userEvent.setup()
    const { rpc } = setup()
    render(<LiveBackupPage />)
    const invalid = { ...makeBackup(), workspace_id: 'another-workspace' }
    await user.upload(document.querySelector('input[type="file"]')!, backupFile(invalid, 'wrong.json'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/অন্য workspace/)
    expect(screen.queryByRole('button', { name: 'Confirmation দিয়ে Restore' })).not.toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})
