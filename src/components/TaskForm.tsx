import { useEffect, useState, type FormEvent } from 'react'
import type { DemoTask } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'
import { Modal } from './Modal'

export function TaskForm({ task, listId, onClose }: { task?: DemoTask; listId?: string; onClose: () => void }) {
  const { language, lists, setTasks, notify } = usePreview()
  const t = useCopy()
  const [title, setTitle] = useState(task?.title[language] ?? '')
  const [selectedList, setSelectedList] = useState(task?.listId ?? listId ?? lists[0]?.id ?? '')
  const [priority, setPriority] = useState<DemoTask['priority']>(task?.priority ?? 'medium')
  const [startTime, setStartTime] = useState(task?.startTime ?? '14:00')
  const [duration, setDuration] = useState(String(task?.durationMinutes ?? 30))
  const [error, setError] = useState('')
  const isEdit = Boolean(task)

  useEffect(() => { setError('') }, [title, duration])

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) { setError(t.formRequired); return }
    const durationValue = Number(duration)
    if (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 1440) { setError(t.formDurationError); return }

    if (task) {
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, title: { bn: title.trim(), en: title.trim() }, listId: selectedList, priority, startTime, durationMinutes: durationValue } : item))
    } else {
      const newTask: DemoTask = {
        id: `demo-task-${Date.now()}`,
        title: { bn: title.trim(), en: title.trim() },
        listId: selectedList,
        priority,
        status: 'pending',
        startTime,
        durationMinutes: durationValue,
        countdown: 'Demo',
        assignee: 'Admin',
      }
      setTasks((items) => [newTask, ...items])
    }
    notify(t.toastSaved)
    onClose()
  }

  return <Modal title={isEdit ? t.taskEdit : t.taskAddTitle} onClose={onClose} onSubmit={save} submitLabel={t.commonSave}>
    <label className="form-field"><span>{t.taskTitle} <b aria-hidden="true">*</b></span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.taskTitlePlaceholder} maxLength={120} /></label>
    <label className="form-field"><span>{t.taskList}</span><select value={selectedList} onChange={(event) => setSelectedList(event.target.value)}>{lists.filter((list) => !list.archived).map((list) => <option key={list.id} value={list.id}>{list.name[language]}</option>)}</select></label>
    <div className="form-grid-two"><label className="form-field"><span>{t.taskPriority}</span><select value={priority} onChange={(event) => setPriority(event.target.value as DemoTask['priority'])}><option value="high">{t.priorityHigh}</option><option value="medium">{t.priorityMedium}</option><option value="low">{t.priorityLow}</option></select></label><label className="form-field"><span>{t.taskStart}</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label></div>
    <label className="form-field"><span>{t.taskDuration}</span><input type="number" min="1" max="1440" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="form-help">{t.commonDemoOnly}: এই পরিবর্তন শুধু বর্তমান session-এ থাকে।</p>
  </Modal>
}
