import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { dhakaDateKey } from '../domain/task-time'
import type { LiveTask, TaskDraft } from '../lib/task-service'
import { LiveWorkspace } from './LiveWorkspace'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useLiveTasks: vi.fn(),
  useLiveNotifications: vi.fn(),
  clientFrom: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('./LiveTaskProvider', () => ({
  LiveTaskProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLiveTasks: mocks.useLiveTasks,
}))
vi.mock('./LiveNotificationProvider', () => ({
  LiveNotificationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLiveNotifications: mocks.useLiveNotifications,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const today = dhakaDateKey()
const task: LiveTask = {
  id: 'task-live-a', workspace_id: 'workspace-live', template_id: null, work_list_id: null,
  planned_date: today, title: 'Live report task', description: 'Only live data', category: 'work', priority: 'high',
  scheduled_start_time: '09:00:00', duration_minutes: 45, reminder_minutes: 10,
  planned_start_at: `${today}T03:00:00.000Z`, planned_end_at: `${today}T03:45:00.000Z`,
  reminder_at: `${today}T02:50:00.000Z`, status: 'pending', effective_status: 'pending',
  actual_started_at: null, actual_completed_at: null, accumulated_seconds: 0, running_since: null,
  elapsed_seconds: 0, remaining_seconds: 2700, overtime_seconds: 0, schedule_delta_seconds: null,
  version: 1, deleted_at: null, created_by: 'user-live',
}

function makeMockClient() {
  const result = { data: [], error: null }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
    in: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }
  mocks.clientFrom.mockImplementation(() => builder)
  return { from: mocks.clientFrom }
}

function renderWorkspace(path = '/tasks') {
  const client = makeMockClient()
  const liveState = {
    tasks: [task], state: 'connected', online: true, realtimeConnected: true, error: '', cacheWarning: '', pendingOperations: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockResolvedValue(undefined),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    setTaskStatus: vi.fn().mockResolvedValue(undefined),
    startTimer: vi.fn().mockResolvedValue(undefined),
    pauseTimer: vi.fn().mockResolvedValue(undefined),
    resumeTimer: vi.fn().mockResolvedValue(undefined),
    stopRecurrence: vi.fn().mockResolvedValue(undefined),
    retryConflict: vi.fn().mockResolvedValue(undefined),
    discardOperation: vi.fn().mockResolvedValue(undefined),
    dismissError: vi.fn(),
  }
  mocks.useAuth.mockReturnValue({
    client, user: { id: 'user-live', email: 'member@gmail.com' }, profile: { display_name: 'Live Member' },
    membership: { workspace_id: 'workspace-live', member_role: 'member' }, signOut: vi.fn().mockResolvedValue(undefined),
  })
  mocks.useLiveTasks.mockReturnValue(liveState)
  const notificationState = {
    permission: 'default', preferenceState: 'ready', preferenceError: '',
    preferences: {
      user_id: 'user-live', workspace_id: 'workspace-live', pre_start_enabled: true, task_start_enabled: true,
      overdue_enabled: true, upcoming_enabled: true, daily_summary_enabled: true, daily_summary_time: '20:00:00',
      quiet_hours_enabled: false, quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00', updated_at: '',
    },
    savePreference: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn().mockResolvedValue(undefined),
    reloadPreferences: vi.fn().mockResolvedValue(undefined),
  }
  mocks.useLiveNotifications.mockReturnValue(notificationState)
  render(<MemoryRouter initialEntries={[path]}><LiveWorkspace /></MemoryRouter>)
  return { liveState, client, notificationState }
}

describe('protected live task workspace UI', () => {
  it('shows cloud tasks and invokes the persisted timer operation from the active route', async () => {
    const user = userEvent.setup()
    const { liveState } = renderWorkspace('/tasks')
    expect(screen.getByRole('heading', { name: 'সক্রিয় কাজ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Live report task' })).toBeInTheDocument()
    expect(screen.getByText(/Cloud connected/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start task timer' }))
    expect(liveState.startTimer).toHaveBeenCalledWith('task-live-a')
  })

  it('creates a task using the live form and stable operation-key path', async () => {
    const user = userEvent.setup()
    const { liveState } = renderWorkspace('/tasks')
    await user.click(screen.getByRole('button', { name: 'নতুন কাজ' }))
    const title = screen.getByLabelText('কাজের নাম')
    await user.clear(title)
    await user.type(title, 'Design a real task')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }))
    await waitFor(() => expect(liveState.createTask).toHaveBeenCalledOnce())
    const [draft, operationId] = liveState.createTask.mock.calls[0] as [TaskDraft, string]
    expect(draft.title).toBe('Design a real task')
    expect(operationId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('navigates to the protected activity-history route and loads only backend events', async () => {
    const user = userEvent.setup()
    const { client } = renderWorkspace('/tasks')
    await user.click(screen.getByRole('link', { name: /Activity history/ }))
    expect(await screen.findByRole('heading', { name: 'Activity history' })).toBeInTheDocument()
    expect(client.from).toHaveBeenCalledWith('activity_events')
    expect(screen.getByText('এখনো কোনো activity নেই')).toBeInTheDocument()
  })

  it('exposes explicit browser-permission and persisted reminder-preference controls', async () => {
    const user = userEvent.setup()
    const { notificationState } = renderWorkspace('/settings')
    await user.click(screen.getByRole('button', { name: 'Notification permission দিন' }))
    expect(notificationState.requestPermission).toHaveBeenCalledOnce()
    const upcoming = screen.getByRole('checkbox', { name: /আসন্ন task/ })
    await user.click(upcoming)
    expect(notificationState.savePreference).toHaveBeenCalledWith('upcoming_enabled', false)
    expect(screen.getByText(/Service Worker\/Web Push server delivery চালু নয়/)).toBeInTheDocument()
  })
})
