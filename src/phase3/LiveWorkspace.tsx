import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import {
  Activity, AlertTriangle, Archive, BarChart3, Bell, Bookmark, CalendarClock, Check, CheckCircle2, Circle, Clock3,
  Cloud, CloudOff, History, LogOut, MessageCircle, Pause, Pencil, Play, Plus, RefreshCw, Save, Settings2,
  ShieldCheck, Trash2, Wifi, WifiOff, X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { dhakaDateKey, formatClockSeconds, getTaskClockSnapshot } from '../domain/task-time'
import { newOperationId } from '../lib/task-service'
import type { LiveTask, TaskDraft } from '../lib/task-service'
import { LiveTaskProvider, useLiveTasks } from './LiveTaskProvider'
import { LiveNotificationProvider, useLiveNotifications } from './LiveNotificationProvider'
import type { PreferenceKey } from './LiveNotificationProvider'
import { WorkspaceCollaborationProvider, useWorkspaceCollaboration } from '../phase4/WorkspaceCollaborationProvider'
import { LiveDashboardPage } from '../phase4/LiveDashboardPage'
import { LiveChatPage } from '../phase4/LiveChatPage'
import { LiveNotesPage } from '../phase4/LiveNotesPage'
import { LiveReportsPage } from '../phase4/LiveReportsPage'
import { LiveBackupPage } from '../phase4/LiveBackupPage'

const banglaDate = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' })
const banglaTime = new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit' })
const englishDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short' })

export function LiveWorkspace() {
  const { user, membership } = useAuth()
  const accountKey = `${user?.id ?? 'signed-out'}:${membership?.workspace_id ?? 'no-workspace'}`
  return <LiveTaskProvider key={accountKey}><LiveNotificationProvider key={accountKey}><WorkspaceCollaborationProvider key={accountKey}><LiveWorkspaceShell /></WorkspaceCollaborationProvider></LiveNotificationProvider></LiveTaskProvider>
}

function LiveWorkspaceShell() {
  const { user, profile, membership, membershipVerification, error: authError, signOut } = useAuth()
  const { state, online, realtimeConnected, error, cacheWarning, pendingOperations, refresh, dismissError } = useLiveTasks()
  const { chatUnreadCount, chatPendingCount, notePendingCount } = useWorkspaceCollaboration()
  const [loggingOut, setLoggingOut] = useState(false)
  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email || 'SmartFlow member'

  const handleLogout = async () => {
    const totalQueued = pendingOperations.length + chatPendingCount + notePendingCount
    const queuedWarning = totalQueued
      ? ` ${totalQueued}টি sync না-হওয়া task/chat/note change একই account আবার login করলে sync-এর চেষ্টা হবে।`
      : ''
    const localDataWarning = ' Logout হলেও এই browser-এর cached task/notification data IndexedDB-তে থাকবে; public বা shared device হলে পরে browser site data clear করুন।'
    if (!window.confirm(`Logout করবেন?${queuedWarning}${localDataWarning}`)) return
    setLoggingOut(true)
    try { await signOut() } finally { setLoggingOut(false) }
  }

  return <div className="live-app">
    <header className="live-topbar">
      <Link className="live-brand" to="/" aria-label="SmartFlow Duo live workspace">
        <span className="live-brand-mark">SF</span>
        <span><strong>SmartFlow <b>Duo</b></strong><small>PRIVATE WORKSPACE</small></span>
      </Link>
      <div className="live-account-area">
        <span className={`live-connection ${online ? 'is-online' : 'is-offline'}`} role="status">
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {state === 'loading' ? 'সংযোগ হচ্ছে' : !online ? 'Offline' : state === 'connected' ? 'Cloud connected' : state === 'syncing' ? 'Syncing' : 'Cloud error'}
        </span>
        <button className="live-icon-button" onClick={() => void refresh()} aria-label="Cloud data refresh" title="Refresh"><RefreshCw size={17} /></button>
        <NotificationQuickButton />
        <Link className="live-icon-button" to="/settings" aria-label="Notification settings" title="Settings"><Settings2 size={17} /></Link>
        <span className="live-avatar" aria-hidden="true">{displayName.trim().charAt(0).toUpperCase() || 'S'}</span>
        <span className="live-user-copy"><strong>{displayName}</strong><small>{membership?.member_role === 'admin' ? 'Admin' : 'Member'}</small></span>
        <button className="live-icon-button" onClick={() => void handleLogout()} disabled={loggingOut} aria-label="Logout" title="Logout"><LogOut size={17} /></button>
      </div>
    </header>

    <div className="live-nav-wrap">
      <nav className="live-nav" aria-label="Live workspace navigation">
        <NavLink end to="/" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><Activity size={16} />ড্যাশবোর্ড</NavLink>
        <NavLink to="/today" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><CalendarClock size={16} />আজকের কাজ</NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><Circle size={16} />সব সক্রিয়</NavLink>
        <NavLink to="/chat" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><MessageCircle size={16} />Chat{chatUnreadCount > 0 && <span className="live-nav-count">{chatUnreadCount}</span>}</NavLink>
        <NavLink to="/notes" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><Bookmark size={16} />Notes{notePendingCount > 0 && <span className="live-nav-count">{notePendingCount}</span>}</NavLink>
        <NavLink to="/reports" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><BarChart3 size={16} />রিপোর্ট</NavLink>
        <NavLink to="/backup" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><Archive size={16} />Backup</NavLink>
        <NavLink to="/history" aria-label="Activity history" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><History size={16} />History</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `live-nav-link ${isActive ? 'active' : ''}`}><Settings2 size={16} />Settings</NavLink>
      </nav>
      <span className="live-private-pill"><ShieldCheck size={14} />RLS protected · {membership?.member_role ?? 'member'}</span>
    </div>

    <main className="live-main">
      {membershipVerification === 'cached' && <div className="live-banner live-banner-warning" role="status"><ShieldCheck size={16} /><span>{authError || 'Offline: শেষ সফল membership verification ব্যবহার করা হচ্ছে; online হলে backend permission পুনরায় যাচাই হবে।'}</span></div>}
      {state === 'offline' && <div className="live-banner live-banner-warning" role="status"><CloudOff size={16} /><span>{error || 'Offline view: synced cache ব্যবহার হচ্ছে।'}</span></div>}
      {error && state !== 'offline' && <div className="live-banner live-banner-error" role="alert"><AlertTriangle size={16} /><span>{error}</span><button onClick={dismissError} aria-label="Dismiss error"><X size={15} /></button></div>}
      {cacheWarning && <div className="live-banner live-banner-warning" role="status"><Cloud size={16} /><span>{cacheWarning}</span></div>}
      {pendingOperations.length > 0 && <section className="live-queue-summary" aria-label="Pending task status changes">
        <div><CloudOff size={17} /><span><strong>{pendingOperations.length}টি task status change sync-এর অপেক্ষায়</strong><small>এগুলো শুধু এই browser-এর IndexedDB-তে আছে; অন্য device-এ এখনো নেই।</small></span></div>
        {pendingOperations.some((operation) => operation.state === 'conflict') && <span className="live-conflict-chip">Task conflict review দরকার</span>}
      </section>}
      {(chatPendingCount + notePendingCount) > 0 && <section className="live-queue-summary" aria-label="Pending chat and notes changes">
        <div><CloudOff size={17} /><span><strong>{chatPendingCount + notePendingCount}টি chat/note/read change sync-এর অপেক্ষায়</strong><small>IndexedDB local queue; internet ফিরলে RPC retry হবে, ততক্ষণ অন্য device-এ পাঠানো হয়নি।</small></span></div>
      </section>}
      <Routes>
        <Route path="/" element={<LiveDashboardPage />} />
        <Route path="/today" element={<LiveTaskPage view="today" />} />
        <Route path="/tasks" element={<LiveTaskPage view="active" />} />
        <Route path="/chat" element={<LiveChatPage />} />
        <Route path="/notes" element={<LiveNotesPage />} />
        <Route path="/reports" element={<LiveReportsPage />} />
        <Route path="/backup" element={<LiveBackupPage />} />
        <Route path="/history" element={<LiveActivityHistory />} />
        <Route path="/settings" element={<LiveSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="live-footer">
        <span>Asia/Dhaka calendar · server timestamps are authoritative</span>
        <span>{online ? realtimeConnected ? 'Realtime subscribed' : 'Cloud read/write · Realtime reconnecting' : 'Offline cache · not a cloud backup'}</span>
      </footer>
    </main>
  </div>
}

function NotificationQuickButton() {
  const { permission } = useLiveNotifications()
  return <Link className={`live-icon-button ${permission === 'granted' ? 'live-bell-enabled' : ''}`} to="/settings" aria-label={`Notification settings · ${permission}`} title={`Notifications: ${permission}`}><Bell size={17} /></Link>
}

function LiveTaskPage({ view }: { view: 'today' | 'active' }) {
  const { tasks, state, pendingOperations, refresh } = useLiveTasks()
  const [searchParams] = useSearchParams()
  const focusTask = searchParams.get('focus')
  const [editorTask, setEditorTask] = useState<LiveTask | null | 'new'>(null)
  const today = dhakaDateKey()
  const visibleTasks = useMemo(() => tasks.filter((task) => view === 'today'
    ? task.planned_date === today
    : task.status !== 'completed'), [tasks, today, view])
  const doneCount = visibleTasks.filter((task) => task.status === 'completed').length
  const activeCount = visibleTasks.filter((task) => task.status !== 'completed').length
  useEffect(() => {
    if (!focusTask || !visibleTasks.some((task) => task.id === focusTask)) return
    window.setTimeout(() => document.getElementById(`live-task-${focusTask}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }, [focusTask, visibleTasks])

  return <section className="live-page">
    <div className="live-page-heading">
      <div>
        <p className="live-eyebrow">{view === 'today' ? 'TODAY · ASIA/DHAKA' : 'TASK WORKSPACE · CLOUD DATA'}</p>
        <h1>{view === 'today' ? 'আজকের কাজ' : 'সক্রিয় কাজ'}</h1>
        <p className="live-subtitle">{banglaDate.format(new Date(`${today}T12:00:00+06:00`))} <span>·</span> {activeCount}টি চলমান <span>·</span> {doneCount}টি সম্পন্ন</p>
      </div>
      <button className="live-button live-button-primary" onClick={() => setEditorTask('new')} disabled={!navigator.onLine}><Plus size={17} />নতুন কাজ</button>
    </div>

    {view === 'today' && <div className="live-info-card"><Activity size={18} /><p><strong>Live workspace</strong><span>এই view শুধু Supabase-এ থাকা task দেখায়। Demo sample data এখানে মেশানো হয় না।</span></p><span className="live-info-date">{englishDate.format(new Date(`${today}T12:00:00+06:00`))}</span></div>}

    {pendingOperations.filter((operation) => operation.state === 'conflict').map((operation) => <ConflictCard key={operation.operationId} operation={operation} />)}

    {state === 'loading' && tasks.length === 0 ? <div className="live-empty"><span className="live-spinner" /><p>Supabase task load হচ্ছে…</p></div> : visibleTasks.length === 0 ? <div className="live-empty-card">
      <span className="live-empty-icon"><CheckCircle2 size={23} /></span>
      <h2>{view === 'today' ? 'আজকের task list ফাঁকা' : 'সক্রিয় task নেই'}</h2>
      <p>{view === 'today' ? 'আজকের জন্য নতুন কাজ তৈরি করুন, অথবা recurring daily template যোগ করুন।' : 'আজ ও পরবর্তী ১৪ দিনের মধ্যে কোনো সক্রিয় task নেই।'}</p>
      {view === 'today' && <button className="live-button live-button-primary" onClick={() => setEditorTask('new')} disabled={!navigator.onLine}><Plus size={16} />প্রথম কাজ যোগ করুন</button>}
      {state === 'error' && <button className="live-button live-button-secondary" onClick={() => void refresh()}><RefreshCw size={15} />আবার লোড করুন</button>}
    </div> : <div className="live-task-list" aria-label={view === 'today' ? 'Today tasks' : 'Active tasks'}>
      {visibleTasks.map((task) => <LiveTaskCard key={task.id} task={task} onEdit={() => setEditorTask(task)} />)}
    </div>}

    {editorTask !== null && <TaskEditor key={editorTask === 'new' ? 'new-task' : editorTask.id} task={editorTask === 'new' ? null : editorTask} onClose={() => setEditorTask(null)} />}
  </section>
}

function LiveTaskCard({ task, onEdit }: { task: LiveTask; onEdit: () => void }) {
  const { setTaskStatus, startTimer, pauseTimer, resumeTimer, deleteTask, online } = useLiveTasks()
  const [now, setNow] = useState(() => new Date())
  const [deleting, setDeleting] = useState(false)
  const [deleteOperationId] = useState(() => newOperationId())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const clock = getTaskClockSnapshot({
    plannedStartAt: task.planned_start_at,
    expectedDurationMinutes: task.duration_minutes,
    status: task.status,
    actualStartedAt: task.actual_started_at,
    accumulatedSeconds: task.accumulated_seconds,
    runningSince: task.running_since,
  }, now)
  const effectiveStatus = task.status === 'completed' ? 'completed'
    : task.status === 'overdue' || clock.effectiveStatus === 'overdue' ? 'overdue'
      : task.status
  const timerRunning = Boolean(task.running_since) && task.status !== 'completed'
  const timerStarted = Boolean(task.actual_started_at)
  const statusLabel = effectiveStatus === 'completed' ? 'সম্পন্ন' : effectiveStatus === 'overdue' ? 'সময় পেরিয়েছে' : effectiveStatus === 'in_progress' ? timerRunning ? 'টাইমার চলছে' : 'বিরতিতে' : 'অপেক্ষমাণ'
  const clockLabel = clock.overdueSeconds > 0 ? `ওভারটাইম ${formatClockSeconds(clock.overdueSeconds)}` : `বাকি ${formatClockSeconds(clock.remainingSeconds)}`

  const safeAction = async (action: () => Promise<void>) => { try { await action() } catch { /* provider renders the safe error state */ } }
  const toggleTimer = () => timerRunning
    ? safeAction(() => pauseTimer(task.id))
    : timerStarted ? safeAction(() => resumeTimer(task.id)) : safeAction(() => startTimer(task.id))
  const complete = () => safeAction(() => setTaskStatus(task, 'completed'))
  const reopen = () => safeAction(() => setTaskStatus(task, 'pending'))
  const handleDelete = async () => {
    if (!window.confirm(`“${task.title}” মুছে ফেলবেন? এটি soft-delete হবে; activity history-তে রেকর্ড থাকবে।`)) return
    setDeleting(true)
    await safeAction(() => deleteTask(task, deleteOperationId))
    setDeleting(false)
  }
  const time = banglaTime.format(new Date(task.planned_start_at))
  const date = banglaDate.format(new Date(`${task.planned_date}T12:00:00+06:00`))

  return <article id={`live-task-${task.id}`} tabIndex={-1} className={`live-task-card ${effectiveStatus === 'completed' ? 'task-completed' : ''}`}>
    <div className={`live-task-status-mark status-${effectiveStatus}`} aria-hidden="true">{effectiveStatus === 'completed' ? <Check size={17} /> : effectiveStatus === 'overdue' ? <AlertTriangle size={16} /> : effectiveStatus === 'in_progress' ? <Play size={14} /> : <Circle size={14} />}</div>
    <div className="live-task-content">
      <div className="live-task-title-line"><h2>{task.title}</h2><span className={`live-task-state-pill state-${effectiveStatus}`}>{statusLabel}</span></div>
      {task.description && <p className="live-task-description">{task.description}</p>}
      <div className="live-task-meta">
        <span><CalendarClock size={14} />{date} · শুরু {time}</span>
        <span><Clock3 size={14} />শেষ {banglaTime.format(new Date(task.planned_end_at))} · {task.duration_minutes} মিনিট</span>
        <span className={`live-task-countdown ${clock.overdueSeconds > 0 ? 'countdown-overdue' : ''}`}>{clockLabel}</span>
        <span className="live-task-tag">{task.category || 'work'}</span>
        <span className={`live-priority priority-${task.priority}`}>{task.priority === 'high' ? 'উচ্চ' : task.priority === 'low' ? 'নিম্ন' : 'মাঝারি'}</span>
        {task.template_id && <span className="live-recurring-tag">প্রতিদিন</span>}
        {task.reminder_at && <span className="live-reminder-tag"><Bell size={12} />{task.reminder_minutes === null ? 'স্মারক' : `${task.reminder_minutes} মিনিট আগে`}</span>}
      </div>
      <p className="live-task-timing">{timerStarted ? `শুরু: ${banglaTime.format(new Date(task.actual_started_at!))}` : 'এখনো শুরু হয়নি'}{task.actual_completed_at ? ` · শেষ: ${banglaTime.format(new Date(task.actual_completed_at))}` : ''}{task.schedule_delta_seconds !== null && task.schedule_delta_seconds !== undefined ? ` · সময় পার্থক্য: ${Math.round(task.schedule_delta_seconds / 60)} মিনিট` : ''}</p>
    </div>
    <div className="live-task-actions">
      {task.status !== 'completed' ? <>
        <button className={`live-task-action ${timerRunning ? 'action-pause' : 'action-start'}`} onClick={() => void toggleTimer()} disabled={!online} aria-label={timerRunning ? 'Pause task timer' : timerStarted ? 'Resume task timer' : 'Start task timer'} title={timerRunning ? 'Pause timer' : timerStarted ? 'Resume timer' : 'Start timer'}>{timerRunning ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="live-task-action action-complete" onClick={() => void complete()} aria-label="Complete task" title="Complete task"><Check size={16} /></button>
        <button className="live-task-action" onClick={onEdit} disabled={!online} aria-label="Edit task" title="Edit task"><Pencil size={15} /></button>
        <button className="live-task-action action-delete" onClick={() => void handleDelete()} disabled={!online || deleting} aria-label="Delete task" title="Delete task"><Trash2 size={15} /></button>
      </> : <>
        <button className="live-task-action" onClick={() => void reopen()} aria-label="Reopen task" title="Reopen task"><RefreshCw size={15} /></button>
        <button className="live-task-action" onClick={onEdit} disabled={!online} aria-label="Edit task" title="Edit task"><Pencil size={15} /></button>
      </>}
    </div>
  </article>
}

function TaskEditor({ task, onClose }: { task: LiveTask | null; onClose: () => void }) {
  const { createTask, updateTask, stopRecurrence, online } = useLiveTasks()
  const [busy, setBusy] = useState(false)
  const [stoppingRecurrence, setStoppingRecurrence] = useState(false)
  const [recurrenceStopped, setRecurrenceStopped] = useState(false)
  const [formError, setFormError] = useState('')
  const [operationId] = useState(() => newOperationId())
  const [recurrenceOperationId] = useState(() => newOperationId())
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    if (!draft.title.trim()) { setFormError('কাজের নাম আবশ্যক।'); return }
    if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 1440) { setFormError('সময়কাল ১ থেকে ১৪৪০ মিনিটের মধ্যে পূর্ণ সংখ্যা হতে হবে।'); return }
    if (draft.reminderMinutes !== null && (!Number.isInteger(draft.reminderMinutes) || draft.reminderMinutes < 0 || draft.reminderMinutes > 10080)) { setFormError('Reminder ০ থেকে ১০০৮০ মিনিটের মধ্যে দিন।'); return }
    setBusy(true)
    try {
      if (task) await updateTask(task, draft, operationId)
      else await createTask(draft, operationId)
      onClose()
    } catch {
      setFormError('Save হয়নি। Error banner দেখুন; form-এর তথ্য রয়ে গেছে।')
    } finally { setBusy(false) }
  }
  const stopFutureRepeats = async () => {
    if (!task || !task.template_id || !window.confirm('এই daily template বন্ধ করবেন? আজকের occurrence থাকবে; পরবর্তী তারিখে তৈরি হওয়া pending occurrence-গুলো soft-delete হবে এবং history-তে থাকবে।')) return
    setStoppingRecurrence(true)
    setFormError('')
    try {
      await stopRecurrence(task, recurrenceOperationId)
      setRecurrenceStopped(true)
    } catch {
      setFormError('পুনরাবৃত্তি বন্ধ হয়নি। একই operation ID দিয়ে আবার চেষ্টা করুন; server response হারালেও duplicate action হবে না।')
    } finally { setStoppingRecurrence(false) }
  }

  return <div className="live-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="live-modal-card" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
      <header className="live-modal-heading"><div><p className="live-eyebrow">{task ? 'TASK EDITOR' : 'NEW TASK'}</p><h2 id="task-editor-title">{task ? 'কাজ সম্পাদনা' : 'নতুন কাজ তৈরি'}</h2></div><button className="live-icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button></header>
      <form className="live-task-form" onSubmit={(event) => void submit(event)}>
        <label className="live-field live-field-wide">কাজের নাম<input value={draft.title} maxLength={200} autoFocus required onChange={(event) => update('title', event.target.value)} placeholder="যেমন: রিপোর্ট প্রস্তুত করা" /></label>
        <label className="live-field live-field-wide">বিবরণ<textarea value={draft.description} maxLength={4000} rows={3} onChange={(event) => update('description', event.target.value)} placeholder="কাজের বিস্তারিত (ঐচ্ছিক)" /></label>
        <label className="live-field">ক্যাটাগরি<input value={draft.category} maxLength={80} list="live-categories" onChange={(event) => update('category', event.target.value)} /><datalist id="live-categories"><option value="work" /><option value="study" /><option value="personal" /><option value="health" /><option value="family" /></datalist></label>
        <label className="live-field">অগ্রাধিকার<select value={draft.priority} onChange={(event) => update('priority', event.target.value as TaskDraft['priority'])}><option value="low">নিম্ন</option><option value="medium">মাঝারি</option><option value="high">উচ্চ</option></select></label>
        <label className="live-field">তারিখ (Dhaka)<input type="date" value={draft.plannedDate} required onChange={(event) => update('plannedDate', event.target.value)} /></label>
        <label className="live-field">শুরুর সময়<input type="time" value={draft.startTime} required onChange={(event) => update('startTime', event.target.value)} /></label>
        <label className="live-field">সময়কাল (মিনিট)<input type="number" min={1} max={1440} step={1} value={draft.durationMinutes} required onChange={(event) => update('durationMinutes', Number(event.target.value))} /></label>
        <label className="live-field">আগাম reminder (মিনিট)<input type="number" min={0} max={10080} step={1} value={draft.reminderMinutes ?? ''} placeholder="বন্ধ রাখতে ফাঁকা" onChange={(event) => update('reminderMinutes', event.target.value === '' ? null : Number(event.target.value))} /></label>
        {!task && <label className="live-checkbox-field"><input type="checkbox" checked={draft.recurringDaily} onChange={(event) => update('recurringDaily', event.target.checked)} /><span><strong>প্রতিদিন পুনরাবৃত্তি</strong><small>একটি daily template তৈরি হবে; occurrence generation idempotent।</small></span></label>}
        {task?.template_id && <div className="live-template-note"><RefreshCw size={15} /><span>এই edit শুধু বর্তমান দিনের occurrence-এ প্রযোজ্য; template ও ভবিষ্যৎ occurrence অপরিবর্তিত থাকবে।</span><button type="button" className="live-button live-button-danger" onClick={() => void stopFutureRepeats()} disabled={!online || busy || stoppingRecurrence || recurrenceStopped}>{recurrenceStopped ? 'পুনরাবৃত্তি বন্ধ' : stoppingRecurrence ? 'বন্ধ হচ্ছে…' : 'Future repeats বন্ধ করুন'}</button></div>}
        {formError && <div className="live-inline-error" role="alert">{formError}</div>}
        <footer className="live-form-actions"><button type="button" className="live-button live-button-secondary" onClick={onClose} disabled={busy}>বাতিল</button><button type="submit" className="live-button live-button-primary" disabled={busy || !online}>{busy ? <span className="live-spinner small-spinner" /> : <Save size={15} />}{busy ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button></footer>
      </form>
    </section>
  </div>
}

function toDraft(task: LiveTask | null): TaskDraft {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? 'work',
    priority: task?.priority ?? 'medium',
    plannedDate: task?.planned_date ?? dhakaDateKey(),
    startTime: task?.scheduled_start_time?.slice(0, 5) ?? '09:00',
    durationMinutes: task?.duration_minutes ?? 30,
    reminderMinutes: task?.reminder_minutes ?? 10,
    recurringDaily: false,
  }
}

function ConflictCard({ operation }: { operation: ReturnType<typeof useLiveTasks>['pendingOperations'][number] }) {
  const { tasks, retryConflict, discardOperation, online } = useLiveTasks()
  const task = tasks.find((row) => row.id === operation.taskId)
  return <div className="live-conflict-card" role="alert">
    <AlertTriangle size={18} /><div><strong>{task?.title ?? 'একটি task'}-এর পরিবর্তনে conflict</strong><p>অন্য device/user-এ task version বদলেছে। Server-এর সর্বশেষ version পড়ে আপনার queued status change আবার প্রয়োগ বা বাতিল করুন।</p></div>
    <button className="live-button live-button-secondary" disabled={!online} onClick={() => void retryConflict(operation)}>সর্বশেষ version-এ retry</button>
    <button className="live-button live-button-danger" onClick={() => void discardOperation(operation)}>বাতিল</button>
  </div>
}

interface ActivityRow { id: string; event_type: string; details: Record<string, unknown>; created_at: string; task_instance_id: string | null; actor_id: string | null }
const activityLabels: Record<string, string> = {
  task_created: 'নতুন কাজ তৈরি', daily_task_generated: 'দৈনিক occurrence তৈরি', task_updated: 'কাজ সম্পাদনা', task_deleted: 'কাজ soft-delete', daily_template_stopped: 'দৈনিক পুনরাবৃত্তি বন্ধ',
  timer_started: 'টাইমার শুরু', timer_paused: 'টাইমার বিরতি', timer_resumed: 'টাইমার আবার শুরু', task_completed: 'কাজ সম্পন্ন', completed: 'কাজ সম্পন্ন', reopened: 'কাজ আবার খোলা', started: 'টাইমার শুরু', paused: 'টাইমার বিরতি', resumed: 'টাইমার আবার শুরু', marked_overdue: 'সময় পেরিয়েছে', reset_pending: 'কাজ পুনরায় অপেক্ষমাণ',
}

function LiveActivityHistory() {
  const { client, membership, user } = useAuth()
  const { tasks } = useLiveTasks()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  useEffect(() => {
    let current = true
    const load = async () => {
      setLoading(true)
      const { data, error: queryError } = await client.from('activity_events').select('id,event_type,details,created_at,task_instance_id,actor_id').eq('workspace_id', membership?.workspace_id).order('created_at', { ascending: false }).limit(100)
      if (!current) return
      if (queryError) { setHistoryError(queryError.message); setLoading(false); return }
      const history = (data ?? []) as ActivityRow[]
      setRows(history)
      const ids = [...new Set(history.map((row) => row.task_instance_id).filter((id): id is string => Boolean(id)))]
      const taskNames: Record<string, string> = {}
      tasks.forEach((task) => { if (ids.includes(task.id)) taskNames[task.id] = task.title })
      const missingIds = ids.filter((id) => !taskNames[id])
      if (missingIds.length) {
        const { data: archived } = await client.from('task_instances').select('id,title').in('id', missingIds)
        for (const item of archived ?? []) taskNames[item.id] = item.title
      }
      if (current) { setTitles(taskNames); setLoading(false) }
    }
    void load()
    return () => { current = false }
  }, [client, membership?.workspace_id, tasks])

  return <section className="live-page">
    <div className="live-page-heading"><div><p className="live-eyebrow">AUDIT TRAIL · LAST 100 EVENTS</p><h1>Activity history</h1><p className="live-subtitle">{user?.email} · server timestamp · task status ও edit history</p></div></div>
    {historyError && <div className="live-inline-error" role="alert">History load হয়নি: {historyError}</div>}
    {loading ? <div className="live-empty"><span className="live-spinner" /><p>Activity history load হচ্ছে…</p></div> : rows.length === 0 ? <div className="live-empty-card"><span className="live-empty-icon"><History size={23} /></span><h2>এখনো কোনো activity নেই</h2><p>Task তৈরি, সম্পাদনা, timer এবং status পরিবর্তন এখানে সংরক্ষিত থাকবে।</p></div> : <div className="live-history-list">
      {rows.map((row) => <article className="live-history-row" key={row.id}><span className="live-history-icon"><Activity size={16} /></span><div><strong>{activityLabels[row.event_type] ?? row.event_type}</strong><p>{row.task_instance_id ? titles[row.task_instance_id] ?? 'সংরক্ষিত task record' : 'Workspace activity'}{row.actor_id === user?.id ? ' · আপনি' : ''}</p>{row.details && Object.keys(row.details).length > 0 && <small>{formatActivityDetails(row.details)}</small>}</div><time dateTime={row.created_at}>{banglaDate.format(new Date(row.created_at))} · {banglaTime.format(new Date(row.created_at))}</time></article>)}
    </div>}
  </section>
}

function formatActivityDetails(details: Record<string, unknown>): string {
  const items: string[] = []
  if (details.version) items.push(`version ${String(details.version)}`)
  if (details.segment_seconds) items.push(`${Math.round(Number(details.segment_seconds) / 60)} মিনিট timer`)
  if (details.action === 'soft_delete') items.push('রেকর্ডটি history-তে রাখা হয়েছে')
  if (details.preserved_in_history) items.push('History সংরক্ষিত')
  return items.join(' · ')
}

function LiveSettings() {
  const { user, membership, profile } = useAuth()
  const { online, state, realtimeConnected, pendingOperations, refresh } = useLiveTasks()
  const {
    preferences, preferenceState, preferenceError, permission,
    savePreference, requestPermission, reloadPreferences,
  } = useLiveNotifications()
  const [saved, setSaved] = useState(false)
  const [localError, setLocalError] = useState('')
  const save = async (key: PreferenceKey, value: boolean | string) => {
    setSaved(false)
    setLocalError('')
    try {
      await savePreference(key, value)
      setSaved(true)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Preference save হয়নি।')
    }
  }
  const permissionLabel = permission === 'granted' ? 'অনুমোদিত' : permission === 'denied' ? 'বন্ধ' : permission === 'unsupported' ? 'সমর্থিত নয়' : 'চাওয়া হয়নি'

  return <section className="live-page live-settings-page">
    <div className="live-page-heading"><div><p className="live-eyebrow">ACCOUNT · DELIVERY LIMITS</p><h1>Notifications & settings</h1><p className="live-subtitle">{profile?.display_name ?? user?.email} · {membership?.member_role}</p></div></div>
    {(preferenceError || localError) && <div className="live-inline-error" role="alert">Preference error: {localError || preferenceError}<button className="live-button live-button-secondary" onClick={() => void reloadPreferences()}>আবার লোড</button></div>}
    {saved && <p className="live-inline-success" role="status">Preference Supabase-এ সংরক্ষিত হয়েছে।</p>}
    {preferenceState === 'loading' && <div className="live-banner live-banner-warning" role="status"><span className="live-spinner small-spinner" />Notification preference load হচ্ছে…</div>}
    <div className="live-settings-grid">
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><Bell size={17} /></span><div><h2>Browser alert permission</h2><p>এই tab/page সক্রিয় থাকলে foreground reminder</p></div></div>
        <div className="live-setting-status"><span className={`permission-dot permission-${permission}`} />Permission: <strong>{permissionLabel}</strong></div>
        <button className="live-button live-button-secondary" onClick={() => void requestPermission()} disabled={permission === 'granted' || permission === 'denied' || permission === 'unsupported'}><Bell size={15} />{permission === 'denied' ? 'Browser site settings-এ অনুমতি দিন' : permission === 'granted' ? 'Notification permission চালু' : permission === 'unsupported' ? 'এই browser-এ নেই' : 'Notification permission দিন'}</button>
        <p className="live-settings-note">Upcoming, start, pre-start ও end alerts এই page খোলা অবস্থায় প্রতি ১৫ সেকেন্ডে পরীক্ষা হয়। Service Worker/Web Push server delivery চালু নয়; Browser timer background-এ throttle করতে পারে। Tab বন্ধ, Android force-stop, sleep বা permission বন্ধ থাকলে alert নিশ্চিত নয়। Permission চাওয়া হয় শুধু এই button চাপলে।</p>
      </article>
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><CalendarClock size={17} /></span><div><h2>Task reminder preferences</h2><p>আপনার account-এ Supabase-এ সংরক্ষিত</p></div></div>
        {preferences && <div className="live-pref-list">
          <PreferenceToggle label="আগাম reminder" detail="Task-এর reminder time-এ alert" checked={preferences.pre_start_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('pre_start_enabled', value)} />
          <PreferenceToggle label="আসন্ন task" detail="পরিকল্পিত শুরুর ১৫ মিনিট আগে" checked={preferences.upcoming_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('upcoming_enabled', value)} />
          <PreferenceToggle label="শুরুর সময়" detail="Planned start time পার হলে" checked={preferences.task_start_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('task_start_enabled', value)} />
          <PreferenceToggle label="সময় শেষ / overdue" detail="Planned end time পার হলে একবার" checked={preferences.overdue_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('overdue_enabled', value)} />
        </div>}
      </article>
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><Clock3 size={17} /></span><div><h2>Quiet hours</h2><p>Dhaka timezone · browser alert স্থগিত রাখে</p></div></div>
        {preferences && <>
          <PreferenceToggle label="Quiet hours চালু" detail="সময়ের মধ্যে foreground notification দেখাবে না" checked={preferences.quiet_hours_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('quiet_hours_enabled', value)} />
          <div className="live-time-preference"><label>শুরু<input type="time" value={preferences.quiet_hours_start.slice(0, 5)} disabled={!online || !preferences.quiet_hours_enabled} onChange={(event) => void save('quiet_hours_start', `${event.target.value}:00`)} /></label><label>শেষ<input type="time" value={preferences.quiet_hours_end.slice(0, 5)} disabled={!online || !preferences.quiet_hours_enabled} onChange={(event) => void save('quiet_hours_end', `${event.target.value}:00`)} /></label></div>
        </>}
        <p className="live-settings-note">Quiet hours-এ due notification পরের check window-এ আসতে পারে; missed alert-এর delivery guarantee নেই।</p>
      </article>
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><Activity size={17} /></span><div><h2>Daily summary preference</h2><p>Dhaka সময় · server outbox preference</p></div></div>
        {preferences && <>
          <PreferenceToggle label="Daily summary চালু" detail="Preference সংরক্ষিত হয়; delivery worker এখনো নেই" checked={preferences.daily_summary_enabled} disabled={!online || preferenceState !== 'ready'} onChange={(value) => void save('daily_summary_enabled', value)} />
          <label className="live-time-preference single-time">Summary time<input type="time" value={preferences.daily_summary_time.slice(0, 5)} disabled={!online || !preferences.daily_summary_enabled} onChange={(event) => void save('daily_summary_time', `${event.target.value}:00`)} /></label>
        </>}
        <p className="live-settings-note">Database outbox-এর row বাস্তবে notification পাঠায় না। Supabase Cron/Edge Function বা অন্য server worker owner setup ছাড়া কাজ করবে না।</p>
      </article>
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><Cloud size={17} /></span><div><h2>Cloud & offline sync</h2><p>Supabase session ও local device queue</p></div></div>
        <dl className="live-status-list"><div><dt>Cloud data</dt><dd>{state === 'connected' ? 'Connected' : state === 'offline' ? 'Offline cache' : state === 'loading' || state === 'syncing' ? 'Checking…' : 'Error'}</dd></div><div><dt>Browser network</dt><dd>{online ? 'Online' : 'Offline'}</dd></div><div><dt>Realtime</dt><dd>{realtimeConnected ? 'Subscribed' : 'Disconnected / reconnecting'}</dd></div><div><dt>Queued change</dt><dd>{pendingOperations.length}</dd></div></dl>
        <button className="live-button live-button-secondary" onClick={() => void refresh()}><RefreshCw size={15} />Cloud refresh</button>
        <p className="live-settings-note">Cached task হলো একই browser-এর read-only snapshot; cloud backup নয়। Offline-এ শুধু status change queue হয়। Conflict হলে reapply/discard সিদ্ধান্ত user নেন।</p>
      </article>
      <article className="live-settings-card">
        <div className="live-settings-card-title"><span className="live-settings-icon"><ShieldCheck size={17} /></span><div><h2>Security note</h2><p>Protected workspace access</p></div></div>
        <ul className="live-security-list"><li>Backend membership এবং RLS policy সব query-তে প্রযোজ্য।</li><li>Browser-এ শুধু publishable key; service-role secret নয়।</li><li>Google session Supabase SDK restore ও refresh করে।</li><li>অন্য device/tab-এ পরিবর্তন হলে Realtime বা refresh-এর পর version conflict দেখায়।</li></ul>
      </article>
    </div>
  </section>
}

function PreferenceToggle({ label, detail, checked, disabled, onChange }: { label: string; detail: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="live-pref-row"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>
}
