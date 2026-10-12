import { ClipboardList, FolderPlus, ListFilter, Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { localize } from '../demo-data'
import type { DemoCategory, DemoList, DemoTask } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { ConfirmDialog } from '../components/Modal'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { TaskRow } from '../components/TaskRow'
import { TaskForm } from '../components/TaskForm'
import { ListForm } from '../components/ListForm'
import { EmptyState } from '../components/EmptyState'
import { useCopy } from '../components/useCopy'

export default function WorkListsPage() {
  const t = useCopy()
  const { language, lists, setLists, tasks, setTasks, notify } = usePreview()
  const [filter, setFilter] = useState<'all' | DemoCategory>('all')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<{ kind: 'task' | 'list'; task?: DemoTask; list?: DemoList; listId?: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'task'; task: DemoTask } | { kind: 'list'; list: DemoList } | null>(null)

  const visibleLists = useMemo(() => lists.filter((list) => !list.archived && (filter === 'all' || list.category === filter) && localize(list.name, language).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [filter, language, lists, query])
  const categoryLabel = (category: DemoCategory) => category === 'work' ? t.categoryWork : category === 'personal' ? t.categoryPersonal : t.categoryProject
  const getListTasks = (listId: string) => tasks.filter((task) => task.listId === listId)

  const removeTarget = () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'task') {
      setTasks((items) => items.filter((task) => task.id !== deleteTarget.task.id))
    } else {
      setLists((items) => items.filter((list) => list.id !== deleteTarget.list.id))
      setTasks((items) => items.filter((task) => task.listId !== deleteTarget.list.id))
    }
    notify(t.toastDeleted, 'info')
    setDeleteTarget(null)
  }

  return <div className="page work-lists-page">
    <PageHeader eyebrow={language === 'bn' ? 'কাজ সাজান' : 'ORGANIZE YOUR WORK'} title={t.workListsTitle} description={t.workListsSubtitle} icon={ClipboardList} action={<div className="header-actions"><button type="button" className="button button-secondary" onClick={() => setForm({ kind: 'list' })}><FolderPlus size={16} />{t.addList}</button><button type="button" className="button button-primary" onClick={() => setForm({ kind: 'task', listId: visibleLists[0]?.id })}><Plus size={16} />{t.addTask}</button></div>} />
    <div className="page-demo-strip"><span><Sparkles size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'এই তালিকা ও কাজগুলো নমুনা; reload করলে আগের অবস্থায় ফিরবে।' : 'These lists and tasks are samples; refresh restores their defaults.'}</span></span><DemoTag /></div>

    <section className="list-toolbar panel"><div className="category-tabs" role="group" aria-label={t.listCategory}>
      {[['all', t.categoryAll], ['work', t.categoryWork], ['personal', t.categoryPersonal], ['project', t.categoryProject]].map(([value, label]) => <button type="button" key={value} className={`category-tab ${filter === value ? 'category-tab-active' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value as 'all' | DemoCategory)}>{label}</button>)}
    </div><label className="search-field"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} /><ListFilter size={15} aria-hidden="true" /></label></section>

    {visibleLists.length ? <section className="work-list-grid" aria-label={t.workListsTitle}>{visibleLists.map((list) => {
      const listTasks = getListTasks(list.id)
      const complete = listTasks.filter((task) => task.status === 'completed').length
      const progress = listTasks.length ? Math.round((complete / listTasks.length) * 100) : 0
      return <article className={`work-list-card list-accent-${list.accent}`} key={list.id}>
        <div className="work-list-card-heading"><span className={`list-symbol list-symbol-${list.accent}`}><ClipboardList size={18} /></span><div className="work-list-card-title"><span>{categoryLabel(list.category)} · <DemoTag>{t.demoData}</DemoTag></span><h2>{localize(list.name, language)}</h2></div><details className="card-action-menu"><summary aria-label={t.commonOpen}><span>•••</span></summary><div><button type="button" onClick={() => setForm({ kind: 'list', list })}>{t.listEdit}</button><button className="menu-danger" type="button" onClick={() => setDeleteTarget({ kind: 'list', list })}>{t.listDelete}</button></div></details></div>
        <div className="list-progress-row"><span>{t.listProgress}</span><strong>{progress}%</strong><div className="list-progress-track"><span style={{ width: `${progress}%` }} /></div><small>{complete}/{listTasks.length} {t.listTasks}</small></div>
        <div className="list-task-stack">{listTasks.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} compact onEdit={(value) => setForm({ kind: 'task', task: value })} onDelete={(value) => setDeleteTarget({ kind: 'task', task: value })} />)}{listTasks.length > 3 && <div className="more-tasks-label">+{listTasks.length - 3} {language === 'bn' ? 'টি আরও কাজ' : 'more tasks'}</div>}{listTasks.length === 0 && <p className="list-empty-line">{language === 'bn' ? 'এখনো কাজ নেই। নতুন কাজ যোগ করুন।' : 'No tasks yet. Add one to this list.'}</p>}</div>
        <button type="button" className="list-add-task" onClick={() => setForm({ kind: 'task', listId: list.id })}><Plus size={15} />{t.addTask}</button>
      </article>
    })}</section> : <EmptyState icon={ClipboardList} title={language === 'bn' ? 'মিল থাকা তালিকা নেই' : 'No matching lists'} description={language === 'bn' ? 'Search বা Category filter বদলান, অথবা নতুন ডেমো তালিকা তৈরি করুন।' : 'Change your search or category filter, or create a demo list.'} action={<button type="button" className="button button-primary" onClick={() => setForm({ kind: 'list' })}><Plus size={15} />{t.addList}</button>} />}

    <div className="lists-footnote"><span className="demo-footnote-icon"><Sparkles size={15} /></span><p><strong>{language === 'bn' ? 'ফর্ম ও Checkbox ডেমো হিসেবে কাজ করে' : 'Forms and checkboxes work as a demo'}</strong><span>{language === 'bn' ? 'এখানে করা পরিবর্তন শুধু বর্তমান session-এ দেখা যায়; page reload করলে নমুনা data reset হয়।' : 'Changes are in-memory for this session; reloading resets sample data.'}</span></p></div>

    {form?.kind === 'task' && <TaskForm task={form.task} listId={form.listId} onClose={() => setForm(null)} />}
    {form?.kind === 'list' && <ListForm list={form.list} onClose={() => setForm(null)} />}
    {deleteTarget && <ConfirmDialog title={t.confirmDeleteTitle} description={deleteTarget.kind === 'task' ? t.confirmDeleteTask : t.confirmDeleteList} confirmLabel={t.confirmAction} onCancel={() => setDeleteTarget(null)} onConfirm={removeTarget} />}
  </div>
}
