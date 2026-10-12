import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight, BarChart3, Bell, CalendarDays, CheckCheck, ChevronRight, CircleHelp, CloudOff, FileClock,
  LayoutDashboard, ListChecks, Menu, MessageCircle, MoreHorizontal, Plus, Search, Settings2, StickyNote, UserRound, UsersRound, X,
} from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { usePreview } from '../PreviewContext'
import { useCopy } from './useCopy'
import { ToastRegion } from './ToastRegion'
import { DemoTag } from './PageHeader'
import { NotificationPanel } from './NotificationPanel'
import { SearchPanel } from './SearchPanel'
import { ProfileMenu } from './ProfileMenu'
import { QuickTaskForm } from './QuickTaskForm'
import { NoteForm } from './NoteForm'
import DashboardPage from '../pages/DashboardPage'
import WorkListsPage from '../pages/WorkListsPage'
import TodayPage from '../pages/TodayPage'
import SchedulePage from '../pages/SchedulePage'
import ReportsPage from '../pages/ReportsPage'
import ChatPage from '../pages/ChatPage'
import NotesPage from '../pages/NotesPage'
import HistoryPage from '../pages/HistoryPage'
import ProfilePage from '../pages/ProfilePage'
import SettingsPage from '../pages/SettingsPage'
import HelpPage from '../pages/HelpPage'

type NavigationItem = { key: string; to: string; icon: LucideIcon; group: 'workspace' | 'personal' }

