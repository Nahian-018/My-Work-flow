import { useState } from 'react'
import type { FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { newOperationId } from '../lib/task-service'
import type { NoteDraft, WorkspaceNote } from './WorkspaceCollaborationProvider'
import { useWorkspaceCollaboration } from './WorkspaceCollaborationProvider'

export function NoteEditor({ note, noteId, onClose }: { note: WorkspaceNote | null; noteId: string; onClose: () => void }) {
  const { user } = useAuth()
  const { saveNote } = useWorkspaceCollaboration()
  const [operationId] = useState(() => newOperationId())
  const [draft, setDraft] = useState<NoteDraft>(() => ({
    title: note?.title ?? '', body: note?.body ?? '', category: note?.category ?? 'general',
    visibility: note?.visibility ?? 'private', is_pinned: note?.is_pinned ?? false,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mayChangePrivacy = !note || note.owner_id === user?.id
  const update = <K extends keyof NoteDraft>(key: K, value: NoteDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.title.trim()) { setError('শিরোনাম আবশ্যক।'); return }
    setBusy(true)
    setError('')
    try {
      await saveNote(note, draft, noteId, operationId)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'নোট সংরক্ষণ হয়নি; তথ্য form-এ রাখা হয়েছে।')
    } finally { setBusy(false) }
  }

  return <div className="live-modal-backdrop phase4-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="live-modal-card phase4-note-editor" role="dialog" aria-modal="true" aria-labelledby="phase4-note-editor-title">
      <header className="live-modal-heading"><div><p className="live-eyebrow">{note ? 'NOTE · VERSIONED UPDATE' : 'NEW NOTE'}</p><h2 id="phase4-note-editor-title">{note ? 'নোট সম্পাদনা' : 'নতুন নোট'}</h2></div><button className="live-icon-button" onClick={onClose} disabled={busy} aria-label="বন্ধ করুন"><X size={18} /></button></header>
      <form className="live-task-form" onSubmit={(event) => void submit(event)}>
        <label className="live-field live-field-wide">শিরোনাম<input value={draft.title} maxLength={200} autoFocus required onChange={(event) => update('title', event.target.value)} /></label>
        <label className="live-field live-field-wide">বিষয়<textarea value={draft.body} maxLength={10000} rows={7} onChange={(event) => update('body', event.target.value)} placeholder="আপনার নোট লিখুন…" /></label>
        <div className="phase4-note-editor-row">
          <label className="live-field">Category<input value={draft.category} maxLength={80} list="phase4-note-categories" onChange={(event) => update('category', event.target.value)} /><datalist id="phase4-note-categories"><option value="general" /><option value="work" /><option value="study" /><option value="personal" /><option value="idea" /></datalist></label>
          <label className="live-field">দৃশ্যমানতা<select value={draft.visibility} disabled={!mayChangePrivacy} onChange={(event) => update('visibility', event.target.value as NoteDraft['visibility'])}><option value="private">Private · শুধু মালিক</option><option value="shared">Shared · দুই সদস্য</option></select></label>
        </div>
        <label className="live-checkbox-field"><input type="checkbox" checked={draft.is_pinned} onChange={(event) => update('is_pinned', event.target.checked)} /><span><strong>Pin করা নোট</strong><small>তালিকার ওপরে দেখানো হবে।</small></span></label>
        {!mayChangePrivacy && <p className="phase4-security-hint">Shared note-টি অন্য সদস্যের মালিকানাধীন; আপনি বিষয় সম্পাদনা করতে পারবেন, তবে Private করতে পারবেন না।</p>}
        <p className="phase4-storage-hint">Private note database-এ RLS দিয়ে সুরক্ষিত। Offline-এ পরিবর্তন local queue-তে থাকে; sync-এর আগে অন্য device-এ পৌঁছায় না।</p>
        {error && <p className="live-inline-error" role="alert">{error}</p>}
        <footer className="live-form-actions"><button type="button" className="live-button live-button-secondary" onClick={onClose} disabled={busy}>বাতিল</button><button type="submit" className="live-button live-button-primary" disabled={busy}>{busy ? <span className="live-spinner small-spinner" /> : <Save size={15} />}{busy ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button></footer>
      </form>
    </section>
  </div>
}
