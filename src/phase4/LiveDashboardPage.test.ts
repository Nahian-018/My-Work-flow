import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { LiveTask } from '../lib/task-service'
import { dhakaDateKey } from '../domain/task-time'
import { LiveDashboardPage, calculateDashboardMetrics } from './LiveDashboardPage'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), useLiveTasks: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('../phase3/LiveTaskProvider', () => ({ useLiveTasks: mocks.useLiveTasks }))

function task(overrides: Partial<LiveTask> = {}): LiveTask {
  return {
    id: 'task-1', workspace_id: 'workspace-1', template_id: null, work_list_id: null,
    planned_date: '2026-10-11', title: 'Task', description: '', category: 'work', priority: 'medium',
    scheduled_start_time: '09:00:00', duration_minutes: 30, reminder_minutes: null,
    planned_start_at: '2026-10-11T01:00:00.000Z', planned_end_at: '2026-10-11T01:30:00.000Z',
    reminder_at: null, status: 'pending', effective_status: 'pending', actual_started_at: null,
    actual_completed_at: null, accumulated_seconds: 0, running_since: null, elapsed_seconds: 0,
    remaining_seconds: 1800, overtime_seconds: 0, schedule_delta_seconds: null, version: 1,
    deleted_at: null, created_by: 'user-1', ...overrides,
  }
}

describe('database-backed dashboard metrics', () => {
  it('counts today by Dhaka calendar date and derives overdue as time advances', () => {
    const now = new Date('2026-10-10T18:15:00.000Z') // 11 October, 00:15 in Dhaka
    const tasks = [
      task({ id: 'completed', status: 'completed', effective_status: 'completed', actual_completed_at: '2026-10-10T18:00:00.000Z' }),
      task({ id: 'pending', planned_start_at: '2026-10-10T18:30:00.000Z', planned_end_at: '2026-10-10T19:00:00.000Z' }),
      task({ id: 'running', status: 'in_progress', effective_status: 'in_progress', planned_start_at: '2026-10-10T17:50:00.000Z', planned_end_at: '2026-10-10T19:30:00.000Z' }),
      task({ id: 'became-overdue', planned_start_at: '2026-10-10T17:30:00.000Z', planned_end_at: '2026-10-10T18:10:00.000Z' }),
      task({ id: 'old-overdue', planned_date: '2026-10-09', status: 'overdue', effective_status: 'overdue' }),
      task({ id: 'deleted', deleted_at: '2026-10-10T17:00:00.000Z' }),
    ]

    const metrics = calculateDashboardMetrics(tasks, now)
    expect(metrics.today).toBe('2026-10-11')
    expect(metrics.total).toBe(4)
    expect(metrics.completed).toBe(1)
    expect(metrics.pending).toBe(1)
    expect(metrics.inProgress).toBe(1)
    expect(metrics.overdue).toBe(2)
    expect(metrics.completionRate).toBe(25)
    expect(metrics.upcoming.map((item) => item.id)).toEqual(['pending'])
  })

  it('uses real task data for an empty day and never includes completed, deleted, or overdue upcoming rows', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const metrics = calculateDashboardMetrics([
      task({ id: 'completed', planned_date: '2026-10-09', status: 'completed', effective_status: 'completed' }),
      task({ id: 'deleted', planned_date: '2026-10-10', deleted_at: '2026-10-10T11:00:00.000Z' }),
      task({ id: 'old-overdue', planned_date: '2026-10-09', status: 'overdue', effective_status: 'overdue' }),
    ], now)
    expect(metrics.total).toBe(0)
    expect(metrics.completed).toBe(0)
    expect(metrics.completionRate).toBe(0)
    expect(metrics.upcoming).toEqual([])
    expect(metrics.overdue).toBe(1)
  })

  it('renders the uncapped server summary instead of treating the browser task cache as the cloud total', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ today: '2026-10-11', total: 2, completed: 1, pending: 1, in_progress: 0, overdue: 3, completion_rate: 50, upcoming: [] }],
      error: null,
    })
    mocks.useAuth.mockReturnValue({ client: { rpc } })
    mocks.useLiveTasks.mockReturnValue({ tasks: [], state: 'connected', error: '', online: true, refresh: vi.fn() })
    render(createElement(MemoryRouter, null, createElement(LiveDashboardPage)))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_dashboard_summary'))
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText(/পূর্ণ server-side database aggregate/)).toBeInTheDocument()
    expect(screen.getByText(/Supabase database/)).toBeInTheDocument()
  })

  it('shows a clearly local snapshot while offline and never calls the dashboard RPC', async () => {
    const rpc = vi.fn()
    mocks.useAuth.mockReturnValue({ client: { rpc } })
    mocks.useLiveTasks.mockReturnValue({
      tasks: [task({ id: 'cached', planned_date: dhakaDateKey(new Date()), status: 'completed', effective_status: 'completed' })],
      state: 'offline', error: '', online: false, refresh: vi.fn(),
    })
    render(createElement(MemoryRouter, null, createElement(LiveDashboardPage)))

    expect(await screen.findByRole('status')).toHaveTextContent(/Offline/)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/local cached snapshot · সম্পূর্ণ নাও হতে পারে/)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows a backend error instead of passing a database failure off as real dashboard data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'get_dashboard_summary is missing' } })
    mocks.useAuth.mockReturnValue({ client: { rpc } })
    mocks.useLiveTasks.mockReturnValue({ tasks: [], state: 'connected', error: '', online: true, refresh: vi.fn() })
    render(createElement(MemoryRouter, null, createElement(LiveDashboardPage)))

    expect(await screen.findByRole('alert')).toHaveTextContent(/get_dashboard_summary is missing/)
    expect(screen.getByText('Dashboard data লোড হয়নি')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
