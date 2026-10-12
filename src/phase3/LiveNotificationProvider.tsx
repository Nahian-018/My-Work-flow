import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { claimNotificationReceipt, releaseNotificationReceipt } from '../lib/offline-task-store'
import type { LiveTask } from '../lib/task-service'
import { useLiveTasks } from './LiveTaskProvider'

export interface NotificationPreferences {
  user_id: string
  workspace_id: string
  pre_start_enabled: boolean
  task_start_enabled: boolean
  overdue_enabled: boolean
  upcoming_enabled: boolean
  daily_summary_enabled: boolean
  daily_summary_time: string
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  updated_at: string
}

export type PreferenceKey = 'pre_start_enabled' | 'task_start_enabled' | 'overdue_enabled' | 'upcoming_enabled' | 'daily_summary_enabled' | 'daily_summary_time' | 'quiet_hours_enabled' | 'quiet_hours_start' | 'quiet_hours_end'
type Permission = NotificationPermission | 'unsupported'
interface NotificationContextValue {
  preferences: NotificationPreferences | null
  preferenceState: 'loading' | 'ready' | 'error'
  preferenceError: string
  permission: Permission
  savePreference: (key: PreferenceKey, value: boolean | string) => Promise<void>
  requestPermission: () => Promise<void>
  reloadPreferences: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)
const dhakaClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function defaultPreferences(userId: string, workspaceId: string): NotificationPreferences {
  return {
    user_id: userId,
    workspace_id: workspaceId,
    pre_start_enabled: true,
    task_start_enabled: true,
    overdue_enabled: true,
    upcoming_enabled: true,
    daily_summary_enabled: true,
    daily_summary_time: '20:00:00',
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    updated_at: new Date().toISOString(),
  }
}

