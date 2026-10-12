import { Bell, CheckCheck, MessageCircle, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const t = useCopy()
  const navigate = useNavigate()
  const { language, setUnreadCount } = usePreview()
  const items = [
    { icon: MessageCircle, title: language === 'bn' ? 'নতুন ডেমো বার্তা' : 'New demo message', body: language === 'bn' ? 'Member একটি বার্তা পাঠিয়েছেন' : 'Member sent a message', time: '10:12', to: '/chat' },
    { icon: Clock3, title: language === 'bn' ? 'কাজের সময় হয়েছে' : 'Task is due', body: language === 'bn' ? 'সাপ্তাহিক অগ্রাধিকার ঠিক করা' : 'Set weekly priorities', time: '13:00', to: '/schedule' },
  ]
  return <div className="notification-panel" role="dialog" aria-label={t.notifications}><div className="popover-heading"><span><Bell size={15} />{t.notifications}</span><button type="button" onClick={() => { setUnreadCount(0); onClose() }}><CheckCheck size={14} />{language === 'bn' ? 'সব দেখা' : 'Mark all read'}</button></div>{items.map(({ icon: Icon, title, body, time, to }) => <button className="notification-item" key={title} type="button" onClick={() => { navigate(to); onClose() }}><span className="notification-item-icon"><Icon size={16} /></span><span className="notification-item-copy"><strong>{title}</strong><small>{body}</small></span><time>{time}</time></button>)}<p className="popover-note">{t.commonDemoOnly}</p></div>
}
