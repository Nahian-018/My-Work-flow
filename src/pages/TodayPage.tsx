import { CalendarCheck2, CheckCheck, Clock3, Plus, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { TaskRow } from '../components/TaskRow'
import { QuickTaskForm } from '../components/QuickTaskForm'
import { EmptyState } from '../components/EmptyState'
import { useCopy } from '../components/useCopy'

export default function TodayPage() {
  const t = useCopy()
  const { language, tasks } = usePreview()
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all')
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const visibleTasks = useMemo(() => tasks.filter((task) => filter === 'all' || (filter === 'completed' ? task.status === 'completed' : task.status !== 'completed')), [filter, tasks])
  const complete = tasks.filter((task) => task.status === 'completed').length
  const progress = tasks.length ? Math.round((complete / tasks.length) * 100) : 0

  return <div className="page today-page">
    <PageHeader eyebrow={language === 'bn' ? 'প্রতিদিনের পরিকল্পনা' : 'DAILY CHECKLIST'} title={t.todayTitle} description={t.todaySubtitle} icon={CalendarCheck2} action={<button type="button" className="button button-primary" onClick={() => setQuickTaskOpen(true)}><Plus size={16} />{t.quickTask}</button>} />
    <div className="page-demo-strip"><span><Sparkles size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'Daily reset ও পুরোনো record সংরক্ষণ এখনো চালু নয়।' : 'Daily reset and persistent history are not active yet.'}</span></span><DemoTag /></div>

    <section className="today-summary-grid"><article className="today-progress-card"><div className="today-progress-ring" style={{ background: `conic-gradient(#168578 ${progress}%, #e6f0eb ${progress}% 100%)` }}><span><strong>{progress}%</strong><small>{t.dashboardCompleted}</small></span></div><div><span className="panel-kicker">{t.dashboardProgress.toUpperCase()}</span><h2>{complete} / {tasks.length} {t.listTasks}</h2><p>{language === 'bn' ? 'ডেমো Checklist-এ Checkbox বদলালে এই অগ্রগতি আপডেট হয়।' : 'Toggling demo checkboxes updates this progress.'}</p></div></article><div className="today-mini-stats"><div><Clock3 size={16} /><span>{t.dashboardPending}</span><strong>{tasks.length - complete}</strong></div><div><CheckCheck size={16} /><span>{t.dashboardCompleted}</span><strong>{complete}</strong></div></div></section>

    <section className="panel task-board-panel"><div className="task-board-header"><div><span className="panel-kicker">ASIA/DHAKA · {t.commonToday.toUpperCase()}</span><h2>{language === 'bn' ? 'আজকের Checklist' : "Today's checklist"}</h2></div><div className="today-filter-tabs" role="group" aria-label={t.taskStatus}>{[['all', t.todayAll], ['open', t.todayOpen], ['completed', t.todayCompleted]].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value as 'all' | 'open' | 'completed')}>{label}</button>)}</div></div>
      <div className="task-board-list">{visibleTasks.map((task) => <TaskRow key={task.id} task={task} />)}</div>
      {!visibleTasks.length && <EmptyState icon={CheckCheck} title={language === 'bn' ? 'এই ফিল্টারে কাজ নেই' : 'No tasks in this filter'} description={language === 'bn' ? 'অন্য ফিল্টার বেছে নিন অথবা একটি ডেমো কাজ যোগ করুন।' : 'Choose another filter or add a demo task.'} action={<button type="button" className="button button-secondary" onClick={() => setQuickTaskOpen(true)}><Plus size={15} />{t.addTask}</button>} />}
      <div className="task-board-footer"><span><span className="legend-dot legend-done" />{t.dashboardCompleted}: <b>{complete}</b></span><span><span className="legend-dot legend-pending" />{t.dashboardPending}: <b>{tasks.length - complete}</b></span><Link to="/lists">{t.navLists} <span>→</span></Link></div>
    </section>
    {quickTaskOpen && <QuickTaskForm onClose={() => setQuickTaskOpen(false)} />}
  </div>
}
