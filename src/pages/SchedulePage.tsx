import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, Info, Plus, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { TaskRow } from '../components/TaskRow'
import { TaskForm } from '../components/TaskForm'
import { Modal } from '../components/Modal'
import { useCopy } from '../components/useCopy'

function getExpectedEnd(startTime: string, durationMinutes: number) {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = (hours * 60 + minutes + durationMinutes) % (24 * 60)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

export default function SchedulePage() {
  const t = useCopy()
  const { language, tasks } = usePreview()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [dayOffset, setDayOffset] = useState(0)
  const [selectedWeekday, setSelectedWeekday] = useState(0)
  const [timerInfo, setTimerInfo] = useState(false)
  const [addTask, setAddTask] = useState(false)
  const date = new Date()
  date.setDate(date.getDate() + dayOffset + selectedWeekday)
  const dayLabel = new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  const weekdayDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const item = new Date()
    item.setDate(item.getDate() + dayOffset - ((item.getDay() + 6) % 7) + index)
    return { day: new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', weekday: 'short' }).format(item), date: item.getDate().toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US') }
  }), [dayOffset, language])
  const sortedTasks = [...tasks].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const dueSoon = sortedTasks.filter((task) => task.status !== 'completed').slice(0, 3)
  const runningDemoTask = tasks.find((task) => task.status === 'in-progress') ?? tasks.find((task) => task.countdown)

  return <div className="page schedule-page">
    <PageHeader eyebrow={language === 'bn' ? 'সময় ধরে এগোন' : 'PLAN YOUR TIME'} title={t.scheduleTitle} description={t.scheduleSubtitle} icon={CalendarClock} action={<button type="button" className="button button-primary" onClick={() => setAddTask(true)}><Plus size={16} />{t.addTask}</button>} />
    <div className="page-demo-strip"><span><Clock3 size={15} /><strong>{t.demoData}</strong><span>{t.scheduleTimerNotice}</span></span><DemoTag /></div>

    <div className="schedule-toolbar panel"><div className="schedule-date-controls"><button type="button" className="icon-button" aria-label={language === 'bn' ? 'আগের দিন' : 'Previous day'} onClick={() => setDayOffset((offset) => offset - (view === 'week' ? 7 : 1))}><ChevronLeft size={17} /></button><div><span className="panel-kicker">{t.todayDate.toUpperCase()}</span><strong>{dayLabel}</strong></div><button type="button" className="icon-button" aria-label={language === 'bn' ? 'পরের দিন' : 'Next day'} onClick={() => setDayOffset((offset) => offset + (view === 'week' ? 7 : 1))}><ChevronRight size={17} /></button><button type="button" className="button button-quiet button-small" onClick={() => { setDayOffset(0); setSelectedWeekday(0) }}>{t.commonToday}</button></div><div className="segmented-control" role="group" aria-label={t.scheduleTitle}><button type="button" className={view === 'day' ? 'active' : ''} aria-pressed={view === 'day'} onClick={() => setView('day')}>{t.scheduleDay}</button><button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>{t.scheduleWeek}</button></div></div>

    {view === 'week' && <div className="week-strip panel" role="group" aria-label={t.scheduleWeek}>{weekdayDates.map((item, index) => <button type="button" key={`${item.day}-${item.date}`} className={`week-day ${selectedWeekday === index ? 'week-day-active' : ''}`} aria-pressed={selectedWeekday === index} onClick={() => setSelectedWeekday(index)}><small>{item.day}</small><strong>{item.date}</strong><span className={index % 3 === 0 ? 'week-day-dot' : ''} /></button>)}</div>}

    <div className="schedule-layout"><section className="panel schedule-timeline-panel"><div className="panel-heading"><div><span className="panel-kicker">DAY PLAN · {dayLabel.toUpperCase()}</span><h2>{view === 'day' ? t.scheduleDay : t.scheduleWeek}</h2></div><DemoTag /></div><div className="timeline-list">{sortedTasks.map((task) => <div className="timeline-row" key={task.id}><div className="timeline-time"><strong>{task.startTime}</strong><span>{language === 'bn' ? `${task.durationMinutes} মিনিট` : `${task.durationMinutes} min`}</span></div><span className={`timeline-rail timeline-${task.status}`} /><div className="timeline-task"><TaskRow task={task} compact /><small className="timeline-expectation">{language === 'bn' ? `সম্ভাব্য শেষ ${getExpectedEnd(task.startTime, task.durationMinutes)} · পরিকল্পিত` : `Expected end ${getExpectedEnd(task.startTime, task.durationMinutes)} · planned`}</small></div></div>)}</div></section>
      <aside className="schedule-side-column"><article className="panel timer-demo-panel"><div className="panel-heading"><div><span className="panel-kicker">TIMER PREVIEW</span><h2>{language === 'bn' ? 'কাজের কাউন্টডাউন' : 'Task countdown'}</h2></div><span className="timer-demo-icon"><Timer size={18} /></span></div><div className="timer-display"><strong>{runningDemoTask?.countdown ?? '00:27:00'}</strong><span>{t.commonDemoOnly}</span></div><h3>{runningDemoTask ? runningDemoTask.title[language] : (language === 'bn' ? 'সাপ্তাহিক অগ্রাধিকার ঠিক করা' : 'Set weekly priorities')}</h3><div className="timer-remaining"><Clock3 size={14} />{language === 'bn' ? 'অবশিষ্ট সময়ের নমুনা' : 'Sample remaining time'}</div><button type="button" className="button button-secondary button-full" onClick={() => setTimerInfo(true)}><Info size={15} />{language === 'bn' ? 'Timer সীমাবদ্ধতা দেখুন' : 'About this timer preview'}</button></article>
      <article className="panel upcoming-side-panel"><div className="panel-heading"><div><span className="panel-kicker">NEXT UP</span><h2>{t.scheduleUpcoming}</h2></div><CalendarDays size={17} className="panel-muted-icon" /></div><div className="upcoming-side-list">{dueSoon.map((task) => <div className="upcoming-side-item" key={task.id}><span className="upcoming-side-time">{task.startTime}</span><span><strong>{task.title[language]}</strong><small>{task.durationMinutes} {t.commonMinutes} · {task.assignee}</small></span><span className={`priority-mini priority-${task.priority}`} /></div>)}</div><button type="button" className="text-button" onClick={() => setAddTask(true)}><Plus size={14} />{t.addTask}</button></article></aside>
    </div>
    {timerInfo && <Modal title={language === 'bn' ? 'Timer-এর সীমাবদ্ধতা' : 'Timer limitations'} onClose={() => setTimerInfo(false)}><div className="info-modal-copy"><span className="timer-demo-icon"><Timer size={20} /></span><p>{t.scheduleTimerNotice}</p><p>{language === 'bn' ? 'Refresh, sleep, pause/resume ও notification-এর কার্যকর logic Phase 5-এ তৈরি ও পরীক্ষা হবে। এখানে দেখা সময় স্থির sample—এটি tick করে না।' : 'Functional logic for refresh, sleep, pause/resume, and reminders will be built and tested in Phase 5. The displayed time is a static sample; it does not tick.'}</p></div><div className="modal-actions"><button type="button" className="button button-primary" onClick={() => setTimerInfo(false)}>{t.commonClose}</button></div></Modal>}
    {addTask && <TaskForm listId={undefined} onClose={() => setAddTask(false)} />}
  </div>
}
