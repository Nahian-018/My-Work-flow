import { useState, type FormEvent } from 'react'
import type { DemoCategory, DemoList } from '../demo-data'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'
import { Modal } from './Modal'

export function ListForm({ list, onClose }: { list?: DemoList; onClose: () => void }) {
  const { language, setLists, notify } = usePreview()
  const t = useCopy()
  const [name, setName] = useState(list?.name[language] ?? '')
  const [category, setCategory] = useState<DemoCategory>(list?.category ?? 'work')
  const [error, setError] = useState('')

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) { setError(t.formRequired); return }
    if (list) {
      setLists((items) => items.map((item) => item.id === list.id ? { ...item, name: { bn: name.trim(), en: name.trim() }, category } : item))
    } else {
      const newList: DemoList = { id: `demo-list-${Date.now()}`, name: { bn: name.trim(), en: name.trim() }, category, accent: category === 'personal' ? 'amber' : category === 'project' ? 'blue' : 'teal' }
      setLists((items) => [newList, ...items])
    }
    notify(t.toastSaved)
    onClose()
  }

  return <Modal title={list ? t.listEdit : t.listAddTitle} onClose={onClose} onSubmit={save} submitLabel={t.commonSave}>
    <label className="form-field"><span>{t.listName} <b aria-hidden="true">*</b></span><input autoFocus value={name} maxLength={70} placeholder={t.listNamePlaceholder} onChange={(event) => { setName(event.target.value); setError('') }} /></label>
    <label className="form-field"><span>{t.listCategory}</span><select value={category} onChange={(event) => setCategory(event.target.value as DemoCategory)}><option value="work">{t.categoryWork}</option><option value="personal">{t.categoryPersonal}</option><option value="project">{t.categoryProject}</option></select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="form-help">{t.commonDemoOnly}: তালিকা শুধু এই Browser session-এ থাকবে।</p>
  </Modal>
}
