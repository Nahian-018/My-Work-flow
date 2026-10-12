import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Circle, Clock3, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { dhakaDateKey, formatClockSeconds, getTaskClockSnapshot } from '../domain/task-time'
import { useLiveTasks } from '../phase3/LiveTaskProvider'
import type { LiveTask } from '../lib/task-service'

const dateFormat = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' })

export interface DashboardUpcomingTask {
  id: string
  title: string
  category: string
  priority: 'low' | 'medium' | 'high'
  duration_minutes: number
  status: 'pending' | 'in_progress'
  planned_start_at: string
  planned_end_at: string
  actual_started_at: string | null
  accumulated_seconds: number
  running_since: string | null
}

export interface DashboardSnapshot {
  today: string
  total: number
  completed: number
  pending: number
  inProgress: number
  overdue: number
  completionRate: number
  upcoming: DashboardUpcomingTask[]
}

type DashboardState = 'loading' | 'connected' | 'offline' | 'error'

export function calculateDashboardMetrics(tasks: LiveTask[], now: Date): DashboardSnapshot {
  const today = dhakaDateKey(now)
  const todayTasks = tasks.filter((task) => task.planned_date === today && !task.deleted_at)
  const effective = (task: LiveTask) => {
    if (task.status === 'completed') return 'completed'
    const plannedEnd = Date.parse(task.planned_end_at)
    if (task.status === 'overdue' || task.effective_status === 'overdue'
        || Number.isFinite(plannedEnd) && plannedEnd <= now.getTime()) return 'overdue'
    return task.status
  }
  const completed = todayTasks.filter((task) => effective(task) === 'completed').length
  const pending = todayTasks.filter((task) => effective(task) === 'pending').length
  const inProgress = todayTasks.filter((task) => effective(task) === 'in_progress').length
  const overdue = tasks.filter((task) => effective(task) === 'overdue' && !task.deleted_at).length
  const upcoming = tasks.filter((task) => !task.deleted_at && effective(task) !== 'completed'
      && effective(task) !== 'overdue' && new Date(task.planned_start_at).getTime() > now.getTime())
    .sort((left, right) => left.planned_start_at.localeCompare(right.planned_start_at))
    .map((task) => ({
      id: task.id, title: task.title, category: task.category, priority: task.priority,
      duration_minutes: task.duration_minutes, status: task.status === 'in_progress' ? 'in_progress' as const : 'pending' as const,
      planned_start_at: task.planned_start_at, planned_end_at: task.planned_end_at,
      actual_started_at: task.actual_started_at, accumulated_seconds: task.accumulated_seconds,
      running_since: task.running_since,
    }))
  return { today, total: todayTasks.length, completed, pending, inProgress, overdue,
    completionRate: todayTasks.length ? Math.round(completed * 100 / todayTasks.length) : 0, upcoming }
}

function normalizeDashboardSnapshot(value: unknown): DashboardSnapshot {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') throw new Error('Dashboard RPC একটি বৈধ snapshot ফেরত দেয়নি।')
  const data = row as Record<string, unknown>
  const today = String(data.today ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Dashboard RPC-এর Dhaka তারিখ ভুল format-এ এসেছে।')
  const numeric = (field: string) => {
    const number = Number(data[field])
    if (!Number.isFinite(number) || number < 0) throw new Error(`Dashboard RPC-এর ${field} সংখ্যা অবৈধ।`)
    return Math.floor(number)
  }
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Dashboard upcoming task-এ ভুল row আছে।')
    const task = item as Record<string, unknown>
    if (!task.id || !task.title || !task.planned_start_at || !task.planned_end_at) throw new Error('Dashboard upcoming task অসম্পূর্ণ।')
    const priority: DashboardUpcomingTask['priority'] = task.priority === 'low' || task.priority === 'high' ? task.priority : 'medium'
    return {
      id: String(task.id), title: String(task.title), category: String(task.category ?? 'general'), priority,
      duration_minutes: numericValue(task.duration_minutes, 'duration_minutes'),
      status: task.status === 'in_progress' ? 'in_progress' as const : 'pending' as const,
      planned_start_at: String(task.planned_start_at), planned_end_at: String(task.planned_end_at),
      actual_started_at: task.actual_started_at ? String(task.actual_started_at) : null,
      accumulated_seconds: numericValue(task.accumulated_seconds, 'accumulated_seconds'),
      running_since: task.running_since ? String(task.running_since) : null,
    }
  }) : []
  return {
    today, total: numeric('total'), completed: numeric('completed'), pending: numeric('pending'),
    inProgress: numeric('in_progress'), overdue: numeric('overdue'),
    completionRate: Math.min(100, numeric('completion_rate')), upcoming,
  }
}

