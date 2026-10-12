import { useState, type FormEvent } from 'react'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'
import { Modal } from './Modal'

export function QuickTaskForm({ onClose }: { onClose: () => void }) {
  const { lists, setTasks, notify } = usePreview()
  const t = useCopy()
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) { setError(t.formRequired); return }
    const value = title.trim()
    setTasks((items) => [{ id: `demo-task-${Date.now()}`, title: { bn: value, en: value }, listId: lists[0]?.id ?? '', priority: 'medium', status: 'pending', startTime: '14:00', durationMinutes: 30, countdown: 'Demo', assignee: 'Admin' }, ...items])
    notify(t.toastSaved)
    onClose()
  }
  return <Modal title={t.quickTask} onClose={onClose} onSubmit={add} submitLabel={t.commonCreate}>
    <label className="form-field"><span>{t.taskTitle} <b aria-hidden="true">*</b></span><input autoFocus value={title} maxLength={120} placeholder={t.taskTitlePlaceholder} onChange={(event) => { setTitle(event.target.value); setError('') }} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="form-help">{t.commonDemoOnly}: দ্রুত যোগ করা কাজটি শুধু session-এ থাকবে।</p>
  </Modal>
}
