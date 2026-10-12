import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Download, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useLiveTasks } from '../phase3/LiveTaskProvider'
import { downloadCsv } from '../lib/csv-export'
import type { LiveTask } from '../lib/task-service'
import { formatClockSeconds } from '../domain/task-time'
import { getDhakaDateRange, groupReportTasks, groupTasksByDhakaDay, isValidDhakaDateKey, summarizeReportTasks } from './report-utils'
import type { DateRange, ReportPeriod } from './report-utils'

type PageState = 'loading' | 'ready' | 'offline' | 'error'
const REPORT_PAGE_SIZE = 500
const REPORT_MAX_ROWS = 5000
const REPORT_COLUMNS = 'id,workspace_id,template_id,work_list_id,planned_date,title,description,category,priority,scheduled_start_time,duration_minutes,reminder_minutes,planned_start_at,planned_end_at,reminder_at,status,actual_started_at,actual_completed_at,accumulated_seconds,running_since,elapsed_seconds,remaining_seconds,overtime_seconds,schedule_delta_seconds,effective_status,version,deleted_at,created_by'
const dateTime = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric' })
const dayFormat = (value: string) => dateOnly.format(new Date(`${value}T12:00:00+06:00`))

function formatStatus(task: LiveTask) {
  const status = task.status === 'completed' ? 'completed' : task.effective_status === 'overdue' ? 'overdue' : task.status
  return status === 'completed' ? 'সম্পন্ন' : status === 'in_progress' ? 'চলমান' : status === 'overdue' ? 'সময় পেরিয়েছে' : 'অপেক্ষমাণ'
}

