import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LiveTask } from '../lib/task-service'
import { dhakaDateKey } from '../domain/task-time'
import { LiveReportsPage } from './LiveReportsPage'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), useLiveTasks: vi.fn(), downloadCsv: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('../phase3/LiveTaskProvider', () => ({ useLiveTasks: mocks.useLiveTasks }))
vi.mock('../lib/csv-export', () => ({ downloadCsv: mocks.downloadCsv }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const now = new Date()
const today = dhakaDateKey(now)
const start = new Date(`${today}T09:00:00+06:00`)
const end = new Date(start.getTime() + 45 * 60_000)
const fixture: LiveTask = {
  id: 'task-report', workspace_id: 'report-workspace', template_id: null, work_list_id: null,
  planned_date: today, title: 'বাংলা report task', description: 'CSV content', category: 'work', priority: 'high',
  scheduled_start_time: '09:00:00', duration_minutes: 45, reminder_minutes: null,
  planned_start_at: start.toISOString(), planned_end_at: end.toISOString(), reminder_at: null,
  status: 'completed', actual_started_at: start.toISOString(), actual_completed_at: end.toISOString(),
  accumulated_seconds: 1800, running_since: null, elapsed_seconds: 1800, remaining_seconds: 0,
  overtime_seconds: 0, schedule_delta_seconds: null, effective_status: 'completed', version: 1,
  deleted_at: null, created_by: 'report-member',
}

function mockPage({ rowCount = 501 }: { rowCount?: number } = {}) {
  const reportRows = Array.from({ length: Math.min(rowCount, 501) }, (_, index) => ({ ...fixture, id: `report-${index}`, title: index === 500 ? fixture.title : `Task ${index}` }))
  const rangeCalls: Array<[string, number, number]> = []
  const profileRows = [{ user_id: 'report-member', display_name: 'সদস্য A' }]
  const client = {
    from(table: string) {
      const filters: Array<{ column: string; op: 'eq' | 'gte' | 'lte' | 'is'; value: unknown }> = []
      const builder: Record<string, any> = {}
      const rowsForTable = () => table === 'task_instance_clock' ? reportRows : table === 'profiles' ? profileRows : []
      builder.select = () => builder
      builder.eq = (column: string, value: unknown) => { filters.push({ column, op: 'eq', value }); return builder }
      builder.gte = (column: string, value: unknown) => { filters.push({ column, op: 'gte', value }); return builder }
      builder.lte = (column: string, value: unknown) => { filters.push({ column, op: 'lte', value }); return builder }
      builder.is = (column: string, value: unknown) => { filters.push({ column, op: 'is', value }); return builder }
      builder.order = () => builder
      const filtered = () => rowsForTable().filter((row) => filters.every((filter) => {
        const field = row[filter.column as keyof typeof row]
        if (filter.op === 'eq' || filter.op === 'is') return field === filter.value
        return filter.op === 'gte' ? String(field) >= String(filter.value) : String(field) <= String(filter.value)
      }))
      builder.range = (from: number, to: number) => {
        rangeCalls.push([table, from, to])
        return Promise.resolve({ data: filtered().slice(from, to + 1), error: null, count: table === 'task_instance_clock' ? rowCount : filtered().length })
      }
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: filtered(), error: null, count: filtered().length }).then(resolve, reject)
      return builder
    },
  }
  mocks.useAuth.mockReturnValue({ client, membership: { workspace_id: 'report-workspace' } })
  mocks.useLiveTasks.mockReturnValue({ tasks: [] })
  return { rangeCalls }
}

describe('Phase 4 live reports and complete-range guard', () => {
  it('paginates authorized task rows, labels the source, and exports Bengali CSV rows', async () => {
    const user = userEvent.setup()
    const { rangeCalls } = mockPage({ rowCount: 501 })
    render(<LiveReportsPage />)

    expect(await screen.findByText('বাংলা report task')).toBeInTheDocument()
    await waitFor(() => expect(rangeCalls.filter(([table]) => table === 'task_instance_clock')).toEqual([
      ['task_instance_clock', 0, 499], ['task_instance_clock', 500, 999],
    ]))
    expect(screen.getByText(/Cloud database/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Task CSV' }))
    expect(mocks.downloadCsv).toHaveBeenCalledOnce()
    const [rows, filename] = mocks.downloadCsv.mock.calls[0]
    expect(rows).toHaveLength(502)
    expect(rows[0]).toContain('তারিখ (Asia/Dhaka)')
    expect(rows[501]).toContain('বাংলা report task')
    expect(filename).toMatch(/smartflow-tasks-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv/)
  })

  it('rejects a range over 5,000 rows rather than enabling a partial report or CSV', async () => {
    mockPage({ rowCount: 5001 })
    render(<LiveReportsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/৫,০০০-row সীমার মধ্যে আনতে range ছোট করুন/)
    expect(screen.getByText('Report তৈরি করা যায়নি')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Task CSV' })).toBeDisabled()
    expect(mocks.downloadCsv).not.toHaveBeenCalled()
  })
})