export function LiveNotificationProvider({ children }: { children: ReactNode }) {
  const { client, user, membership } = useAuth()
  const { tasks } = useLiveTasks()
  const navigate = useNavigate()
  const userId = user?.id ?? ''
  const workspaceId = membership?.workspace_id ?? ''
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [preferenceState, setPreferenceState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [preferenceError, setPreferenceError] = useState('')
  const [permission, setPermission] = useState<Permission>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  const reloadPreferences = useCallback(async () => {
    if (!userId || !workspaceId) return
    setPreferenceState('loading')
    setPreferenceError('')
    const { data, error } = await client.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
    if (error) {
      setPreferenceError(error.message)
      setPreferenceState('error')
      return
    }
    if (data) {
      setPreferences(data as NotificationPreferences)
      setPreferenceState('ready')
      return
    }
    const defaults = defaultPreferences(userId, workspaceId)
    const { data: inserted, error: insertError } = await client.from('notification_preferences').upsert(defaults, { onConflict: 'user_id' }).select('*').single()
    if (insertError) {
      setPreferenceError(insertError.message)
      setPreferenceState('error')
      return
    }
    setPreferences(inserted as NotificationPreferences)
    setPreferenceState('ready')
  }, [client, userId, workspaceId])

  useEffect(() => { void reloadPreferences() }, [reloadPreferences])

  const savePreference = useCallback(async (key: PreferenceKey, value: boolean | string) => {
    if (!userId || !preferences) throw new Error('Notification preference এখনো load হয়নি।')
    const { data, error } = await client.from('notification_preferences')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('*')
      .single()
    if (error) {
      setPreferenceError(error.message)
      throw error
    }
    setPreferences(data as NotificationPreferences)
    setPreferenceError('')
  }, [client, preferences, userId])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      return
    }
    const next = await Notification.requestPermission()
    setPermission(next)
  }, [])

  useEffect(() => {
    if (!preferences || preferenceState !== 'ready' || permission !== 'granted' || typeof Notification === 'undefined') return
    let cancelled = false
    const evaluate = async () => {
      const now = Date.now()
      if (preferences.quiet_hours_enabled && isQuietHours(now, preferences.quiet_hours_start, preferences.quiet_hours_end)) return
      for (const task of tasks) {
        if (cancelled || task.status === 'completed') continue
        const candidates = getDueNotifications(task, preferences, now)
        for (const candidate of candidates) {
          if (cancelled || now < candidate.at || now - candidate.at > candidate.maxAge) continue
          let claimed = false
          try {
            claimed = await claimNotificationReceipt(userId, candidate.key)
            if (!claimed) continue
            if (cancelled) {
              await releaseNotificationReceipt(userId, candidate.key)
              continue
            }
            const notification = new Notification(candidate.title, { body: candidate.body, tag: candidate.key, icon: '/icon.svg' })
            notification.onclick = () => {
              window.focus()
              navigate(`/tasks?focus=${encodeURIComponent(task.id)}`)
              notification.close()
            }
          } catch {
            if (claimed) await releaseNotificationReceipt(userId, candidate.key).catch(() => undefined)
            // Permission can change while the page is open; do not permanently deduplicate a failed display attempt.
          }
        }
      }
    }
    void evaluate()
    const interval = window.setInterval(() => void evaluate(), 15_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [navigate, permission, preferenceState, preferences, tasks, userId])

  const value = useMemo<NotificationContextValue>(() => ({
    preferences, preferenceState, preferenceError, permission, savePreference, requestPermission, reloadPreferences,
  }), [preferences, preferenceState, preferenceError, permission, savePreference, requestPermission, reloadPreferences])

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function getDueNotifications(task: LiveTask, preferences: NotificationPreferences, now: number) {
  if (task.status === 'completed') return []
  const start = new Date(task.planned_start_at).getTime()
  const end = new Date(task.planned_end_at).getTime()
  const reminder = task.reminder_at ? new Date(task.reminder_at).getTime() : null
  const candidates: Array<{ key: string; title: string; body: string; at: number; maxAge: number }> = []
  if (preferences.pre_start_enabled && reminder !== null && !task.actual_started_at) {
    candidates.push({ key: `${task.id}:pre_start:${task.reminder_at}`, title: `শুরু হওয়ার আগে: ${task.title}`, body: 'নির্ধারিত সময় কাছে এসেছে। Task দেখতে SmartFlow Duo খুলুন।', at: reminder, maxAge: 60 * 60_000 })
  }
  if (preferences.upcoming_enabled && !task.actual_started_at) {
    const upcomingAt = start - 15 * 60_000
    candidates.push({ key: `${task.id}:upcoming:${task.planned_start_at}`, title: `আসন্ন কাজ: ${task.title}`, body: 'পরিকল্পিত শুরুর সময় ১৫ মিনিটের মধ্যে।', at: upcomingAt, maxAge: 60 * 60_000 })
  }
  if (preferences.task_start_enabled && !task.actual_started_at) {
    candidates.push({ key: `${task.id}:start:${task.planned_start_at}`, title: `শুরুর সময়: ${task.title}`, body: 'নির্ধারিত কাজের সময় শুরু হয়েছে।', at: start, maxAge: 60 * 60_000 })
  }
  if (preferences.overdue_enabled && !task.actual_completed_at) {
    candidates.push({ key: `${task.id}:overdue:${task.planned_end_at}`, title: `সময় পেরিয়েছে: ${task.title}`, body: 'পরিকল্পিত সময় শেষ। Task status ও timer দেখুন।', at: end, maxAge: 24 * 60 * 60_000 })
  }
  return candidates.filter((candidate) => candidate.at <= now)
}

export function isQuietHours(now: number, startText: string, endText: string): boolean {
  const [hourText, minuteText] = dhakaClock.format(new Date(now)).split(':')
  const current = Number(hourText) * 60 + Number(minuteText)
  const [startHour, startMinute] = startText.split(':').map(Number)
  const [endHour, endMinute] = endText.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  if (start === end) return true
  return start < end ? current >= start && current < end : current >= start || current < end
}

export function useLiveNotifications() {
  const value = useContext(NotificationContext)
  if (!value) throw new Error('useLiveNotifications must be used inside LiveNotificationProvider')
  return value
}
