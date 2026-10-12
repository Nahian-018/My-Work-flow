import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Bookmark, FilePlus2, LockKeyhole, Pin, PinOff, Search, Share2, StickyNote, Tag, Trash2 } from 'lucide-react'
import { newOperationId } from '../lib/task-service'
import type { WorkspaceNote } from './WorkspaceCollaborationProvider'
import { useWorkspaceCollaboration } from './WorkspaceCollaborationProvider'
import { NoteEditor } from './NoteEditor'

export function LiveNotesPage() {
  const { user } = useAuth()
  const { notes, notesState, notesError, notePendingCount, noteConflicts, refreshNotes, saveNote, deleteNote, retryNoteConflict, discardOperation } = useWorkspaceCollaboration()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'shared' | 'private'>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [editing, setEditing] = useState<{ note: WorkspaceNote | null; noteId: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceNote | null>(null)
  const [actionError, setActionError] = useState('')

  const categories = useMemo(() => [...new Set(notes.map((note) => note.category))].sort((a, b) => a.localeCompare(b)), [notes])
  const visibleNotes = useMemo(() => notes.filter((note) => {
    const matchesSearch = `${note.title} ${note.body} ${note.category}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    return matchesSearch
      && (categoryFilter === 'all' || note.category === categoryFilter)
      && (visibilityFilter === 'all' || note.visibility === visibilityFilter)
      && (!pinnedOnly || note.is_pinned)
  }), [categoryFilter, notes, pinnedOnly, search, visibilityFilter])

  const openNew = () => setEditing({ note: null, noteId: newOperationId() })
  const togglePin = async (note: WorkspaceNote) => {
    setActionError('')
    try {
      await saveNote(note, {
        title: note.title, body: note.body, category: note.category, visibility: note.visibility,
        is_pinned: !note.is_pinned,
      }, note.id, newOperationId())
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Pin পরিবর্তন সংরক্ষণ হয়নি।') }
  }
  const remove = async () => {
    if (!deleteTarget) return
    setActionError('')
    try {
      await deleteNote(deleteTarget, newOperationId())
      setDeleteTarget(null)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Note delete হয়নি।') }
  }

  return <section className="live-page phase4-page live-notes-page">
    <div className="live-page-heading">
      <div><p className="live-eyebrow">RLS-PROTECTED · SHARED & PRIVATE</p><h1>দ্রুত নোট</h1><p className="live-subtitle">Database note · search, category, pin ও updated time</p></div>
      <button className="live-button live-button-primary" onClick={openNew}><FilePlus2 size={16} />নতুন নোট</button>
    </div>
    <div className="live-info-card phase4-info-card"><LockKeyhole size={18} /><p><strong>Private note frontend-এ লুকিয়ে রাখাই একমাত্র সুরক্ষা নয়</strong><span>Private/shared visibility Supabase RLS এবং note RPC-তে যাচাই হয়। Offline copy কেবল এই account-এর browser partition-এ থাকে; এটি encrypted/cloud backup নয়।</span></p></div>

    {(notesError || actionError) && <div className="live-banner live-banner-warning" role="alert">{actionError || notesError}<button className="live-icon-button" onClick={() => void refreshNotes()} aria-label="আবার লোড"><Pin size={14} /></button></div>}
    <div className="phase4-notes-toolbar">
      <label className="search-field phase4-notes-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="শিরোনাম, বিষয় বা category খুঁজুন" aria-label="নোট খুঁজুন" /></label>
      <label className="phase4-filter">Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">সব category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label className="phase4-filter">দৃশ্যমানতা<select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as typeof visibilityFilter)}><option value="all">সব</option><option value="shared">Shared</option><option value="private">Private</option></select></label>
      <button className={`live-button ${pinnedOnly ? 'live-button-primary' : 'live-button-secondary'}`} aria-pressed={pinnedOnly} onClick={() => setPinnedOnly((value) => !value)}><Pin size={15} />শুধু pin করা</button>
      <span className="phase4-note-count">{visibleNotes.length}টি নোট</span>
    </div>

    {notePendingCount > 0 && <div className="phase4-pending-strip"><Bookmark size={15} /><span>{notePendingCount}টি note change এই browser-এ sync-এর অপেক্ষায়</span></div>}
    {noteConflicts.map((operation) => <div className="phase4-conflict-card" role="alert" key={operation.operationId}>
      <div><strong>“{String(operation.payload.title ?? 'নোট')}”-এ sync conflict</strong><p>{operation.error ?? 'অন্য ব্যবহারকারীর পরিবর্তনের সঙ্গে version মেলেনি।'}</p></div>
      <button className="live-button live-button-secondary" disabled={!navigator.onLine} onClick={() => void retryNoteConflict(operation)}>Server version-এ local পরিবর্তন প্রয়োগ</button>
      <button className="live-button live-button-danger" onClick={() => void discardOperation(operation)}>Local change বাতিল</button>
    </div>)}

    {notesState === 'loading' && notes.length === 0 ? <div className="live-empty"><span className="live-spinner" /><p>RLS-protected note load হচ্ছে…</p></div>
      : visibleNotes.length === 0 ? <div className="live-empty-card"><span className="live-empty-icon"><StickyNote size={23} /></span><h2>{search || categoryFilter !== 'all' || pinnedOnly ? 'এই filter-এ নোট নেই' : 'এখনো কোনো নোট নেই'}</h2><p>{notesState === 'offline' ? 'এই account-এর আগে cached note না থাকলে offline-এ load করা যাবে না।' : 'Shared অথবা Private note তৈরি করুন।'}</p>{!search && <button className="live-button live-button-primary" onClick={openNew}><FilePlus2 size={15} />প্রথম নোট যোগ করুন</button>}{notesState === 'error' && <button className="live-button live-button-secondary" onClick={() => void refreshNotes()}>আবার চেষ্টা</button>}</div>
      : <div className="phase4-notes-grid">{visibleNotes.map((note) => <article className={`phase4-note-card ${note.is_pinned ? 'is-pinned' : ''} ${note.local_only ? 'is-local' : ''}`} key={note.id}>
        <div className="phase4-note-meta"><span className="phase4-note-category"><Tag size={13} />{note.category}</span><span className={`phase4-note-privacy ${note.visibility}`} title={note.visibility === 'private' ? 'শুধু মালিক' : 'Workspace-এর দুই সদস্য'}>{note.visibility === 'private' ? <><LockKeyhole size={13} />Private</> : <><Share2 size={13} />Shared</>}</span></div>
        <h2>{note.title}{note.is_pinned && <Pin size={14} aria-label="Pinned" />}</h2>
        <p className="phase4-note-body">{note.body || '—'}</p>
        <footer className="phase4-note-footer"><span>{note.local_only ? 'শুধু এই device · sync pending' : `Owner · ${note.owner_id === user?.id ? 'আপনি' : 'অন্য সদস্য'}`}</span><time dateTime={note.updated_at}>{new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(note.updated_at))}</time></footer>
        <div className="phase4-note-actions"><button aria-label={`${note.is_pinned ? 'Unpin' : 'Pin'} ${note.title}`} onClick={() => void togglePin(note)}><PinOff size={15} />{note.is_pinned ? 'Unpin' : 'Pin'}</button><button aria-label={`Edit ${note.title}`} onClick={() => setEditing({ note, noteId: note.id })}>সম্পাদনা</button><button className="danger-action" aria-label={`Delete ${note.title}`} onClick={() => setDeleteTarget(note)}><Trash2 size={15} />মুছুন</button></div>
      </article>)}</div>}

    {editing && <NoteEditor note={editing.note} noteId={editing.noteId} onClose={() => setEditing(null)} />}
    {deleteTarget && <div className="live-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}><section className="live-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="phase4-delete-title"><h2 id="phase4-delete-title">নোট মুছবেন?</h2><p>“{deleteTarget.title}” soft-delete হবে; database history/backup policy অনুসারে recovery সীমিত হতে পারে।</p><footer className="live-form-actions"><button className="live-button live-button-secondary" onClick={() => setDeleteTarget(null)}>বাতিল</button><button className="live-button live-button-danger" onClick={() => void remove()}>মুছুন</button></footer></section></div>}
  </section>
}