async function fetchReportTasks(client: ReturnType<typeof useAuth>['client'], workspaceId: string, range: DateRange, isCurrent: () => boolean): Promise<LiveTask[]> {
  const rows: LiveTask[] = []
  let expectedRows: number | null = null
  for (let offset = 0; offset < REPORT_MAX_ROWS; offset += REPORT_PAGE_SIZE) {
    if (!isCurrent()) return []
    const { data, error, count } = await client.from('task_instance_clock')
      .select(REPORT_COLUMNS, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .gte('planned_date', range.from)
      .lte('planned_date', range.to)
      .is('deleted_at', null)
      .order('planned_start_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + REPORT_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (count !== null) expectedRows = count
    if (expectedRows !== null && expectedRows > REPORT_MAX_ROWS) {
      throw new Error(`এই date range-এ ${expectedRows.toLocaleString('bn-BD')}টি task আছে; ৫,০০০-row সীমার মধ্যে আনতে range ছোট করুন। Partial report/CSV তৈরি করা হয়নি।`)
    }
    const page = (data ?? []) as LiveTask[]
    rows.push(...page)
    if (expectedRows !== null && rows.length >= expectedRows) return rows
    if (page.length < REPORT_PAGE_SIZE) break
  }

  if (expectedRows === null && rows.length === REPORT_MAX_ROWS) {
    if (!isCurrent()) return []
    const { data, error } = await client.from('task_instance_clock')
      .select('id')
      .eq('workspace_id', workspaceId)
      .gte('planned_date', range.from)
      .lte('planned_date', range.to)
      .is('deleted_at', null)
      .range(REPORT_MAX_ROWS, REPORT_MAX_ROWS)
    if (error) throw new Error(error.message)
    if (data?.length) throw new Error('Report server row-count যাচাই করতে পারেনি এবং ৫,০০০-row সীমা ছুঁয়েছে; complete CSV নিশ্চিত করতে range ছোট করুন।')
  }
  if (expectedRows !== null && rows.length < expectedRows) {
    throw new Error(`Report pagination ${expectedRows}টির মধ্যে ${rows.length}টি row-ই ফেরত দিয়েছে; partial report/CSV বন্ধ করা হয়েছে।`)
  }
  return rows
}

export function LiveReportsPage() {
  const { client, membership } = useAuth()
  const { tasks: cachedTasks } = useLiveTasks()
  const [clockNow, setClockNow] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [])
  const initialWeek = getDhakaDateRange('weekly', clockNow)
  const [period, setPeriod] = useState<ReportPeriod>('weekly')
  const [customRange, setCustomRange] = useState<DateRange>(initialWeek)
  const range = period === 'custom' ? customRange : getDhakaDateRange(period, clockNow)
  const [tasks, setTasks] = useState<LiveTask[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [dimension, setDimension] = useState<'category' | 'user'>('category')
  const [state, setState] = useState<PageState>('loading')
  const [error, setError] = useState('')
  const [loadedRange, setLoadedRange] = useState('')
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const rangeKey = `${range.from}:${range.to}`
    const isCurrent = () => sequence === loadSequence.current
    if (!isValidDhakaDateKey(range.from) || !isValidDhakaDateKey(range.to) || range.from > range.to) {
      setTasks([])
      setLoadedRange('')
      setState('error')
      setError('Custom date range বৈধ নয়।')
      return
    }
    setState('loading')
    setError('')
    setTasks([])
    setUserNames({})
    setLoadedRange('')
    if (!navigator.onLine) {
      setTasks(cachedTasks.filter((task) => task.planned_date >= range.from && task.planned_date <= range.to && !task.deleted_at))
      setState('offline')
      setError('Offline report শুধু এই browser-এ থাকা task cache থেকে; পুরোনো custom date range অসম্পূর্ণ হতে পারে।')
      setLoadedRange(rangeKey)
      return
    }
    try {
      if (!membership?.workspace_id) throw new Error('সক্রিয় workspace membership পাওয়া যায়নি।')
      const reportRows = await fetchReportTasks(client, membership.workspace_id, range, isCurrent)
      if (!isCurrent()) return
      setTasks(reportRows)
      setLoadedRange(rangeKey)
      let names: Record<string, string> = {}
      try {
        const { data: profiles, error: profileError } = await client.from('profiles')
          .select('user_id,display_name').eq('workspace_id', membership?.workspace_id)
        if (!profileError) names = Object.fromEntries((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]))
      } catch { /* Report rows remain useful if optional member labels are unavailable. */ }
      if (!isCurrent()) return
      setUserNames(names)
      setState('ready')
    } catch (failure) {
      if (!isCurrent()) return
      const message = failure instanceof Error ? failure.message : String(failure)
      if (!navigator.onLine || /network|fetch|timeout/i.test(message)) {
        setTasks(cachedTasks.filter((task) => task.planned_date >= range.from && task.planned_date <= range.to && !task.deleted_at))
        setState('offline')
        setError('Server report পাওয়া যায়নি; প্রদর্শিত cached report অসম্পূর্ণ হতে পারে।')
        setLoadedRange(rangeKey)
      } else {
        setState('error')
        setError(`Report data লোড হয়নি: ${message}`)
      }
    }
  }, [cachedTasks, client, membership?.workspace_id, range.from, range.to])

  useEffect(() => {
    void load()
    return () => { loadSequence.current += 1 }
  }, [load])

  const summary = useMemo(() => summarizeReportTasks(tasks), [tasks])
  const groups = useMemo(() => groupReportTasks(tasks, dimension, userNames), [dimension, tasks, userNames])
  const days = useMemo(() => groupTasksByDhakaDay(tasks), [tasks])

  const exportTasks = () => {
    const rows: unknown[][] = [[
      'Task ID', 'তারিখ (Asia/Dhaka)', 'শিরোনাম', 'Category', 'Priority', 'অবস্থা', 'পরিকল্পিত শুরু (Dhaka)',
      'পরিকল্পিত শেষ (Dhaka)', 'সময়কাল (মিনিট)', 'বাস্তব elapsed (সেকেন্ড)', 'Owner/creator',
    ]]
    for (const task of tasks) rows.push([
      task.id, task.planned_date, task.title, task.category, task.priority, formatStatus(task),
      dateTime.format(new Date(task.planned_start_at)), dateTime.format(new Date(task.planned_end_at)),
      task.duration_minutes, task.elapsed_seconds, task.created_by ? userNames[task.created_by] ?? task.created_by : 'নির্ধারিত নয়',
    ])
    downloadCsv(rows, `smartflow-tasks-${range.from}-to-${range.to}.csv`)
  }
  const exportReport = () => {
    const rows: unknown[][] = [['পরিসর', `${range.from} — ${range.to}`], ['মোট', summary.total], ['সম্পন্ন', summary.completed], ['Completion rate (%)', summary.completionRate], ['Planned (seconds)', summary.plannedSeconds], ['Elapsed (seconds)', summary.elapsedSeconds], [], [dimension === 'category' ? 'Category' : 'অনুমোদিত সদস্য', 'মোট', 'সম্পন্ন', 'অপেক্ষমাণ', 'চলমান', 'Overdue', 'Elapsed (HH:MM:SS)']]
    for (const group of groups) rows.push([group.name, group.total, group.completed, group.pending, group.inProgress, group.overdue, formatClockSeconds(group.elapsedSeconds)])
    downloadCsv(rows, `smartflow-report-${range.from}-to-${range.to}.csv`)
  }

  const setQuickRange = (next: Exclude<ReportPeriod, 'custom'>) => {
    setPeriod(next)
  }
  const changePeriod = (next: ReportPeriod) => {
    if (next !== 'custom') setCustomRange(getDhakaDateRange(next, clockNow))
    setPeriod(next)
  }
  const updateCustom = (key: keyof DateRange, value: string) => {
    setCustomRange((current) => ({ ...current, [key]: value }))
    setPeriod('custom')
  }
  const canExport = state !== 'loading' && loadedRange === `${range.from}:${range.to}` && tasks.length > 0

  return <section className="live-page phase4-page live-reports-page">
    <div className="live-page-heading"><div><p className="live-eyebrow">DATABASE REPORT · ASIA/DHAKA</p><h1>রিপোর্ট ও CSV</h1><p className="live-subtitle">কেবল নির্বাচিত তারিখের authorized workspace database task</p></div><button className="live-button live-button-secondary" onClick={() => void load()}><RefreshCw size={15} />আবার লোড</button></div>
    <div className="phase4-report-controls">
      <div className="phase4-period-switch" role="group" aria-label="রিপোর্টের সময়কাল">{([['daily', 'দৈনিক'], ['weekly', 'সাপ্তাহিক'], ['monthly', 'মাসিক'], ['custom', 'নিজস্ব পরিসর']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} className={period === key ? 'active' : ''} onClick={() => changePeriod(key)}>{label}</button>)}</div>
      {period !== 'custom' && <button className="live-button live-button-ghost" onClick={() => setQuickRange(period)}>বর্তমান {period === 'daily' ? 'দিন' : period === 'weekly' ? 'সপ্তাহ' : 'মাস'}</button>}
      <label>শুরু<input type="date" value={range.from} onChange={(event) => updateCustom('from', event.target.value)} /></label>
      <label>শেষ<input type="date" value={range.to} onChange={(event) => updateCustom('to', event.target.value)} /></label>
      <button className="live-button live-button-secondary" onClick={exportTasks} disabled={!canExport}><Download size={15} />Task CSV</button>
      <button className="live-button live-button-primary" onClick={exportReport} disabled={!canExport}><Download size={15} />Report CSV</button>
    </div>

    <div className="phase4-report-source" role="status">{state === 'ready' ? `Cloud database · ${loadedRange.replace(':', ' → ')} · ${tasks.length.toLocaleString('bn-BD')} rows` : state === 'offline' ? 'Offline local snapshot · complete history নিশ্চিত নয়' : state === 'loading' ? 'Report load হচ্ছে…' : 'Report unavailable'}</div>
    {error && <div className={`live-banner ${state === 'error' ? 'live-banner-error' : 'live-banner-warning'}`} role={state === 'error' ? 'alert' : 'status'}>{error}</div>}
    {state === 'loading' && <div className="live-empty"><span className="live-spinner" /><p>তারিখ-সীমার task database থেকে লোড হচ্ছে…</p></div>}
    {state === 'error' && <div className="live-empty-card"><BarChart3 size={23} /><h2>Report তৈরি করা যায়নি</h2><p>Network, migration, RLS ও date range পরীক্ষা করুন।</p><button className="live-button live-button-secondary" onClick={() => void load()}>আবার চেষ্টা</button></div>}
    {state !== 'loading' && state !== 'error' && <>
      <div className="phase4-report-summary-grid">
        {[['মোট কাজ', summary.total], ['সম্পন্ন', summary.completed], ['অপেক্ষমাণ', summary.pending], ['চলমান', summary.inProgress], ['Overdue', summary.overdue], ['সম্পন্নের হার', `${summary.completionRate}%`]].map(([label, value]) => <article className="phase4-report-stat" key={String(label)}><small>{label}</small><strong>{typeof value === 'number' ? value.toLocaleString('bn-BD') : value}</strong></article>)}
      </div>
      <div className="phase4-report-tables">
        <article className="live-settings-card"><header className="phase4-report-section-heading"><div><span className="live-eyebrow">BREAKDOWN</span><h2>Category-wise / অনুমোদিত user-wise</h2></div><select value={dimension} onChange={(event) => setDimension(event.target.value as typeof dimension)}><option value="category">Category</option><option value="user">অনুমোদিত user</option></select></header>
          {groups.length ? <div className="phase4-table-scroll"><table className="phase4-data-table"><thead><tr><th>{dimension === 'category' ? 'Category' : 'সদস্য'}</th><th>মোট</th><th>সম্পন্ন</th><th>অপেক্ষমাণ</th><th>চলমান</th><th>Overdue</th><th>Elapsed</th></tr></thead><tbody>{groups.map((group) => <tr key={group.name}><th scope="row">{group.name}</th><td>{group.total}</td><td>{group.completed}</td><td>{group.pending}</td><td>{group.inProgress}</td><td>{group.overdue}</td><td>{formatClockSeconds(group.elapsedSeconds)}</td></tr>)}</tbody></table></div> : <p className="phase4-empty-row">এই তারিখ-সীমায় কোনো task নেই।</p>}
        </article>
        <article className="live-settings-card"><header className="phase4-report-section-heading"><div><span className="live-eyebrow">DHaka CALENDAR DAYS</span><h2>দিনভিত্তিক সম্পন্নের ধারা</h2></div></header>
          {days.length ? <div className="phase4-day-series">{days.map((day) => <div className="phase4-day-row" key={day.date}><span>{dayFormat(day.date)}</span><div className="phase4-day-track"><i style={{ width: `${day.total ? Math.round(day.completed * 100 / day.total) : 0}%` }} /></div><small>{day.completed}/{day.total} সম্পন্ন</small></div>)}</div> : <p className="phase4-empty-row">নির্বাচিত পরিসরে task নেই।</p>}
        </article>
      </div>
      <article className="live-settings-card phase4-report-task-table"><header className="phase4-report-section-heading"><div><span className="live-eyebrow">SOURCE ROWS</span><h2>কাজের বিস্তারিত ({tasks.length.toLocaleString('bn-BD')})</h2></div></header>
        {tasks.length ? <div className="phase4-table-scroll"><table className="phase4-data-table"><thead><tr><th>Task</th><th>Dhaka তারিখ/সময়</th><th>Category</th><th>অবস্থা</th><th>Planned</th><th>Elapsed</th><th>তৈরি করেছেন</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><th scope="row">{task.title}</th><td>{dayFormat(task.planned_date)} · {dateTime.format(new Date(task.planned_start_at)).split(' ').slice(-2).join(' ')}</td><td>{task.category}</td><td>{formatStatus(task)}</td><td>{task.duration_minutes} মিনিট</td><td>{formatClockSeconds(task.elapsed_seconds)}</td><td>{task.created_by ? userNames[task.created_by] ?? 'অনুমোদিত সদস্য' : 'নির্ধারিত নয়'}</td></tr>)}</tbody></table></div> : <p className="phase4-empty-row">এই date range-এ কোনো task নেই।</p>}
      </article>
      <p className="phase4-storage-hint">CSV-তে UTF-8 BOM, Bengali text ও formula-injection neutralization আছে। Offline mode-এ report cached snapshot থেকে এবং historical completeness নিশ্চিত নয়।</p>
    </>}
  </section>
}
