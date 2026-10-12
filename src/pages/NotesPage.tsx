import { Bookmark, FilePlus2, Pin, Search, StickyNote, Tag, Trash2, Pencil, PinOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DemoNote } from '../demo-data'
import { localize } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { ConfirmDialog } from '../components/Modal'
import { NoteForm } from '../components/NoteForm'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useCopy } from '../components/useCopy'

export default function NotesPage() {
  const t = useCopy()
  const { language, notes, setNotes, notify } = usePreview()
  const [query, setQuery] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [editNote, setEditNote] = useState<DemoNote | 'new' | null>(null)
  const [deleteNote, setDeleteNote] = useState<DemoNote | null>(null)
  const visibleNotes = useMemo(() => notes.filter((note) => (!pinnedOnly || note.pinned) && `${localize(note.title, language)} ${localize(note.body, language)} ${localize(note.category, language)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [language, notes, pinnedOnly, query])

  const togglePin = (note: DemoNote) => {
    setNotes((items) => items.map((item) => item.id === note.id ? { ...item, pinned: !item.pinned } : item))
    notify(t.toastSaved, 'info')
  }
  const confirmRemove = () => {
    if (!deleteNote) return
    setNotes((items) => items.filter((item) => item.id !== deleteNote.id))
    setDeleteNote(null)
    notify(t.toastDeleted, 'info')
  }

  return <div className="page notes-page">
    <PageHeader eyebrow={language === 'bn' ? 'ভাবনা ধরে রাখুন' : 'CAPTURE A THOUGHT'} title={t.noteTitle} description={t.noteSubtitle} icon={StickyNote} action={<button type="button" className="button button-primary" onClick={() => setEditNote('new')}><FilePlus2 size={16} />{t.noteNew}</button>} />
    <div className="page-demo-strip"><span><Bookmark size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'নোট শুধু এই session-এ থাকবে; Private/Shared access control চালু নয়।' : 'Notes stay in this session; private/shared access control is not active.'}</span></span><DemoTag /></div>

    <section className="notes-toolbar"><label className="search-field notes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.noteSearch} aria-label={t.noteSearch} /></label><button type="button" className={`button ${pinnedOnly ? 'button-primary' : 'button-secondary'}`} aria-pressed={pinnedOnly} onClick={() => setPinnedOnly((value) => !value)}><Pin size={15} />{t.notePinned}{pinnedOnly ? ' ✓' : ''}</button><span className="note-count">{visibleNotes.length} {language === 'bn' ? 'টি নমুনা নোট' : 'sample notes'}</span></section>

    {visibleNotes.length ? <section className="notes-grid">{visibleNotes.map((note, index) => <article className={`note-card note-card-${index % 3}`} key={note.id}><div className="note-card-top"><span className="note-category"><Tag size={13} />{localize(note.category, language)}</span><span className="note-card-actions"><button type="button" aria-label={`${note.pinned ? (language === 'bn' ? 'Unpin' : 'Unpin') : (language === 'bn' ? 'Pin' : 'Pin')}: ${localize(note.title, language)}`} onClick={() => togglePin(note)}>{note.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button><button type="button" aria-label={`${t.commonEdit}: ${localize(note.title, language)}`} onClick={() => setEditNote(note)}><Pencil size={14} /></button><button type="button" className="note-delete-button" aria-label={`${t.commonDelete}: ${localize(note.title, language)}`} onClick={() => setDeleteNote(note)}><Trash2 size={14} /></button></span></div><h2>{localize(note.title, language)}{note.pinned && <Pin size={13} className="note-pin-mark" aria-label={t.notePinned} />}</h2><p>{localize(note.body, language)}</p><div className="note-card-footer"><span className="note-owner-avatar">A</span><span>{t.adminRole}</span><time>{localize(note.updatedAt, language)}</time></div><DemoTag>{language === 'bn' ? 'নমুনা' : 'Sample'}</DemoTag></article>)}</section> : <EmptyState icon={StickyNote} title={language === 'bn' ? 'কোনো নোট মেলেনি' : 'No notes found'} description={language === 'bn' ? 'Search বদলান অথবা নতুন ডেমো নোট তৈরি করুন।' : 'Change the search or create a new demo note.'} action={<button type="button" className="button button-primary" onClick={() => setEditNote('new')}><FilePlus2 size={15} />{t.noteNew}</button>} />}

    {editNote && <NoteForm note={editNote === 'new' ? undefined : editNote} onClose={() => setEditNote(null)} />}
    {deleteNote && <ConfirmDialog title={t.confirmDeleteTitle} description={t.confirmDeleteNote} confirmLabel={t.confirmAction} onCancel={() => setDeleteNote(null)} onConfirm={confirmRemove} />}
  </div>
}
