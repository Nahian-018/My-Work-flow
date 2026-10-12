import { MessageCircle, Paperclip, Send, ShieldCheck, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePreview } from '../PreviewContext'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { useCopy } from '../components/useCopy'

export default function ChatPage() {
  const t = useCopy()
  const { language, messages, setMessages, setUnreadCount, notify } = usePreview()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUnreadCount(0)
    setMessages((items) => items.map((message) => ({ ...message, read: true })))
  }, [setMessages, setUnreadCount])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!text.trim()) { setError(language === 'bn' ? 'বার্তা লিখে তারপর পাঠান।' : 'Write a message before sending.'); return }
    const message = text.trim()
    setMessages((items) => [...items, { id: `demo-message-${Date.now()}`, sender: 'Admin', text: { bn: message, en: message }, time: new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }).format(new Date()), mine: true, read: true }])
    setText('')
    setError('')
    notify(t.chatDemoNotice, 'info')
  }

  return <div className="page chat-page">
    <PageHeader eyebrow={language === 'bn' ? 'দুজনের কথোপকথন' : 'TWO-PERSON CONVERSATION'} title={t.chatTitle} description={t.chatSubtitle} icon={MessageCircle} />
    <div className="page-demo-strip"><span><ShieldCheck size={15} /><strong>{t.demoData}</strong><span>{t.chatDemoNotice}</span></span><DemoTag /></div>

    <section className="chat-window panel"><header className="chat-conversation-header"><div className="chat-avatar-stack"><span className="chat-avatar chat-avatar-admin">A</span><span className="chat-avatar chat-avatar-member">M</span></div><div className="chat-contact-copy"><strong>{language === 'bn' ? 'Admin ও Member' : 'Admin & Member'}</strong><span><i />{language === 'bn' ? 'ডেমো Workspace কথোপকথন' : 'Demo workspace conversation'}</span></div><div className="chat-header-meta"><span className="chat-members"><UsersRound size={14} />2</span><DemoTag /></div></header>
      <div className="chat-messages" ref={listRef} aria-label={language === 'bn' ? 'ডেমো বার্তা' : 'Demo messages'}>{messages.map((message, index) => <div className={`chat-message ${message.mine ? 'chat-message-mine' : ''}`} key={message.id}><div className={`chat-avatar chat-message-avatar ${message.sender === 'Admin' ? 'chat-avatar-admin' : 'chat-avatar-member'}`}>{message.sender === 'Admin' ? 'A' : 'M'}</div><div className="chat-bubble-wrap"><span className="chat-sender">{message.sender === 'Admin' ? t.adminRole : t.memberRole}</span><div className="chat-bubble">{message.text[language]}</div><div className="chat-message-meta"><time>{message.time}</time>{message.mine && <span>{message.read ? (language === 'bn' ? 'দেখা হয়েছে · Demo' : 'Seen · Demo') : ''}</span>}</div></div>{index === 1 && <div className="chat-day-divider"><span>{language === 'bn' ? 'আজ · Asia/Dhaka' : 'Today · Asia/Dhaka'}</span></div>}</div>)}</div>
      <form className="chat-composer" onSubmit={send}><label className="chat-input-wrap"><span className="sr-only">{t.chatInput}</span><textarea value={text} onChange={(event) => { setText(event.target.value); setError('') }} placeholder={t.chatInput} rows={1} maxLength={500} /></label><div className="chat-composer-actions"><span>{text.length}/500 <span className="chat-demo-caption">· {t.commonDemoOnly}</span></span><button type="button" className="chat-attach-button" aria-label={language === 'bn' ? 'ফাইল সংযুক্তি Phase 7-এ' : 'Attachments planned for Phase 7'} title={language === 'bn' ? 'ফাইল সংযুক্তি এখনো চালু নয়' : 'File attachments are not active'} onClick={() => notify(language === 'bn' ? 'File attachment এখনো এই UI preview-তে নেই।' : 'File attachments are not part of this UI preview.', 'info')}><Paperclip size={16} /></button><button type="submit" className="button button-primary chat-send-button"><Send size={15} />{t.chatSend}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>
    </section>
  </div>
}
