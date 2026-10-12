import { useState, type FormEvent } from 'react'
import type { DemoNote } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'
import { Modal } from './Modal'

export function NoteForm({ note, onClose }: { note?: DemoNote; onClose: () => void }) {
  const { language, setNotes, notify } = usePreview()
  const t = useCopy()
  const [title, setTitle] = useState(note?.title[language] ?? '')
  const [body, setBody] = useState(note?.body[language] ?? '')
  const [pinned, setPinned] = useState(note?.pinned ?? false)
  const [error, setError] = useState('')

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) { setError(t.formRequired); return }
    const changedAt = language === 'bn' ? 'এখন · Demo' : 'Now · Demo'
    if (note) {
      setNotes((items) => items.map((item) => item.id === note.id ? { ...item, title: { bn: title.trim(), en: title.trim() }, body: { bn: body.trim(), en: body.trim() }, pinned, updatedAt: { bn: changedAt, en: changedAt } } : item))
    } else {
      const newNote: DemoNote = { id: `demo-note-${Date.now()}`, title: { bn: title.trim(), en: title.trim() }, body: { bn: body.trim(), en: body.trim() }, category: { bn: 'দ্রুত নোট', en: 'Quick note' }, updatedAt: { bn: changedAt, en: changedAt }, pinned }
      setNotes((items) => [newNote, ...items])
    }
    notify(t.toastSaved)
    onClose()
  }

  return <Modal title={note ? t.commonEdit : t.noteNew} onClose={onClose} onSubmit={save} submitLabel={t.commonSave}>
    <label className="form-field"><span>{t.noteEditorTitle} <b aria-hidden="true">*</b></span><input autoFocus value={title} maxLength={100} onChange={(event) => { setTitle(event.target.value); setError('') }} /></label>
    <label className="form-field"><span>{t.noteBody}</span><textarea value={body} rows={4} maxLength={2000} placeholder={t.noteBodyPlaceholder} onChange={(event) => setBody(event.target.value)} /></label>
    <label className="check-setting"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>{t.notePin}</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="form-help">Demo note: Private/Shared access control এখনো চালু নয়।</p>
  </Modal>
}
