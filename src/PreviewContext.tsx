import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  initialActivities,
  initialLists,
  initialMessages,
  initialNotes,
  initialProfile,
  initialTasks,
} from './demo-data'
import type { DemoActivity, DemoList, DemoMessage, DemoNote, DemoProfile, DemoTask } from './demo-data'
import type { Language } from './i18n'

export type Theme = 'light' | 'dark' | 'system'
export type ToastItem = { id: number; message: string; kind: 'success' | 'info' | 'error' }

interface PreviewContextValue {
  language: Language
  setLanguage: Dispatch<SetStateAction<Language>>
  theme: Theme
  setTheme: Dispatch<SetStateAction<Theme>>
  tasks: DemoTask[]
  setTasks: Dispatch<SetStateAction<DemoTask[]>>
  lists: DemoList[]
  setLists: Dispatch<SetStateAction<DemoList[]>>
  notes: DemoNote[]
  setNotes: Dispatch<SetStateAction<DemoNote[]>>
  messages: DemoMessage[]
  setMessages: Dispatch<SetStateAction<DemoMessage[]>>
  activities: DemoActivity[]
  profile: DemoProfile
  setProfile: Dispatch<SetStateAction<DemoProfile>>
  notificationPrefs: Record<string, boolean>
  setNotificationPrefs: Dispatch<SetStateAction<Record<string, boolean>>>
  quietStart: string
  setQuietStart: Dispatch<SetStateAction<string>>
  quietEnd: string
  setQuietEnd: Dispatch<SetStateAction<string>>
  resetEnabled: boolean
  setResetEnabled: Dispatch<SetStateAction<boolean>>
  resetTime: string
  setResetTime: Dispatch<SetStateAction<string>>
  unreadCount: number
  setUnreadCount: Dispatch<SetStateAction<number>>
  toasts: ToastItem[]
  notify: (message: string, kind?: ToastItem['kind']) => void
}

const PreviewContext = createContext<PreviewContextValue | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('bn')
  const [theme, setTheme] = useState<Theme>('light')
  const [tasks, setTasks] = useState(initialTasks)
  const [lists, setLists] = useState(initialLists)
  const [notes, setNotes] = useState(initialNotes)
  const [messages, setMessages] = useState(initialMessages)
  const [profile, setProfile] = useState(initialProfile)
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({ taskStart: true, upcoming: true, chat: true, dailySummary: false })
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('07:00')
  const [resetEnabled, setResetEnabled] = useState(true)
  const [resetTime, setResetTime] = useState('00:00')
  const [unreadCount, setUnreadCount] = useState(2)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn-BD' : 'en'
  }, [language])

  useEffect(() => {
    const root = document.documentElement
    if (theme !== 'system') {
      root.dataset.theme = theme
      return
    }
    if (typeof window.matchMedia !== 'function') {
      root.dataset.theme = 'light'
      return
    }
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const applySystemTheme = () => { root.dataset.theme = preference.matches ? 'dark' : 'light' }
    applySystemTheme()
    preference.addEventListener?.('change', applySystemTheme)
    return () => preference.removeEventListener?.('change', applySystemTheme)
  }, [theme])

  const notify = useCallback((message: string, kind: ToastItem['kind'] = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current.slice(-2), { id, message, kind }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3400)
  }, [])

  const value = useMemo<PreviewContextValue>(() => ({
    language, setLanguage, theme, setTheme,
    tasks, setTasks, lists, setLists, notes, setNotes,
    messages, setMessages, activities: initialActivities,
    profile, setProfile,
    notificationPrefs, setNotificationPrefs,
    quietStart, setQuietStart, quietEnd, setQuietEnd,
    resetEnabled, setResetEnabled, resetTime, setResetTime,
    unreadCount, setUnreadCount, toasts, notify,
  }), [language, theme, tasks, lists, notes, messages, profile, notificationPrefs, quietStart, quietEnd, resetEnabled, resetTime, unreadCount, toasts, notify])

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}

export function usePreview() {
  const value = useContext(PreviewContext)
  if (!value) throw new Error('usePreview must be used within PreviewProvider')
  return value
}
