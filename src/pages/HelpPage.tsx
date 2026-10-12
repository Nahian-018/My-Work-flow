import { BookOpen, ChevronDown, CircleHelp, CloudOff, Download, ListChecks, MessageCircle, Smartphone, Timer, BellRing, StickyNote, KeyRound, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { StatePreview, type PreviewState } from '../components/StatePreview'
import { useCopy } from '../components/useCopy'

export default function HelpPage() {
  const t = useCopy()
  const { language } = usePreview()
  const [openGuide, setOpenGuide] = useState('login')
  const [state, setState] = useState<PreviewState>('offline')
  const guides = language === 'bn' ? [
    { id: 'login', icon: KeyRound, title: t.helpLogin, steps: [
      'এখনকার ডেমোতে Google Login নেই—এখানে কোনো Gmail password বা verification code দেবেন না।',
      'পরবর্তী অনুমোদিত পর্যায়ে Google sign-in খুলে আপনার account বেছে নেওয়া হবে; server-side allowlist ঠিক করবে account অনুমোদিত কি না।',
      'Admin/Member role server থেকে নির্ধারিত হবে। Browser থেকে নিজের role বাড়ানো যাবে না; প্রকৃত account এখনো এই demo-তে দেখানো হয় না।',
    ], note: 'দুই অনুমোদিত account-এর ঠিকানা public source/frontend-এ রাখা হয়নি; secure provisioning এখনো বাকি।' },
    { id: 'checklist', icon: ListChecks, title: t.helpChecklist, steps: [
      'বাম পাশের Work Lists খুলে Category filter দিয়ে Work, Personal বা Project তালিকা দেখুন।',
      'নতুন তালিকা বা কাজ যোগ করুন। কাজের নাম, তালিকা, priority, শুরুর সময় ও duration পূরণ করে Save দিন।',
      'Checkbox চাপলে demo status বদলায়। Edit/Delete আইকন ব্যবহার করুন; Delete-এর আগে confirmation আসে।',
    ], note: 'সব পরিবর্তন শুধু বর্তমান Browser session-এ থাকে; refresh করলে নমুনা data আবার শুরু হবে। এটি Shared Cloud list নয়।' },
    { id: 'timer', icon: Timer, title: t.helpTimer, steps: [
      'Schedule পেজে Day/Week বদলান, তারিখ এগিয়ে-পিছিয়ে দেখুন; সময়গুলো পরিকল্পিত sample।',
      'কাজের পাশে দেখানো Countdown স্থির নমুনা—এটি tick, pause বা resume করে না।',
      'কাজের প্রকৃত elapsed time, daily reset ও background reminder এখন চালু নয়।',
    ], note: 'এই পর্যায়ে একই নমুনা task schedule-এর তারিখ বদলালেও দেখা যেতে পারে; তারিখভিত্তিক Calendar data সংরক্ষিত হয় না।' },
    { id: 'notifications', icon: BellRing, title: t.helpNotifications, steps: [
      'Top bar-এর Bell খুললে নমুনা notification দেখুন। “সব দেখা” চাপলে demo unread count শূন্য হয়।',
      'Browser notification permission চাওয়া হয় না; Push, email বা Android notification পাঠানো হয় না।',
      'App বন্ধ থাকলে বা Android battery saver চালু থাকলে notification আসার ব্যবস্থা নেই।',
    ], note: 'PWA manifest থাকলেও Service Worker/Push এখনো নেই। Android background behavior পরে বাস্তব device-এ পরীক্ষা করতে হবে।' },
    { id: 'chat', icon: MessageCircle, title: t.helpChat, steps: [
      'Live Chat খুলে Admin ও Member-এর seeded নমুনা বার্তা দেখুন।',
      'লেখার ঘরে বার্তা লিখে Send চাপলে সেটি এই tab-এর demo কথোপকথনে যোগ হয়।',
      'Chat খোলা হলে demo unread count পড়া হয়েছে বলে শূন্য হয়; reload করলে সব sample আবার reset হবে।',
    ], note: 'বার্তা অন্য ব্যবহারকারী, Browser বা Device-এ পাঠানো হয় না; এখানে কোনো Realtime server নেই।' },
    { id: 'notes', icon: StickyNote, title: t.helpNotes, steps: [
      'Quick Notes পেজে New note চাপুন; শিরোনাম লিখে চাইলে বিস্তারিত যোগ করুন।',
      'Search দিয়ে খুঁজুন, Pin filter ব্যবহার করুন; প্রতিটি note-এর Pin, Edit ও Delete control রয়েছে।',
      'Profile photo ও note পরিবর্তনও কেবল session-এ থাকে; refresh-এর পর সেগুলো থাকবে না।',
    ], note: 'Private/Shared access control বা database encryption চালু নয়। গোপন/বাস্তব ব্যক্তিগত তথ্য demo-তে লিখবেন না।' },
    { id: 'backup', icon: Download, title: t.helpBackup, steps: [
      'Settings → Backup & Export থেকে Demo JSON export করে local file হিসেবে নামাতে পারেন। এতে শুধু sample tasks, lists ও notes থাকে।',
      'Restore demo JSON দিয়ে আগে নেওয়া SmartFlow demo export বাছলে বর্তমান tab-এর sample বদলাবে।',
      'Reports পেজের CSV-ও sample task export—কোনোটিই Cloud বা Supabase backup নয়।',
    ], note: 'ফাইল আপনার Device/Downloads-এ থাকবে; অন্য Device-এ নিজে স্থানান্তর না করলে sync হবে না। বাস্তব restore flow এখনো test করা হয়নি।' },
    { id: 'offline', icon: Smartphone, title: t.helpOfflineGuide, steps: [
      'ইন্টারনেট বিচ্ছিন্ন হলে UI-তে offline badge দেখে sync হয়েছে ধরে নেবেন না—এখানে live offline detection নেই।',
      'Refresh করলে in-memory পরিবর্তন মুছে sample data ফিরে আসে; IndexedDB queue বা Service Worker cache নেই।',
      'অপ্রত্যাশিত UI state হলে Help-এর State Preview দিয়ে শুধু visual state বদলান; এটি API চালায় না।',
    ], note: 'PC PWA always-on-top করতে পারে না; notification, offline data ও conflict handling বাস্তবায়িত নয়।'
    },
  ] : [
    { id: 'login', icon: KeyRound, title: t.helpLogin, steps: [
      'Google sign-in is not part of this demo. Do not enter a Gmail password or verification code here.',
      'In the authorized future phase, Google sign-in will open and a server-side allowlist will check whether the account is permitted.',
      'Admin/Member roles must come from the server. Real accounts are not shown in this demo.',
    ], note: 'The two approved addresses are not in public source/frontend code; secure provisioning is still pending.' },
    { id: 'checklist', icon: ListChecks, title: t.helpChecklist, steps: [
      'Open Work Lists from the sidebar and use the Work, Personal, or Project category filters.',
      'Add a list or task. A task includes a title, list, priority, start time, and duration.',
      'The checkbox changes demo status. Edit/Delete controls are available; deletion asks for confirmation.',
    ], note: 'Changes live only in this browser session. Refresh restores sample data; this is not a shared cloud list.' },
    { id: 'timer', icon: Timer, title: t.helpTimer, steps: [
      'Use Day/Week and date controls on Schedule to browse planned sample times.',
      'The countdown shown beside a task is static sample text; it does not tick, pause, or resume.',
      'Elapsed-time tracking, daily reset, and background reminders are not active.',
    ], note: 'The same sample tasks can remain visible when you change dates; date-specific calendar records are not stored.' },
    { id: 'notifications', icon: BellRing, title: t.helpNotifications, steps: [
      'Open the top-bar bell to view sample notifications. Mark all read changes the demo unread count.',
      'The app does not request browser notification permission and does not send push or email notifications.',
      'There is no mechanism to notify you while the app is closed or restricted by Android battery saver.',
    ], note: 'A manifest exists, but there is no Service Worker or Push subscription. Android background behavior still needs real-device testing.' },
    { id: 'chat', icon: MessageCircle, title: t.helpChat, steps: [
      'Open Live Chat to see seeded sample messages from Admin and Member.',
      'Type a message and press Send to append it to this tab’s demo conversation.',
      'Opening Chat marks the demo unread count as read; reload restores the sample state.',
    ], note: 'Messages are not delivered to another person, browser, or device; no Realtime server is connected.' },
    { id: 'notes', icon: StickyNote, title: t.helpNotes, steps: [
      'Open Quick Notes and choose New note. Enter a title and optional body.',
      'Search notes, toggle the pinned filter, or use each note’s Pin, Edit, and Delete controls.',
      'Changes stay in this session and disappear on refresh.',
    ], note: 'Private/shared access controls and database encryption are not active. Do not enter confidential information.' },
    { id: 'backup', icon: Download, title: t.helpBackup, steps: [
      'Use Settings → Backup & Export to download a Demo JSON file containing sample tasks, lists, and notes.',
      'Restore demo JSON can load a SmartFlow demo export into this tab’s sample state.',
      'The Reports CSV is also sample data. Neither export is a cloud or Supabase backup.',
    ], note: 'The file stays on your device unless you transfer it yourself. Real backup/restore has not been tested.' },
    { id: 'offline', icon: Smartphone, title: t.helpOfflineGuide, steps: [
      'An offline badge does not mean sync completed; this demo has no live offline detection.',
      'Refreshing clears in-memory changes. There is no IndexedDB queue or Service Worker cache.',
      'Help’s State Preview changes only the visual state; it makes no API request.',
    ], note: 'A PC PWA cannot stay always-on-top. Notifications, offline data, and conflict handling are not implemented.' },
  ]
  const stateCopy: Record<PreviewState, string> = {
    loading: t.stateLoading,
    empty: t.stateEmpty,
    error: t.stateError,
    offline: t.stateOffline,
    success: t.stateSuccess,
  }
  const stateLabel: Record<PreviewState, string> = {
    loading: t.helpLoading,
    empty: t.helpEmpty,
    error: t.helpError,
    offline: t.helpOffline,
    success: t.helpSuccess,
  }

  return <div className="page help-page">
    <PageHeader eyebrow={language === 'bn' ? 'ধাপে ধাপে সহায়তা' : 'STEP-BY-STEP HELP'} title={t.helpTitle} description={language === 'bn' ? 'Phase 2 demo-তে এখন যা কাজ করে এবং ভবিষ্যৎ feature-এর সীমা—ধাপে ধাপে দেখুন।' : 'Step through the Phase 2 demo and see what is planned versus currently working.'} icon={CircleHelp} />
    <div className="page-demo-strip"><span><BookOpen size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'নির্দেশনায় demo action ও এখনও চালু না থাকা feature আলাদা করে লেখা হয়েছে।' : 'Instructions distinguish demo actions from features that are not active yet.'}</span></span><DemoTag /></div>
    <div className="help-layout"><section className="panel guide-list-panel"><div className="panel-heading"><div><span className="panel-kicker">HELP TOPICS</span><h2>{language === 'bn' ? 'ব্যবহার নির্দেশিকা · ধাপে ধাপে' : 'Step-by-step user guide'}</h2></div><span className="planned-count">{String(guides.length).padStart(2, '0')}</span></div><div className="guide-accordion">{guides.map(({ id, icon: Icon, title, steps, note }) => <article className={`guide-item ${openGuide === id ? 'guide-item-open' : ''}`} key={id}><button type="button" className="guide-toggle" aria-expanded={openGuide === id} onClick={() => setOpenGuide(openGuide === id ? '' : id)}><span className="guide-topic-icon"><Icon size={16} /></span><span className="guide-topic-title"><strong>{title}</strong><small>{language === 'bn' ? 'এই পর্যায়ের ব্যবহার ও সীমা' : 'Current demo steps and limits'}</small></span><ChevronDown size={17} className="guide-chevron" /></button>{openGuide === id && <div className="guide-detail"><ol className="guide-steps">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol><div className="guide-detail-note"><Sparkles size={14} />{note}</div></div>}</article>)}</div></section>
      <aside className="panel states-playground"><div className="panel-heading"><div><span className="panel-kicker">DESIGN SYSTEM</span><h2>{t.helpUiStates}</h2></div><DemoTag /></div><p className="states-intro">{language === 'bn' ? 'নিচের button-গুলো শুধু UI state-এর চেহারা দেখায়; কোনো API request চালায় না।' : 'These controls preview UI states only; they do not make API requests.'}</p><div className="state-select-grid" role="group" aria-label={t.helpUiStates}>{(['loading', 'empty', 'error', 'offline', 'success'] as PreviewState[]).map((value) => <button type="button" key={value} className={state === value ? 'state-select-active' : ''} aria-pressed={state === value} onClick={() => setState(value)}>{stateLabel[value]}</button>)}</div><StatePreview state={state} label={stateLabel[state]}>{stateCopy[state]}</StatePreview><div className="offline-hint"><CloudOff size={15} /><span>{language === 'bn' ? 'বর্তমানে প্রকৃত Offline detection, Sync বা Service Worker নেই।' : 'Live offline detection, sync, and a Service Worker are not implemented.'}</span></div></aside></div>
  </div>
}
