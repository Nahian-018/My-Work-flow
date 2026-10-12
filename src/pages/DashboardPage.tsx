import { Activity, ArrowRight, BellRing, CalendarClock, Clock3, ListChecks, MessageCircle, Plus, Sparkles, Timer, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DemoTask } from '../demo-data'
import { localize } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { DemoTag, PageHeader } from '../components/PageHeader'
import { useCopy } from '../components/useCopy'

export default function DashboardPage({ onQuickTask }: { onQuickTask: () => void }) {
  const t = useCopy()
  const { language, tasks, activities, unreadCount } = usePreview()
  const completed = tasks.filter((task) => task.status === 'completed').length
  const overdue = tasks.filter((task) => task.status === 'overdue').length
  const pending = tasks.length - completed
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  const plannedMinutes = tasks.reduce((total, task) => total + task.durationMinutes, 0)
  const actualMinutes = tasks.reduce((total, task) => total + (task.actualMinutes ?? 0), 0)
  const upcomingTasks = [...tasks].filter((task) => task.status !== 'completed').sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 3)
  const quickTasks = [...tasks].filter((task) => task.status !== 'completed').slice(0, 3)
  const number = (value: number) => value.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')
  const formatTime = (minutes: number) => language === 'bn'
    ? `${Math.floor(minutes / 60).toLocaleString('bn-BD')}ঘ ${Number(minutes % 60).toLocaleString('bn-BD', { minimumIntegerDigits: 2 })}মি`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  const dhakaDate = new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  const metrics = [
    { label: t.dashboardTotal, value: tasks.length, hint: t.commonToday, className: 'metric-mint', icon: ListChecks },
    { label: t.dashboardCompleted, value: completed, hint: `${number(progress)}%`, className: 'metric-blue', icon: Sparkles },
    { label: t.dashboardPending, value: pending, hint: t.commonPending, className: 'metric-amber', icon: Clock3 },
    { label: t.dashboardOverdue, value: overdue, hint: language === 'bn' ? 'ডেমো অবস্থা' : 'Demo status', className: 'metric-rose', icon: BellRing },
  ]

  return <div className="page dashboard-page">
    <PageHeader eyebrow={t.dashboardEyebrow} title={t.dashboardTitle} description={t.dashboardSubtitle} icon={Sparkles} action={<button type="button" className="button button-primary" onClick={onQuickTask}><Plus size={16} />{t.quickTask}</button>} />

    <section className="dashboard-date-strip"><span className="date-strip-icon"><CalendarClock size={18} /></span><span><small>{t.todayDate}</small><strong>{dhakaDate}</strong></span><DemoTag>{t.demoData}</DemoTag></section>

    <section className="metric-grid metric-grid-phase2" aria-label={t.dashboardProgress}>
      {metrics.map(({ label, value, hint, className, icon: Icon }) => <article className="metric-card metric-card-phase2" key={label}>
        <div className="metric-card-top"><span className={`metric-icon ${className}`}><Icon size={17} /></span><DemoTag>{t.demoData}</DemoTag></div>
        <strong className="metric-value">{number(value)}</strong><div className="metric-bottom"><span>{label}</span><small>{hint}</small></div>
      </article>)}
    </section>

    <section className="dashboard-grid dashboard-grid-phase2">
      <article className="panel progress-panel">
        <div className="panel-heading"><div><span className="panel-kicker">{language === 'bn' ? 'TODAY AT A GLANCE' : 'TODAY AT A GLANCE'}</span><h2>{t.dashboardProgress}</h2></div><DemoTag>{t.demoData}</DemoTag></div>
        <div className="progress-content">
          <div className="progress-ring" role="img" aria-label={`${t.dashboardProgress}: ${number(progress)}%`}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="49" /><circle className="ring-value" cx="60" cy="60" r="49" style={{ strokeDasharray: `${Math.max(1, (progress / 100) * 308)} 308` }} /></svg>
            <span className="ring-label"><strong>{number(progress)}%</strong><small>{t.dashboardCompleted}</small></span>
          </div>
          <div className="progress-copy"><span className="mini-label"><Sparkles size={14} />{t.dashboardFocus}</span><h3>{language === 'bn' ? 'ধাপে ধাপে এগিয়ে যান' : 'Make steady progress'}</h3><p>{language === 'bn' ? 'কাজ সম্পন্ন চিহ্নিত করলে ডেমো অগ্রগতি এই পেজে বদলাবে।' : 'Mark a task complete to update the demo progress on this page.'}</p><Link className="text-link" to="/today">{t.dashboardTasksLink}<ArrowRight size={15} /></Link></div>
        </div>
        <div className="progress-footer"><span><span className="legend-dot legend-done" />{t.dashboardCompleted}<b>{number(completed)}</b></span><span><span className="legend-dot legend-pending" />{t.dashboardPending}<b>{number(pending)}</b></span><span className="timezone-note">Asia/Dhaka</span></div>
      </article>

      <article className="panel upcoming-panel"><div className="panel-heading"><div><span className="panel-kicker">ON YOUR RADAR</span><h2>{t.dashboardUpcoming}</h2></div><Link to="/schedule" className="panel-arrow" aria-label={`${t.commonOpen}: ${t.navSchedule}`}><ArrowRight size={16} /></Link></div>
        <div className="task-preview-list">{upcomingTasks.map((task) => <MiniTask key={task.id} task={task} />)}</div><div className="upcoming-bottom"><span className="tiny-live-dot" />{language === 'bn' ? 'নমুনা সময়সূচি · Timer চলছে না' : 'Sample schedule · timer is not running'}</div>
      </article>

      <article className="panel planned-panel dashboard-time-panel"><div className="panel-heading"><div><span className="panel-kicker">TIME OVERVIEW</span><h2>{t.dashboardPlannedActual}</h2></div><Timer size={17} className="panel-muted-icon" /></div>
        <div className="time-comparison"><div className="time-total"><span>{t.dashboardPlanned}</span><strong>{formatTime(plannedMinutes)}</strong></div><div className="time-total time-total-actual"><span>{t.dashboardActual}</span><strong>{formatTime(actualMinutes)}</strong></div></div>
        <div className="time-bar-label"><span>{language === 'bn' ? 'পরিকল্পিত সময়' : 'Planned time'}</span><span>{number(plannedMinutes ? Math.round((actualMinutes / plannedMinutes) * 100) : 0)}%</span></div><div className="time-bar-track"><span style={{ width: `${Math.min(100, plannedMinutes ? (actualMinutes / plannedMinutes) * 100 : 0)}%` }} /></div><p className="inline-demo-note">{t.commonDemoOnly} · {language === 'bn' ? 'বাস্তব সময় গণনা হচ্ছে না' : 'actual time is not being tracked'}</p>
      </article>

      <article className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">WORKSPACE PULSE</span><h2>{t.dashboardActivity}</h2></div><Link to="/history" className="panel-arrow" aria-label={`${t.commonOpen}: ${t.navHistory}`}><ArrowRight size={16} /></Link></div>
        <div className="activity-list">{activities.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span className={`activity-avatar activity-${item.type}`}>{item.actor === 'Admin' ? 'A' : 'M'}</span><div className="activity-copy"><strong>{item.actor} <span>{item.action[language]}</span></strong><small>{item.target[language]}</small></div><time>{item.time[language]}</time></div>)}</div><div className="activity-footer"><Activity size={13} />{t.demoData}</div>
      </article>

      <article className="panel quick-access-panel"><div className="panel-heading"><div><span className="panel-kicker">PC QUICK ACCESS</span><h2>{t.dashboardQuickAccess}</h2></div><span className="quick-access-count">{number(quickTasks.length)}</span></div>
        <div className="quick-checklist">{quickTasks.map((task) => <QuickTask key={task.id} task={task} />)}</div><div className="quick-access-actions"><button type="button" className="button button-secondary button-small" onClick={onQuickTask}><Plus size={14} />{t.quickTask}</button><Link className="text-link" to="/today">{t.commonOpen}<ArrowRight size={14} /></Link></div>
      </article>

      <article className="panel unread-panel"><div className="unread-icon"><MessageCircle size={19} /></div><div className="unread-copy"><span className="panel-kicker">LIVE CHAT</span><h2>{t.dashboardUnread}</h2><p>{language === 'bn' ? 'নমুনা কথোপকথনে' : 'In the sample conversation'} <strong>{number(unreadCount)}</strong> {language === 'bn' ? 'টি অপঠিত বার্তা' : 'unread messages'}</p></div><Link to="/chat" className="unread-open" aria-label={`${t.commonOpen}: ${t.navChat}`}><ArrowRight size={16} /></Link><DemoTag>{t.demoData}</DemoTag></article>
    </section>

    <section className="duo-banner"><div className="duo-banner-pattern" aria-hidden="true"><span /><span /><span /><span /></div><div className="duo-banner-copy"><span className="duo-banner-label"><UsersRound size={15} />SHARED WORKSPACE · 2 MEMBERS</span><h2>{language === 'bn' ? 'একজন আপডেট করলে, দুজনেই থাকবেন আপ-টু-ডেট।' : 'One update keeps both members in sync.'}</h2><p>{language === 'bn' ? 'এই পেজের নমুনা পরিবর্তন এখনো অন্য ব্যবহারকারীর সঙ্গে Sync হয় না।' : 'Sample changes on this page do not sync to another member.'}</p></div><div className="duo-illustration" aria-hidden="true"><div className="duo-orbit orbit-one" /><div className="duo-orbit orbit-two" /><span className="duo-avatar avatar-admin">A</span><span className="duo-avatar avatar-member">M</span><span className="duo-link-icon">↔</span></div></section>
  </div>
}

function MiniTask({ task }: { task: DemoTask }) {
  const { language } = usePreview()
  return <div className="mini-task-row"><span className="mini-task-time">{task.startTime}</span><span className={`mini-task-dot mini-task-${task.status}`} /><span className="mini-task-title">{localize(task.title, language)}</span><span className={`priority-mini priority-${task.priority}`} /></div>
}

function QuickTask({ task }: { task: DemoTask }) {
  const { language, setTasks, notify } = usePreview()
  const t = useCopy()
  const complete = task.status === 'completed'
  return <button className="quick-check-row" type="button" onClick={() => { setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: complete ? 'pending' : 'completed' } : item)); notify(t.toastTaskDone, 'info') }}><span className={`quick-check ${complete ? 'quick-check-done' : ''}`}>{complete && '✓'}</span><span className={complete ? 'quick-check-complete' : ''}>{localize(task.title, language)}</span><span className="quick-check-time">{task.startTime}</span></button>
}