function numericValue(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`Dashboard upcoming ${field} অবৈধ।`)
  return Math.floor(number)
}

function dashboardErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error)
}

function networkFailure(error: unknown): boolean {
  const message = dashboardErrorMessage(error)
  return !navigator.onLine || /failed to fetch|network|fetch failed|offline|timeout|load failed/i.test(message)
}

export function LiveDashboardPage() {
  const { client } = useAuth()
  const { tasks, error: taskError, online, refresh } = useLiveTasks()
  const [now, setNow] = useState(() => new Date())
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [dashboardState, setDashboardState] = useState<DashboardState>('loading')
  const [dashboardError, setDashboardError] = useState('')
  const loadSequence = useRef(0)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const loadDashboard = useCallback(async () => {
    const sequence = ++loadSequence.current
    const isCurrent = () => sequence === loadSequence.current
    if (!online || !navigator.onLine) {
      setSnapshot(null)
      setDashboardState('offline')
      setDashboardError('')
      return
    }
    setDashboardState('loading')
    setDashboardError('')
    try {
      const { data, error } = await client.rpc('get_dashboard_summary')
      if (!isCurrent()) return
      if (error) throw error
      setSnapshot(normalizeDashboardSnapshot(data))
      setDashboardState('connected')
    } catch (failure) {
      if (!isCurrent()) return
      if (networkFailure(failure)) {
        setSnapshot(null)
        setDashboardState('offline')
        setDashboardError('Server-এ পৌঁছানো যায়নি; নিচে এই device-এ আগে sync হওয়া task cache-এর হিসাব দেখানো হচ্ছে।')
      } else {
        setSnapshot(null)
        setDashboardState('error')
        setDashboardError(dashboardErrorMessage(failure))
      }
    }
  }, [client, online])

  useEffect(() => {
    void loadDashboard()
    const poll = window.setInterval(() => { if (navigator.onLine) void loadDashboard() }, 60_000)
    const onOnline = () => void loadDashboard()
    const onOffline = () => {
      loadSequence.current += 1
      setSnapshot(null)
      setDashboardState('offline')
      setDashboardError('')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      loadSequence.current += 1
      window.clearInterval(poll)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [loadDashboard])

  const cachedMetrics = useMemo(() => calculateDashboardMetrics(tasks, now), [tasks, now])
  const metrics = snapshot ?? cachedMetrics
  const isCached = dashboardState === 'offline'
  const canShowMetrics = dashboardState !== 'error' && (dashboardState !== 'loading' || Boolean(snapshot))
  const metricsCards = [
    { label: 'আজকের মোট কাজ', value: metrics.total, icon: CalendarClock, style: 'metric-total' },
    { label: 'সম্পন্ন', value: metrics.completed, icon: CheckCircle2, style: 'metric-completed' },
    { label: 'অপেক্ষমাণ', value: metrics.pending, icon: Circle, style: 'metric-pending' },
    { label: 'চলমান', value: metrics.inProgress, icon: Activity, style: 'metric-running' },
    { label: 'সময় পেরিয়েছে', value: metrics.overdue, icon: AlertTriangle, style: 'metric-overdue' },
  ]

  return <section className="live-page phase4-page live-dashboard-page">
    <div className="live-page-heading"><div><p className="live-eyebrow">DATABASE SUMMARY · ASIA/DHAKA</p><h1>কর্মপরিকল্পনার ড্যাশবোর্ড</h1><p className="live-subtitle">{dateFormat.format(new Date(`${metrics.today}T12:00:00+06:00`))} · {snapshot ? 'Supabase database' : isCached ? 'এই device-এর cached snapshot' : dashboardState === 'loading' ? 'Server summary লোড হচ্ছে' : 'Supabase source'}</p></div><button className="live-button live-button-secondary" onClick={() => { void refresh(); void loadDashboard() }}><RefreshCw size={15} />Refresh</button></div>

    {isCached && <div className="live-banner live-banner-warning" role="status">Offline: এই সংখ্যা শুধু আগে sync হওয়া local cache থেকে; Cloud-এর বর্তমান অবস্থা নয়. {taskError}</div>}
    {dashboardError && <div className={`live-banner ${dashboardState === 'error' ? 'live-banner-error' : 'live-banner-warning'}`} role={dashboardState === 'error' ? 'alert' : 'status'}>{dashboardError}<button className="live-button live-button-secondary" onClick={() => void loadDashboard()}>আবার চেষ্টা</button></div>}
    {dashboardState === 'loading' && !snapshot && <div className="live-empty"><span className="live-spinner" /><p>Supabase থেকে আজকের পূর্ণ task summary লোড হচ্ছে…</p></div>}
    {dashboardState === 'error' && <div className="live-empty-card"><AlertTriangle size={22} /><h2>Dashboard data লোড হয়নি</h2><p>Phase 4 dashboard migration, network ও RLS পরীক্ষা করুন।</p></div>}
    {canShowMetrics && <>
      <div className="phase4-metrics-grid">{metricsCards.map((card) => <article className={`phase4-metric-card ${card.style}`} key={card.label}><span className="phase4-metric-icon"><card.icon size={18} /></span><span className="phase4-metric-label">{card.label}</span><strong>{card.value.toLocaleString('bn-BD')}</strong><small>{card.label === 'সময় পেরিয়েছে' ? 'সব অসম্পন্ন overdue task' : 'Asia/Dhaka তারিখ অনুযায়ী'}</small></article>)}</div>
      <article className="phase4-completion-panel"><div><span className="live-eyebrow">আজকের সম্পন্নের হার</span><h2>{metrics.completionRate.toLocaleString('bn-BD')}%</h2><p>{metrics.completed.toLocaleString('bn-BD')} / {metrics.total.toLocaleString('bn-BD')} task সম্পন্ন</p></div><div className="phase4-progress-track" role="progressbar" aria-valuenow={metrics.completionRate} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${metrics.completionRate}%` }} /></div><span className="phase4-data-source">{snapshot ? 'পূর্ণ server-side database aggregate' : isCached ? 'local cached snapshot · সম্পূর্ণ নাও হতে পারে' : 'Supabase server data যাচাই হচ্ছে'}</span></article>

      <section className="phase4-upcoming-panel"><header><div><span className="live-eyebrow">পরবর্তী নির্ধারিত কাজ</span><h2><Clock3 size={19} />Upcoming task</h2></div><Link to="/tasks" className="live-button live-button-secondary">সব সক্রিয় কাজ <ArrowRight size={15} /></Link></header>
        {metrics.upcoming.length ? <div className="phase4-upcoming-list">{metrics.upcoming.slice(0, 8).map((task) => <UpcomingTask key={task.id} task={task} now={now} />)}</div> : <div className="live-empty-card compact-empty"><h3>এখন কোনো upcoming task নেই</h3><p>আজ বা পরবর্তী তারিখে নির্ধারিত ভবিষ্যৎ কাজ নেই।</p></div>}
      </section>
    </>}
  </section>
}

function UpcomingTask({ task, now }: { task: DashboardUpcomingTask; now: Date }) {
  const snapshot = getTaskClockSnapshot({
    plannedStartAt: task.planned_start_at,
    expectedDurationMinutes: task.duration_minutes,
    status: task.status,
    actualStartedAt: task.actual_started_at,
    accumulatedSeconds: task.accumulated_seconds,
    runningSince: task.running_since,
  }, now)
  return <article className="phase4-upcoming-task"><span className="phase4-upcoming-time">{timeFormat.format(new Date(task.planned_start_at))}</span><div><strong>{task.title}</strong><small>{task.category} · {task.duration_minutes} মিনিট · {task.priority === 'high' ? 'উচ্চ অগ্রাধিকার' : task.priority === 'low' ? 'নিম্ন অগ্রাধিকার' : 'মাঝারি অগ্রাধিকার'}</small></div><span className="phase4-countdown">{snapshot.remainingSeconds > 0 ? `বাকি ${formatClockSeconds(snapshot.remainingSeconds)}` : 'সময় শুরু'}</span></article>
}
