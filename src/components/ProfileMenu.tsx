import { CloudOff, Settings2, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'

export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const t = useCopy()
  const { language, profile } = usePreview()
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A'
  return <div className="profile-menu" role="menu" aria-label={t.profileMenu}>
    <div className="profile-menu-summary"><span className="member-avatar">{initials}</span><span><strong>{profile.name}</strong><small>{profile.email} · Demo</small></span></div>
    <Link role="menuitem" to="/profile" onClick={onClose}><UserRound size={15} />{t.navProfile}</Link>
    <Link role="menuitem" to="/settings" onClick={onClose}><Settings2 size={15} />{t.navSettings}</Link>
    <div className="profile-menu-demo-note"><CloudOff size={14} /><span>{language === 'bn' ? 'ডেমো প্রোফাইল · কোনো Account login নেই' : 'Demo profile · no account is signed in'}</span></div>
  </div>
}
