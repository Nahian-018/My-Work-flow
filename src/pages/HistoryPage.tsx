import { CalendarClock, FileClock, ListChecks, StickyNote, History as HistoryIcon, Activity } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DemoActivity } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useCopy } from '../components/useCopy'

export default function HistoryPage() {
  const t = useCopy()
  const { language, activities } = usePreview()
  const [filter, setFilter] = useState<'all' | DemoActivity['type']>('all')
  const filtered = useMemo(() => activities.filter((item) => filter === 'all' || item.type === filter), [activities, filter])
  const filters = [
    ['all', t.historyFilterAll], ['task', t.historyFilterTask], ['schedule', t.historyFilterSchedule], ['note', t.historyFilterNotes],
  ] as const
  const iconFor = (type: DemoActivity['type']) => type === 'task' ? ListChecks : type === 'schedule' ? CalendarClock : type === 'note' ? StickyNote : Activity
  return <div className="page history-page">
    <PageHeader eyebrow={language === 'bn' ? 'পরিবর্তনের রেকর্ড' : 'AUDIT TRAIL PREVIEW'} title={t.historyTitle} description={t.historySubtitle} icon={FileClock} />
    <div className="page-demo-strip"><span><HistoryIcon size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'এগুলো নমুনা activity; audit history Database-এ সংরক্ষিত হচ্ছে না।' : 'These are sample events; no audit history is being stored in a database.'}</span></span><DemoTag /></div>
    <section className="panel history-panel"><div className="history-toolbar"><div><span className="panel-kicker">WORKSPACE ACTIVITY</span><h2>{language === 'bn' ? 'সাম্প্রতিক পরিবর্তন' : 'Recent changes'}</h2></div><div className="history-filter-tabs" role="group" aria-label={t.historyTitle}>{filters.map(([key, label]) => <button type="button" key={key} className={filter === key ? 'active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
      {filtered.length ? <div className="history-timeline">{filtered.map((item) => { const Icon = iconFor(item.type); return <article className="history-item" key={item.id}><div className={`history-icon history-icon-${item.type}`}><Icon size={16} /></div><div className="history-line" /><div className="history-item-body"><div className="history-item-heading"><strong>{item.actor}</strong><span>{item.action[language]}</span><b>{item.target[language]}</b><DemoTag>{language === 'bn' ? 'ডেমো' : 'Demo'}</DemoTag></div><p>{language === 'bn' ? 'এই activity শুধু UI design দেখানোর জন্য তৈরি নমুনা।' : 'This activity is a sample used to demonstrate the UI.'}</p></div><time>{item.time[language]}</time></article>})}</div> : <EmptyState icon={FileClock} title={language === 'bn' ? 'এই ধরনের activity নেই' : 'No activity in this filter'} description={language === 'bn' ? 'অন্য Filter বেছে নিন।' : 'Choose another filter to view sample events.'} />}
    </section>
  </div>
}
