import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CheckCheck, CloudOff, LoaderCircle, MessageCircle, RefreshCw, Send, Wifi } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { newOperationId } from '../lib/task-service'
import { useWorkspaceCollaboration } from './WorkspaceCollaborationProvider'

const dhakaDateTime = new Intl.DateTimeFormat('bn-BD', {
  timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function LiveChatPage() {
  const { client, user, membership } = useAuth()
  const {
    chatMessages, chatState, chatRealtimeConnected, chatError, chatUnreadCount, chatHasMore, chatPendingCount,
    refreshChat, loadEarlierChat, sendChatMessage, markChatRead, syncPending,
  } = useWorkspaceCollaboration()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [partnerName, setPartnerName] = useState('অনুমোদিত সদস্য')
  const list = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const userId = user?.id ?? ''

  useEffect(() => {
    if (!userId || !membership?.workspace_id) return
    let active = true
    void Promise.resolve(client.from('profiles').select('user_id,display_name')
      .eq('workspace_id', membership.workspace_id).neq('user_id', userId).limit(1).maybeSingle())
      .then(({ data, error }) => {
        if (active && !error && data?.display_name) setPartnerName(data.display_name)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [client, membership?.workspace_id, userId])

  useEffect(() => { void markChatRead() }, [markChatRead])
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }) }, [chatMessages.length])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = text.trim()
    if (!body) { setFormError('বার্তা লিখুন।'); return }
    if (body.length > 5000) { setFormError('বার্তা ৫০০০ অক্ষরের মধ্যে রাখুন।'); return }
    setSending(true)
    setFormError('')
    try {
      await sendChatMessage(body, newOperationId())
      setText('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'বার্তা পাঠানো যায়নি; আবার চেষ্টা করুন।')
    } finally { setSending(false) }
  }

  return <section className="live-page phase4-page live-chat-page">
    <div className="live-page-heading">
      <div><p className="live-eyebrow">PRIVATE WORKSPACE · REALTIME CHAT</p><h1>লাইভ কথোপকথন</h1><p className="live-subtitle">শুধু অনুমোদিত workspace সদস্য · unread {chatUnreadCount}</p></div>
      <div className={`phase4-connection ${chatState === 'connected' && chatRealtimeConnected ? 'is-connected' : ''}`} role="status">
        {chatState === 'connected' && chatRealtimeConnected ? <Wifi size={15} /> : <CloudOff size={15} />}
        {chatState === 'loading' ? 'বার্তা লোড হচ্ছে' : chatState === 'connected' ? (chatRealtimeConnected ? 'Realtime যুক্ত' : 'Cloud · Realtime অপেক্ষায়') : chatState === 'offline' ? 'এই device-এ offline' : 'Chat error'}
      </div>
    </div>

    <div className="live-info-card phase4-info-card"><MessageCircle size={18} /><p><strong>একটি অনুমোদিত workspace-এর ব্যক্তিগত chat</strong><span>Message ও read receipt database/RLS-এ; offline send কেবল এই browser-এর queue-তে থাকে, অপর সদস্য online sync-এর আগে পাবে না।</span></p></div>
    {chatError && <div className="live-banner live-banner-warning" role="status"><AlertTriangle size={16} /><span>{chatError}</span><button className="live-icon-button" onClick={() => { void refreshChat(); void syncPending() }} aria-label="Pending chat retry"><RefreshCw size={15} /></button></div>}

    <section className="phase4-chat-shell" aria-label="Live chat">
      <header className="phase4-chat-header">
        <span className="phase4-chat-avatar">{partnerName.charAt(0).toUpperCase()}</span>
        <div><strong>{partnerName}</strong><small>{chatRealtimeConnected ? 'দুই অনুমোদিত account · Supabase Realtime' : 'দুই অনুমোদিত account · database history'}</small></div>
        <span className="phase4-unread-chip">অপঠিত {chatUnreadCount}</span>
      </header>

      <div className="phase4-chat-history" ref={list} aria-live="polite" aria-label="বার্তার ইতিহাস">
        {chatHasMore && <button className="live-button live-button-secondary phase4-load-older" onClick={() => void loadEarlierChat()} disabled={chatState !== 'connected'}>আরও পুরোনো বার্তা লোড করুন</button>}
        {chatState === 'loading' && chatMessages.length === 0 && <div className="live-empty"><LoaderCircle className="phase4-spinner" size={20} /><p>Database থেকে chat history আনা হচ্ছে…</p></div>}
        {chatState === 'error' && chatMessages.length === 0 && <div className="live-empty-card"><AlertTriangle size={22} /><h2>Chat history লোড হয়নি</h2><p>Database/RLS error ঠিক করে আবার চেষ্টা করুন।</p><button className="live-button live-button-secondary" onClick={() => void refreshChat()}><RefreshCw size={15} />আবার চেষ্টা</button></div>}
        {chatMessages.length === 0 && chatState !== 'loading' && chatState !== 'error' && <div className="live-empty-card"><MessageCircle size={22} /><h2>এখনো কোনো বার্তা নেই</h2><p>প্রথম message লিখুন।</p></div>}
        {chatMessages.map((message) => {
          const mine = message.sender_id === userId
          const seenByOther = mine && message.read_by.some((reader) => reader !== userId)
          return <article className={`phase4-message ${mine ? 'is-mine' : 'is-theirs'} ${message.local_only ? 'is-pending' : ''}`} key={message.id}>
            {!mine && <span className="phase4-message-avatar" aria-hidden="true">{(message.sender_id.charAt(0) || 'M').toUpperCase()}</span>}
            <div className="phase4-message-content">
              {!mine && <small className="phase4-message-sender">{partnerName}</small>}
              <p>{message.body}</p>
              <div className="phase4-message-meta"><time dateTime={message.created_at}>{dhakaDateTime.format(new Date(message.created_at))} · Dhaka</time>
                {mine && <span>{message.local_only ? <><CloudOff size={12} /> এই device-এ pending</> : seenByOther ? <><CheckCheck size={12} /> দেখা হয়েছে</> : <><CheckCheck size={12} /> পাঠানো হয়েছে</>}</span>}
              </div>
            </div>
          </article>
        })}
        <div ref={bottom} />
      </div>

      {chatPendingCount > 0 && <div className="phase4-pending-strip"><CloudOff size={15} /><span>{chatPendingCount}টি chat/read change sync-এর অপেক্ষায়</span><button className="live-button live-button-secondary" onClick={() => void syncPending()} disabled={!navigator.onLine}>আবার sync</button></div>}
      <form className="phase4-chat-composer" onSubmit={(event) => void submit(event)}>
        <label><span className="sr-only">বার্তা লিখুন</span><textarea value={text} maxLength={5000} rows={2} placeholder="বার্তা লিখুন…" onChange={(event) => { setText(event.target.value); setFormError('') }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /></label>
        <div className="phase4-composer-footer"><small>{text.length}/5000 · Enter পাঠায়, Shift+Enter নতুন লাইন</small><button type="submit" className="live-button live-button-primary" disabled={sending || !text.trim()}>{sending ? <LoaderCircle size={15} className="phase4-spinner" /> : <Send size={15} />}পাঠান</button></div>
        {formError && <p className="live-inline-error" role="alert">{formError}</p>}
      </form>
    </section>
  </section>
}