export function AppShell() {
  const t = useCopy()
  const { language, unreadCount, profile } = usePreview()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickNoteOpen, setQuickNoteOpen] = useState(false)

  const navigation = useMemo<NavigationItem[]>(() => [
    { key: t.navDashboard, to: '/', icon: LayoutDashboard, group: 'workspace' },
    { key: t.navLists, to: '/lists', icon: ListChecks, group: 'workspace' },
    { key: t.navToday, to: '/today', icon: CheckCheck, group: 'workspace' },
    { key: t.navSchedule, to: '/schedule', icon: CalendarDays, group: 'workspace' },
    { key: t.navReports, to: '/reports', icon: BarChart3, group: 'workspace' },
    { key: t.navChat, to: '/chat', icon: MessageCircle, group: 'workspace' },
    { key: t.navNotes, to: '/notes', icon: StickyNote, group: 'workspace' },
    { key: t.navHistory, to: '/history', icon: FileClock, group: 'workspace' },
    { key: t.navProfile, to: '/profile', icon: UserRound, group: 'personal' },
    { key: t.navSettings, to: '/settings', icon: Settings2, group: 'personal' },
    { key: t.navHelp, to: '/help', icon: CircleHelp, group: 'personal' },
  ], [t])

  useEffect(() => {
    setDrawerOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
    setQuickMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen && !searchOpen && !quickMenuOpen && !profileOpen && !notificationsOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false); setSearchOpen(false); setQuickMenuOpen(false); setProfileOpen(false); setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [drawerOpen, searchOpen, quickMenuOpen, profileOpen, notificationsOpen])

  const openNewNote = () => {
    setQuickMenuOpen(false)
    setQuickNoteOpen(true)
  }
  const openQuickTask = () => {
    setQuickMenuOpen(false)
    setQuickTaskOpen(true)
  }

  return <div className="app-root">
    <a className="skip-link" href="#main-content">{language === 'bn' ? 'মূল কনটেন্টে যান' : 'Skip to main content'}</a>
    <aside className={`sidebar ${drawerOpen ? 'sidebar-open' : ''}`} aria-label={t.primaryNav}>
      <div className="sidebar-top"><Link to="/" className="brand-lockup" aria-label={`${t.brandTagline} · ${t.navDashboard}`}><img className="brand-mark" src="/icon.svg" alt="" width="42" height="42" /><span className="brand-copy"><strong>SmartFlow <b>Duo</b></strong><small>{t.brandTagline}</small></span></Link><button className="icon-button drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t.menuClose}><X size={20} /></button>
        <div className="workspace-switcher"><span className="workspace-symbol"><UsersRound size={17} /></span><span className="workspace-copy"><small>{language === 'bn' ? 'যৌথ WORKSPACE · DEMO' : 'SHARED WORKSPACE · DEMO'}</small><strong>SmartFlow Duo</strong></span><span className="workspace-demo-pill">DEMO</span></div></div>
      <nav className="sidebar-nav" aria-label={t.workspaceNav}><p className="nav-section-label">{t.navSectionWorkspace}</p><div className="nav-list">{navigation.filter((item) => item.group === 'workspace').map((item) => <SidebarLink key={item.to} item={item} unread={item.to === '/chat' ? unreadCount : 0} />)}</div><p className="nav-section-label personal-label">{t.navSectionPersonal}</p><div className="nav-list">{navigation.filter((item) => item.group === 'personal').map((item) => <SidebarLink key={item.to} item={item} unread={0} />)}</div></nav>
      <div className="sidebar-bottom"><div className="sync-card" role="note"><span className="sync-card-icon"><CloudOff size={16} /></span><div><strong>{language === 'bn' ? 'Cloud Sync নেই' : 'No cloud sync'}</strong><small>{language === 'bn' ? 'নমুনা data · local session' : 'Sample data · local session'}</small></div><span className="sync-pulse" /></div><Link className="member-card" to="/profile"><span className="member-avatar">{profile.name.trim().charAt(0).toUpperCase() || 'A'}</span><span className="member-copy"><strong>{profile.role === 'Admin' ? t.adminRole : t.memberRole}</strong><small>{profile.email} · DEMO</small></span><MoreHorizontal size={17} /></Link></div>
    </aside>

    {drawerOpen && <button className="mobile-backdrop" aria-label={t.menuClose} onClick={() => setDrawerOpen(false)} />}
    <div className="app-frame">
      <div className="preview-notice" role="status" aria-label={t.demoLabel}><span className="preview-notice-icon"><CloudOff size={16} /></span><p><strong>{t.demoLabel}</strong><span>{t.demoBanner}</span></p><DemoTag /></div>
      <header className="topbar"><div className="topbar-leading"><button className="icon-button mobile-menu-button" onClick={() => setDrawerOpen(true)} aria-label={t.menuOpen}><Menu size={21} /></button><div className="workspace-context"><span className="context-overline">SMARTFLOW DUO <span className="context-dot">/</span> WORKSPACE</span><span className="context-title">{t.workspace}</span></div></div>
        <div className="topbar-actions"><button type="button" className="icon-button topbar-action" onClick={() => setSearchOpen(true)} aria-label={t.search} title={t.search}><Search size={18} /></button><div className="popover-anchor"><button type="button" className={`icon-button topbar-action notification-button ${notificationsOpen ? 'icon-button-selected' : ''}`} onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false); setQuickMenuOpen(false) }} aria-label={`${t.notifications} (${unreadCount})`} aria-expanded={notificationsOpen}><Bell size={18} />{unreadCount > 0 && <span className="notification-dot" />}</button>{notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} />}</div><div className="popover-anchor"><button type="button" className="profile-menu-trigger" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); setQuickMenuOpen(false) }} aria-label={t.profileMenu} aria-expanded={profileOpen}><span className="member-avatar">{profile.name.trim().charAt(0).toUpperCase() || 'A'}</span><span className="profile-trigger-name">{profile.name.split(' ')[0]}</span><ChevronRight size={14} className="profile-trigger-chevron" /></button>{profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}</div><div className="popover-anchor quick-add-anchor"><button type="button" className="button button-primary quick-add-top" onClick={() => { setQuickMenuOpen((value) => !value); setProfileOpen(false); setNotificationsOpen(false) }} aria-expanded={quickMenuOpen}><Plus size={16} />{t.quickAdd}</button>{quickMenuOpen && <div className="quick-add-menu" role="menu" aria-label={t.quickAdd}><button type="button" role="menuitem" onClick={openQuickTask}><ListChecks size={15} />{t.quickTask}</button><button type="button" role="menuitem" onClick={openNewNote}><StickyNote size={15} />{t.noteNew}</button><button type="button" role="menuitem" onClick={() => { navigate('/lists'); setQuickMenuOpen(false) }}><ArrowRight size={15} />{t.navLists}</button></div>}</div></div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}><Routes><Route path="/" element={<DashboardPage onQuickTask={openQuickTask} />} /><Route path="/lists" element={<WorkListsPage />} /><Route path="/today" element={<TodayPage />} /><Route path="/schedule" element={<SchedulePage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/chat" element={<ChatPage />} /><Route path="/notes" element={<NotesPage />} /><Route path="/history" element={<HistoryPage />} /><Route path="/profile" element={<ProfilePage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/help" element={<HelpPage />} /><Route path="*" element={<DashboardPage onQuickTask={openQuickTask} />} /></Routes><footer className="page-footer"><span>SmartFlow Duo <span className="footer-separator">·</span>{t.footerPreview}</span><span><CloudOff size={13} />{t.footerNoSync}</span></footer></main>
    </div>
    <MobileNavigation onMore={() => setDrawerOpen(true)} currentPath={location.pathname} />
    {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
    {quickTaskOpen && <QuickTaskForm onClose={() => setQuickTaskOpen(false)} />}
    {quickNoteOpen && <NoteForm onClose={() => setQuickNoteOpen(false)} />}
    <ToastRegion />
  </div>
}

function SidebarLink({ item, unread }: { item: NavigationItem; unread: number }) {
  const Icon = item.icon
  return <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{item.key}</span>{unread > 0 && <span className="nav-unread-badge" aria-label={`${unread} ${item.key}`}>{unread}</span>}</NavLink>
}

function MobileNavigation({ onMore, currentPath }: { onMore: () => void; currentPath: string }) {
  const t = useCopy()
  const links = [
    { to: '/', label: t.navHomeShort, icon: LayoutDashboard },
    { to: '/today', label: t.navTodayShort, icon: CheckCheck },
    { to: '/lists', label: t.navListsShort, icon: ListChecks },
  ]
  const moreActive = !links.some((item) => item.to === currentPath)
  return <nav className="mobile-bottom-nav" aria-label={t.mobileNav}>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `mobile-nav-item ${isActive ? 'mobile-nav-active' : ''}`}><Icon size={20} /><span>{label}</span></NavLink>)}<button type="button" className={`mobile-nav-item ${moreActive ? 'mobile-nav-active' : ''}`} onClick={onMore} aria-label={t.navMore}><MoreHorizontal size={20} /><span>{t.navMore}</span></button></nav>
}

export default function App() {
  return <AppShell />
}
