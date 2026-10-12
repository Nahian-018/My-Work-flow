import { CalendarDays, Camera, Mail, Pencil, ShieldCheck, UserRound, UsersRound, Fingerprint, Globe2, Settings2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext'
import { Modal } from '../components/Modal'
import { PageHeader, DemoTag } from '../components/PageHeader'
import { useCopy } from '../components/useCopy'

export default function ProfilePage() {
  const t = useCopy()
  const { language, profile, setProfile, notify } = usePreview()
  const [editOpen, setEditOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    if (!name) { setError(t.formRequired); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError(language === 'bn' ? 'একটি বৈধ Email format লিখুন।' : 'Enter a valid email format.'); return }
    setProfile((value) => ({ ...value, name, email }))
    setError('')
    setEditOpen(false)
    notify(t.toastSaved)
  }

  const updatePhoto = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { notify(language === 'bn' ? 'ছবি ফাইল বাছুন।' : 'Choose an image file.', 'error'); return }
    setPhotoUrl(URL.createObjectURL(file))
    notify(language === 'bn' ? 'ছবির local preview বদলেছে; upload হয়নি।' : 'Local photo preview changed; nothing was uploaded.', 'info')
  }

  return <div className="page profile-page">
    <PageHeader eyebrow={language === 'bn' ? 'আপনার পরিচয়' : 'YOUR ACCOUNT'} title={t.profileTitle} description={t.profileSubtitle} icon={UserRound} action={<button type="button" className="button button-secondary" onClick={() => { setError(''); setEditOpen(true) }}><Pencil size={15} />{t.profileEdit}</button>} />
    <div className="page-demo-strip"><span><UserRound size={15} /><strong>{t.demoData}</strong><span>{language === 'bn' ? 'এখানে কোনো বাস্তব Gmail বা Google profile দেখানো হচ্ছে না।' : 'No real Gmail address or Google profile is shown here.'}</span></span><DemoTag /></div>

    <section className="profile-layout"><article className="panel profile-identity-card"><div className="profile-cover"><span className="profile-cover-orbit orbit-a" /><span className="profile-cover-orbit orbit-b" /><span className="profile-cover-label">SMARTFLOW DUO · DEMO MEMBER</span></div><div className="profile-identity-body"><div className="profile-photo-wrap">{photoUrl ? <img src={photoUrl} alt={t.profilePhoto} className="profile-photo" /> : <span className="profile-photo profile-photo-placeholder">{profile.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}<label className="photo-change-button" aria-label={t.profilePhotoChange} title={t.profilePhotoChange}><Camera size={14} /><input type="file" accept="image/*" onChange={(event) => updatePhoto(event.target.files?.[0])} /></label></div><div className="profile-name-row"><div><h2>{profile.name}</h2><span className="role-chip role-admin"><ShieldCheck size={13} />{profile.role} · {t.commonDemoOnly}</span></div></div><p className="profile-tagline">{language === 'bn' ? 'দুজনের কাজ, একসঙ্গে গুছিয়ে রাখুন।' : 'Keep shared work organized, together.'}</p><div className="profile-identity-details"><div><Mail size={15} /><span><small>{t.profileEmail}</small><strong>{profile.email}</strong></span></div><div><Fingerprint size={15} /><span><small>{t.profileId}</small><strong className="profile-id-value">{profile.userId}</strong></span></div><div><UsersRound size={15} /><span><small>{t.profileWorkspace}</small><strong>{profile.workspace}</strong></span></div><div><CalendarDays size={15} /><span><small>{t.profileJoined}</small><strong>{profile.created}</strong></span></div></div><div className="profile-card-actions"><Link to="/settings" className="button button-secondary"><Settings2 size={15} />{t.navSettings}</Link><span><Globe2 size={14} />{language === 'bn' ? 'সময় অঞ্চল: Asia/Dhaka' : 'Time zone: Asia/Dhaka'}</span></div></div></article>
      <aside className="profile-side-column"><article className="panel profile-workspace-card"><div className="profile-side-head"><span className="profile-side-icon"><UsersRound size={17} /></span><span><small>WORKSPACE</small><strong>SmartFlow Duo</strong></span><DemoTag /></div><div className="member-stack"><span className="member-avatar">A</span><span className="member-avatar member-avatar-second">M</span><span><strong>2</strong><small>{language === 'bn' ? 'নমুনা সদস্য' : 'demo members'}</small></span></div><p>{language === 'bn' ? 'প্রথম অনুমোদিত account-এর Admin role এবং দ্বিতীয়টির Member role backend Phase 3-এ enforce হবে।' : 'Admin/Member roles will be enforced in the backend during Phase 3.'}</p></article><article className="panel preferences-card"><div className="panel-heading"><div><span className="panel-kicker">PERSONAL PREFERENCES</span><h2>{language === 'bn' ? 'আপনার পছন্দ' : 'Your preferences'}</h2></div></div><div className="preference-row"><span><Globe2 size={15} />{language === 'bn' ? 'ভাষা' : 'Language'}</span><strong>{language === 'bn' ? 'বাংলা' : 'English'}</strong></div><div className="preference-row"><span><CalendarDays size={15} />{language === 'bn' ? 'সময় অঞ্চল' : 'Time zone'}</span><strong>Asia/Dhaka</strong></div><Link className="text-link" to="/settings">{language === 'bn' ? 'পছন্দ পরিবর্তন করুন' : 'Change preferences'} →</Link></article></aside>
    </section>

    {editOpen && <Modal title={t.profileEdit} onClose={() => setEditOpen(false)} onSubmit={saveProfile} submitLabel={t.commonSave}><label className="form-field"><span>{t.profileName} *</span><input name="name" autoFocus defaultValue={profile.name} maxLength={80} onChange={() => setError('')} /></label><label className="form-field"><span>{t.profileEmail} *</span><input name="email" type="email" defaultValue={profile.email} onChange={() => setError('')} /></label>{error && <p role="alert" className="form-error">{error}</p>}<p className="form-help">{language === 'bn' ? 'Demo profile change শুধু session-এ থাকে; Google account update হয় না।' : 'Demo profile edits stay in this session and do not change your Google account.'}</p></Modal>}
  </div>
}
