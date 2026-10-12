import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localize } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const t = useCopy()
  const { language, tasks, notes, lists } = usePreview()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    const taskMatches = tasks.filter((task) => localize(task.title, language).toLocaleLowerCase().includes(needle)).map((task) => ({ label: localize(task.title, language), type: t.navToday, to: '/today' }))
    const noteMatches = notes.filter((note) => `${localize(note.title, language)} ${localize(note.body, language)}`.toLocaleLowerCase().includes(needle)).map((note) => ({ label: localize(note.title, language), type: t.navNotes, to: '/notes' }))
    const listMatches = lists.filter((list) => localize(list.name, language).toLocaleLowerCase().includes(needle)).map((list) => ({ label: localize(list.name, language), type: t.navLists, to: '/lists' }))
    return [...taskMatches, ...noteMatches, ...listMatches].slice(0, 7)
  }, [language, lists, notes, query, t.navLists, t.navNotes, t.navToday, tasks])
  return <div className="modal-backdrop search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="search-dialog" role="dialog" aria-modal="true" aria-label={t.search}><div className="search-dialog-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} /><button type="button" aria-label={t.commonClose} onClick={onClose}><X size={18} /></button></div><div className="search-results">{!query.trim() ? <p className="search-hint">{t.commonDemoOnly}</p> : results.length ? results.map((result, index) => <button key={`${result.to}-${index}`} type="button" className="search-result" onClick={() => { navigate(result.to); onClose() }}><span><strong>{result.label}</strong><small>{result.type}</small></span><span aria-hidden="true">↗</span></button>) : <p className="search-hint">{language === 'bn' ? 'কোনো নমুনা মিল পাওয়া যায়নি।' : 'No matching sample items.'}</p>}</div></div></div>
}
