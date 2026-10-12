import { BarChart3, Download, TrendingUp, UsersRound, CalendarDays, Clock3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { useCopy } from '../components/useCopy'
import { downloadDemoCsv } from '../components/ExportUtils'

export default function ReportsPage() {
  const t = useCopy()
  const { language, tasks, lists, notify } = usePreview()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [scope, setScope] = useState<'category' | 'user'>('category')
  const complete = tasks.filter((task) => task.status === 'completed').length
  const total = tasks.length
  const planned = tasks.reduce((sum, task) => sum + task.durationMinutes, 0)
  const actual = tasks.reduce((sum, task) => sum + (task.actualMinutes ?? 0), 0)
  const rows = useMemo(() => {
    if (scope === 'user') return ['Admin', 'Member'].map((name) => {
      const owned = tasks.filter((task) => task.assignee === name)
      return { name, count: owned.length, complete: owned.filter((task) => task.status === 'completed').length, minutes: owned.reduce((sum, task) => sum + (task.actualMinutes ?? 0), 0) }
    })
    return lists.map((list) => {
      const items = tasks.filter((task) => task.listId === list.id)
      return { name: list.name[language], count: items.length, complete: items.filter((task) => task.status === 'completed').length, minutes: items.reduce((sum, task) => sum + (task.actualMinutes ?? 0), 0) }
    })
  }, [language, lists, scope, tasks])
  const graphValues = period === 'daily' ? [41, 60, 48, 74, 53, 67, Math.max(15, Math.round((complete / Math.max(1, total)) * 100))] : period === 'weekly' ? [36, 57, 48, 80, 62, 90, Math.max(18, Math.round((complete / Math.max(1, total)) * 100))] : [58, 44, 73, 62, 86, 69, 92]
  const graphLabels = period === 'monthly' ? ['1', '5', '10', '15', '20', '25', '30'] : period === 'weekly' ? (language === 'bn' ? ['শনি', 'রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র'] : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']) : ['08', '09', '10', '11', '12', '13', '14']
  const exportCsv = () => { downloadDemoCsv(tasks, lists, language); notify(t.reportExportSuccess, 'info') }

  return <div className="page reports-page">
    <PageHeader eyebrow={language === 'bn' ? 'বাস্তব অগ্রগতি' : 'WORKSPACE INSIGHTS'} title={t.reportsTitle} description={t.reportsSubtitle} icon={BarChart3} action={<button type="button" className="button button-secondary" onClick={exportCsv}><Download size={15} />{t.reportExport}</button>} />
    <div className="page-demo-strip"><span><TrendingUp size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'এই সারাংশ নমুনা ডেমো কাজ থেকে হিসাব করা।' : 'These figures are calculated from sample demo tasks.'}</span></span><DemoTag /></div>

    <section className="reports-summary-grid"><article className="report-summary-card"><span><CheckCircle2Icon />{t.dashboardCompleted}</span><strong>{complete}<small> / {total}</small></strong><div className="summary-progress"><span style={{ width: `${total ? (complete / total) * 100 : 0}%` }} /></div></article><article className="report-summary-card"><span><Clock3 size={15} />{t.dashboardPlanned}</span><strong>{formatHours(planned, language)}</strong><small>{language === 'bn' ? 'সব ডেমো কাজের যোগফল' : 'Sum of demo task estimates'}</small></article><article className="report-summary-card"><span><CalendarDays size={15} />{t.dashboardActual}</span><strong>{formatHours(actual, language)}</strong><small>{language === 'bn' ? 'নমুনা সময়' : 'Sample time only'}</small></article><article className="report-summary-card"><span><UsersRound size={15} />{t.dashboardUnread}</span><strong>{language === 'bn' ? '২' : '2'}</strong><small>{language === 'bn' ? 'কথোপকথনের ডেমো' : 'Demo conversation'}</small></article></section>

    <section className="reports-layout"><article className="panel report-chart-panel"><div className="report-chart-header"><div><span className="panel-kicker">COMPLETION TREND</span><h2>{language === 'bn' ? 'কাজ সম্পন্নের ধারা' : 'Task completion trend'}</h2></div><div className="period-switch" role="group" aria-label={t.reportsTitle}>{[['daily', t.reportDaily], ['weekly', t.reportWeekly], ['monthly', t.reportMonthly]].map(([key, label]) => <button key={key} type="button" className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => setPeriod(key as 'daily' | 'weekly' | 'monthly')}>{label}</button>)}</div></div>
      <div className="bar-chart" role="img" aria-label={`${t.demoData}: ${t.dashboardCompleted}`}><div className="chart-y-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-columns">{graphValues.map((value, index) => <div className="chart-column" key={`${period}-${index}`}><div className="chart-column-track"><span style={{ height: `${value}%` }}><i>{value}%</i></span></div><small>{graphLabels[index]}</small></div>)}</div><div className="chart-grid-lines"><span /><span /><span /><span /><span /></div></div><div className="chart-legend"><span><i />{t.dashboardCompleted}</span><DemoTag>{t.demoData}</DemoTag></div>
    </article>

    <article className="panel report-table-panel"><div className="report-chart-header"><div><span className="panel-kicker">BREAKDOWN</span><h2>{scope === 'category' ? t.reportCategory : t.reportUser}</h2></div><div className="scope-switch" role="group" aria-label={t.reportCategory}><button type="button" className={scope === 'category' ? 'active' : ''} aria-pressed={scope === 'category'} onClick={() => setScope('category')}>{t.reportCategory}</button><button type="button" className={scope === 'user' ? 'active' : ''} aria-pressed={scope === 'user'} onClick={() => setScope('user')}>{t.reportUser}</button></div></div><div className="report-table"><div className="report-table-row report-table-head"><span>{scope === 'category' ? t.listCategory : t.taskAssignee}</span><span>{t.listTasks}</span><span>{t.dashboardCompleted}</span><span>{t.dashboardActual}</span></div>{rows.map((row) => <div className="report-table-row" key={row.name}><span className="report-table-name">{row.name}</span><span>{row.count}</span><span>{row.complete}</span><span>{formatHours(row.minutes, language)}</span></div>)}</div><p className="report-table-foot"><DemoTag />{language === 'bn' ? 'বাস্তব রিপোর্ট Phase 6-এ Database data থেকে তৈরি হবে।' : 'Live database reporting is planned for Phase 6.'}</p></article></section>
  </div>
}

function formatHours(minutes: number, language: 'bn' | 'en') {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return language === 'bn' ? `${hours.toLocaleString('bn-BD')}ঘ ${mins.toLocaleString('bn-BD')}মি` : `${hours}h ${mins}m`
}

function CheckCircle2Icon() { return <span className="report-check-dot" aria-hidden="true">✓</span> }
