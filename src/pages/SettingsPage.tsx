import { Bell, BellRing, Clock3, Download, FileDown, FileUp, Globe2, Moon, RotateCcw, ShieldCheck, Sun, Timer, Monitor } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { usePreview } from '../PreviewContext'
import type { Theme } from '../PreviewContext'
import { useCopy } from '../components/useCopy'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { downloadDemoJson, isDemoExport } from '../components/ExportUtils'
import { Modal } from '../components/Modal'

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read text file'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsText(file)
  })
}

export default function SettingsPage() {
  const t = useCopy()
  const { language, setLanguage, theme, setTheme, tasks, lists, notes, notify, notificationPrefs, setNotificationPrefs, quietStart, setQuietStart, quietEnd, setQuietEnd, resetEnabled, setResetEnabled, resetTime, setResetTime, setTasks, setLists, setNotes } = usePreview()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const updateTheme = (value: Theme) => { setTheme(value); notify(t.toastSaved, 'info') }
  const updateLanguage = (value: 'bn' | 'en') => { setLanguage(value); notify(value === 'bn' ? 'ভাষা বাংলায় বদলেছে—শুধু এই session-এ।' : 'Language changed to English for this session.', 'info') }
  const togglePreference = (key: string) => setNotificationPrefs((current) => ({ ...current, [key]: !current[key] }))
  const exportDemo = () => { downloadDemoJson({ tasks, lists, notes }); notify(t.settingsExportDone, 'info') }

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('file too large')
      const parsed: unknown = JSON.parse(await readFileAsText(file))
      if (!isDemoExport(parsed)) throw new Error('bad demo export')
      setTasks(parsed.tasks)
      setLists(parsed.lists)
      setNotes(parsed.notes)
      setRestoreOpen(false)
      setRestoreError('')
      notify(language === 'bn' ? 'ডেমো Export পড়া হয়েছে; Cloud restore হয়নি।' : 'Demo export was loaded; no cloud restore occurred.', 'info')
    } catch {
      setRestoreError(language === 'bn' ? 'ফাইলটি SmartFlow Demo JSON নয় বা কাঠামো সঠিক নয়।' : 'This is not a valid SmartFlow demo JSON file.')
    } finally {
      event.target.value = ''
    }
  }

  return <div className="page settings-page">
    <PageHeader eyebrow={language === 'bn' ? 'নিজের মতো সাজান' : 'PERSONAL PREFERENCES'} title={t.settingsTitle} description={t.settingsSubtitle} icon={BellRing} />
    <div className="page-demo-strip"><span><RotateCcw size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'এই control-গুলো live preview-তে কাজ করে; Refresh করলে default হবে।' : 'These controls update the preview; refreshing restores defaults.'}</span></span><DemoTag /></div>

    <div className="settings-layout"><div className="settings-main-column">
      <section className="panel settings-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-teal"><Sun size={17} /></span><div><h2>{t.settingsTheme}</h2><p>{language === 'bn' ? 'ডেমো UI-তে এখনই Light, Dark বা System বদলান।' : 'Switch the demo UI between light, dark, or system appearance.'}</p></div><DemoTag /></div><div className="theme-options" role="group" aria-label={t.settingsTheme}>{([{ value: 'light', label: t.themeLight, icon: Sun }, { value: 'dark', label: t.themeDark, icon: Moon }, { value: 'system', label: t.themeSystem, icon: Monitor }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" className={`theme-option ${theme === value ? 'theme-option-selected' : ''}`} aria-pressed={theme === value} onClick={() => updateTheme(value)}><Icon size={17} /><span>{label}</span>{theme === value && <i>✓</i>}</button>)}</div></section>

      <section className="panel settings-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-blue"><Globe2 size={17} /></span><div><h2>{t.settingsLanguage}</h2><p>{language === 'bn' ? 'Interface বাংলা ও English-এ বদলান।' : 'Switch the interface between Bengali and English.'}</p></div><DemoTag /></div><div className="language-options" role="group" aria-label={t.settingsLanguage}><button type="button" aria-pressed={language === 'bn'} className={language === 'bn' ? 'language-selected' : ''} onClick={() => updateLanguage('bn')}>বাংলা <small>বাংলাদেশ</small></button><button type="button" aria-pressed={language === 'en'} className={language === 'en' ? 'language-selected' : ''} onClick={() => updateLanguage('en')}>English <small>English</small></button></div></section>

      <section className="panel settings-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-amber"><Bell size={17} /></span><div><h2>{t.settingsNotifications}</h2><p>{language === 'bn' ? 'নমুনা preference; কোনো notification service যুক্ত নয়।' : 'Sample preferences; no notification service is connected.'}</p></div><DemoTag /></div><div className="settings-toggle-list">{[
        ['taskStart', t.settingsTaskStart], ['upcoming', t.settingsUpcoming], ['chat', t.settingsChat], ['dailySummary', t.settingsDailySummary],
      ].map(([key, label]) => <label className="settings-toggle-row" key={key}><span className="settings-toggle-label"><BellRing size={15} />{label}</span><input type="checkbox" role="switch" checked={notificationPrefs[key]} onChange={() => togglePreference(key)} /><span className="switch-visual" aria-hidden="true" /></label>)}</div><div className="quiet-hours-row"><span><Clock3 size={15} />{t.settingsQuietHours}</span><label><span className="sr-only">Quiet hours start</span><input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} /></label><span>—</span><label><span className="sr-only">Quiet hours end</span><input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} /></label></div></section>

      <section className="panel settings-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-violet"><Timer size={17} /></span><div><h2>{language === 'bn' ? 'দৈনিক Reset ও Time Zone' : 'Daily reset & time zone'}</h2><p>{language === 'bn' ? 'Reset option-এর UI প্রস্তুত; server schedule সক্রিয় নয়।' : 'Reset controls are preview-only; no server schedule is active.'}</p></div><DemoTag /></div><label className="settings-toggle-row"><span className="settings-toggle-label"><RotateCcw size={15} />{t.settingsDailyReset}</span><input type="checkbox" role="switch" checked={resetEnabled} onChange={() => setResetEnabled((value) => !value)} /><span className="switch-visual" aria-hidden="true" /></label><div className="reset-details"><label className="form-field"><span>{t.settingsResetTime}</span><input type="time" value={resetTime} disabled={!resetEnabled} onChange={(event) => setResetTime(event.target.value)} /></label><label className="form-field"><span>{t.settingsTimezone}</span><input type="text" value="Asia/Dhaka" readOnly /></label></div></section>
    </div>

    <aside className="settings-side-column"><section className="panel settings-card backup-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-green"><FileDown size={17} /></span><div><h2>{t.settingsBackup}</h2><p>{language === 'bn' ? 'শুধু ডেমো নমুনা ডেটা export বা import করুন।' : 'Export or import sample demo data only.'}</p></div></div><button type="button" className="button button-secondary button-full" onClick={exportDemo}><Download size={15} />{t.settingsExport}</button><button type="button" className="button button-quiet button-full" onClick={() => { setRestoreError(''); setRestoreOpen(true) }}><FileUp size={15} />{language === 'bn' ? 'Demo JSON Restore' : 'Restore demo JSON'}</button><p className="backup-warning">{language === 'bn' ? 'এটি Supabase backup নয়। Cloud backup Phase 10-এও Free plan-এর সীমা মেনে হবে।' : 'This is not a Supabase backup. Cloud backup is not included.'}</p></section>
      <section className="panel settings-card privacy-card"><div className="settings-section-heading"><span className="settings-section-icon settings-icon-rose"><ShieldCheck size={17} /></span><div><h2>{t.settingsPrivacy}</h2><p>{language === 'bn' ? 'নিরাপত্তা ব্যবস্থা এখনো তৈরি হচ্ছে।' : 'Security controls are planned.'}</p></div></div><div className="privacy-status-row"><span className="privacy-status-dot" /><strong>{language === 'bn' ? 'Backend সংযুক্ত নয়' : 'Backend not connected'}</strong><DemoTag /></div><ul><li>{language === 'bn' ? 'Google allowlist: Phase 3' : 'Google allowlist: Phase 3'}</li><li>{language === 'bn' ? 'Database RLS: Phase 3' : 'Database RLS: Phase 3'}</li><li>{language === 'bn' ? 'Cloud backup: Free-tier সীমা প্রযোজ্য' : 'Cloud backup: Free-tier limits apply'}</li></ul></section>
    </aside></div>

    {restoreOpen && <Modal title={language === 'bn' ? 'ডেমো JSON Restore' : 'Restore demo JSON'} onClose={() => setRestoreOpen(false)}><div className="restore-dropzone"><FileUp size={25} /><strong>{language === 'bn' ? 'SmartFlow Demo JSON বাছুন' : 'Choose a SmartFlow demo JSON file'}</strong><span>{language === 'bn' ? 'এটি শুধু এই tab-এর demo state বদলাবে; Cloud-এ upload হবে না।' : 'This updates only the local demo state; no cloud upload occurs.'}</span><button type="button" className="button button-secondary" onClick={() => fileRef.current?.click()}>{language === 'bn' ? 'ফাইল বাছুন' : 'Choose file'}</button><input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={handleRestore} /></div>{restoreError && <p className="form-error" role="alert">{restoreError}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setRestoreOpen(false)}>{t.commonCancel}</button></div></Modal>}
  </div>
}
