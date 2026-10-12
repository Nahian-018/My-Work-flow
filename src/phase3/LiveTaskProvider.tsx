import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  applyPendingStatus,
  cacheTasks,
  getPendingTaskStatuses,
  markQueuedStatusConflict,
  queueTaskStatus,
  readCachedTasks,
  removeQueuedStatus,
  updateQueuedStatusVersion,
} from '../lib/offline-task-store'
import type { PendingTaskStatus } from '../lib/offline-task-store'
import {
  changeTaskStatus,
  createLiveTask,
  deleteLiveTask,
  loadLiveTasks,
  newOperationId,
  pauseLiveTimer,
  resumeLiveTimer,
  startLiveTimer,
  stopLiveDailyRecurrence,
  updateLiveTask,
} from '../lib/task-service'
import type { LiveTask, TaskDraft } from '../lib/task-service'

type DataState = 'loading' | 'syncing' | 'connected' | 'offline' | 'error'
interface LiveTaskContextValue {
  tasks: LiveTask[]
  state: DataState
  online: boolean
  realtimeConnected: boolean
  error: string
  cacheWarning: string
  pendingOperations: PendingTaskStatus[]
  refresh: () => Promise<void>
  createTask: (draft: TaskDraft, operationId: string) => Promise<void>
  updateTask: (task: LiveTask, draft: TaskDraft, operationId: string) => Promise<void>
  deleteTask: (task: LiveTask, operationId: string) => Promise<void>
  setTaskStatus: (task: LiveTask, target: 'pending' | 'in_progress' | 'completed') => Promise<void>
  startTimer: (taskId: string) => Promise<void>
  pauseTimer: (taskId: string) => Promise<void>
  resumeTimer: (taskId: string) => Promise<void>
  stopRecurrence: (task: LiveTask, operationId: string) => Promise<void>
  retryConflict: (operation: PendingTaskStatus) => Promise<void>
  discardOperation: (operation: PendingTaskStatus) => Promise<void>
  dismissError: () => void
}

const LiveTaskContext = createContext<LiveTaskContextValue | null>(null)

function errorText(error: unknown): string {
  return error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error ? String(error.message)
      : String(error)
}

function messageForError(error: unknown): string {
  const text = errorText(error)
  if (text.includes('TASK_VERSION_CONFLICT')) return 'অন্য ব্যবহারকারীর পরিবর্তনের সঙ্গে এই কাজের version মেলেনি। সর্বশেষ data দেখে আবার চেষ্টা করুন।'
  if (text.includes('task_instances_one_running_timer_per_workspace')) return 'এই workspace-এ অন্য একটি task-এর timer চলছে। আগে সেটি pause বা complete করে আবার চেষ্টা করুন।'
  if (/failed to fetch|network|fetch failed|offline/i.test(text)) return 'Network connection পাওয়া যাচ্ছে না। Sync না-হওয়া পরিবর্তন এই device-এর IndexedDB queue-তে রাখা হয়েছে।'
  if (/permission denied|42501|unauthorized|not authorized/i.test(text)) return 'এই কাজের জন্য Database অনুমতি নেই। Workspace membership ও RLS policy পরীক্ষা করুন।'
  return `Database request সম্পন্ন হয়নি: ${text}`
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const text = error instanceof Error ? `${error.name} ${error.message}` : errorText(error)
  return /failed to fetch|network|fetch failed|offline|load failed|timeout/i.test(text)
}

function overlayQueuedStatuses(tasks: LiveTask[], operations: PendingTaskStatus[]): LiveTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  for (const operation of operations) {
    const task = byId.get(operation.taskId)
    if (task) byId.set(task.id, applyPendingStatus(task, operation.targetStatus))
  }
  return [...byId.values()]
}

export function LiveTaskProvider({ children }: { children: ReactNode }) {
  const { client, user, membership } = useAuth()
  const userId = user?.id ?? ''
  const workspaceId = membership?.workspace_id ?? ''
  const [tasks, setTasks] = useState<LiveTask[]>([])
  const [state, setState] = useState<DataState>('loading')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? false : navigator.onLine)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [error, setError] = useState('')
  const [cacheWarning, setCacheWarning] = useState('')
  const [pendingOperations, setPendingOperations] = useState<PendingTaskStatus[]>([])
  const loadedOnce = useRef(false)
  const refreshing = useRef(false)
  const statusOperationIds = useRef(new Map<string, string>())

  const refreshQueue = useCallback(async () => {
    if (!userId) return
    try { setPendingOperations(await getPendingTaskStatuses(userId)) }
    catch { setCacheWarning('এই browser-এর IndexedDB queue পড়া যায়নি; offline পরিবর্তন সংরক্ষিত নাও থাকতে পারে।') }
  }, [userId])

  const refresh = useCallback(async () => {
    if (!userId || refreshing.current) return
    refreshing.current = true
    setError('')
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnline(false)
      try {
        const [cached, queued] = await Promise.all([readCachedTasks(userId), getPendingTaskStatuses(userId)])
        setTasks(overlayQueuedStatuses(cached, queued))
        setPendingOperations(queued)
        setState('offline')
        setError(cached.length ? 'Offline view: এখানে আগে sync হওয়া task ও এই device-এর queued status দেখা যাচ্ছে।' : 'Offline অবস্থায় কোনো synced task cache পাওয়া যায়নি।')
      } catch (cacheError) {
        setState('error')
        setError(messageForError(cacheError))
      } finally {
        refreshing.current = false
      }
      await refreshQueue()
      return
    }

    setOnline(true)
    setState(loadedOnce.current ? 'syncing' : 'loading')
    try {
      const rows = await loadLiveTasks(client)
      setTasks(rows)
      setState('connected')
      loadedOnce.current = true
      try {
        await cacheTasks(userId, rows)
        setCacheWarning('')
      } catch {
        setCacheWarning('Cloud data লোড হয়েছে, কিন্তু এই browser-এ IndexedDB cache লেখা যায়নি।')
      }
      await refreshQueue()
    } catch (loadError) {
      if (!isNetworkError(loadError)) {
        setTasks([])
        setState('error')
        setError(messageForError(loadError))
        await refreshQueue()
        refreshing.current = false
        return
      }
      try {
        const [cached, queued] = await Promise.all([readCachedTasks(userId), getPendingTaskStatuses(userId)])
        setPendingOperations(queued)
        if (cached.length) {
          setTasks(overlayQueuedStatuses(cached, queued))
          setState('offline')
          setError('Server-এ যোগাযোগ হয়নি; শেষ sync হওয়া task ও device-এর queued status দেখানো হচ্ছে।')
        } else {
          setState('error')
          setError(messageForError(loadError))
        }
      } catch {
        setState('error')
        setError(messageForError(loadError))
      }
      await refreshQueue()
    } finally {
      refreshing.current = false
    }
  }, [client, refreshQueue, userId])

  const syncQueue = useCallback(async () => {
    if (!userId || typeof navigator !== 'undefined' && !navigator.onLine) return
    const queued = await getPendingTaskStatuses(userId).catch(() => [])
    setPendingOperations(queued)
    for (const operation of queued) {
      if (operation.state === 'conflict') break
      const { error: rpcError } = await client.rpc('set_task_status', {
        p_task_id: operation.taskId,
        p_target_status: operation.targetStatus,
        p_expected_version: operation.expectedVersion,
        p_operation_id: operation.operationId,
      })
      if (rpcError) {
        if (rpcError.message.includes('TASK_VERSION_CONFLICT')) {
          await markQueuedStatusConflict(operation.operationId, 'Server task version বদলে গেছে। সর্বশেষ data দেখে user-এর সিদ্ধান্ত দরকার।')
        }
        setError(messageForError(rpcError))
        break
      }
      await removeQueuedStatus(operation.operationId)
      for (const [key, operationId] of statusOperationIds.current) {
        if (operationId === operation.operationId) statusOperationIds.current.delete(key)
      }
    }
    await refreshQueue()
    await refresh()
  }, [client, refresh, refreshQueue, userId])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (state === 'connected' && online && pendingOperations.length > 0) void syncQueue()
  }, [online, pendingOperations.length, state, syncQueue])

  useEffect(() => {
    const setNetworkState = () => {
      const nextOnline = navigator.onLine
      setOnline(nextOnline)
      if (nextOnline) void syncQueue()
      else void refresh()
    }
    window.addEventListener('online', setNetworkState)
    window.addEventListener('offline', setNetworkState)
    const onFocus = () => { if (document.visibilityState === 'visible' && navigator.onLine) void syncQueue() }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('online', setNetworkState)
      window.removeEventListener('offline', setNetworkState)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh, syncQueue])

  useEffect(() => {
    if (!workspaceId) return
    const channel = client.channel(`smartflow-task-sync-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_instances', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (navigator.onLine) void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_events', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (navigator.onLine) void refresh()
      })
      .subscribe((status) => setRealtimeConnected(status === 'SUBSCRIBED'))
    return () => { void client.removeChannel(channel) }
  }, [client, refresh, workspaceId])

  const withOnlineMutation = useCallback(async (action: () => Promise<void>) => {
    if (!navigator.onLine) throw new Error('Offline অবস্থায় এই কাজটি সমর্থিত নয়; task status change queue করা যেতে পারে।')
    setError('')
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError(messageForError(actionError))
      throw actionError
    }
  }, [refresh])

  const createTask = useCallback((draft: TaskDraft, operationId: string) => withOnlineMutation(() => createLiveTask(client, draft, operationId)), [client, withOnlineMutation])
  const updateTask = useCallback((task: LiveTask, draft: TaskDraft, operationId: string) => withOnlineMutation(() => updateLiveTask(client, task, draft, operationId)), [client, withOnlineMutation])
  const deleteTask = useCallback((task: LiveTask, operationId: string) => withOnlineMutation(() => deleteLiveTask(client, task, operationId)), [client, withOnlineMutation])

  const setTaskStatus = useCallback(async (task: LiveTask, target: 'pending' | 'in_progress' | 'completed') => {
    const storedQueue = await getPendingTaskStatuses(userId).catch(() => [])
    const queuedForTask = storedQueue.find((operation) => operation.taskId === task.id)
    if (queuedForTask?.state === 'conflict') {
      const conflictError = new Error('এই task-এ আগে থেকেই sync conflict আছে; আগে retry বা বাতিল করুন।')
      setError(messageForError(conflictError))
      throw conflictError
    }
    if (queuedForTask) {
      await queueTaskStatus({
        operationId: queuedForTask.operationId,
        userId,
        taskId: task.id,
        targetStatus: target,
        expectedVersion: queuedForTask.expectedVersion,
      })
      setTasks((current) => current.map((row) => row.id === task.id ? { ...row, status: target, effective_status: target } : row))
      await refreshQueue()
      if (navigator.onLine) await syncQueue()
      else {
        setState('offline')
        setError('Task status এই device-এর IndexedDB queue-তে রাখা হয়েছে; অন্য device-এ sync হয়নি।')
      }
      return
    }

    const operationKey = `${task.id}:${target}`
    const operationId = statusOperationIds.current.get(operationKey) ?? newOperationId()
    statusOperationIds.current.set(operationKey, operationId)
    try {
      if (!navigator.onLine) throw new TypeError('offline')
      await changeTaskStatus(client, task, target, operationId)
      statusOperationIds.current.delete(operationKey)
      await refresh()
    } catch (statusError) {
      if (!isNetworkError(statusError)) {
        setError(messageForError(statusError))
        throw statusError
      }
      try {
        const operation = await queueTaskStatus({
          operationId,
          userId,
          taskId: task.id,
          targetStatus: target,
          expectedVersion: task.version,
        })
        statusOperationIds.current.delete(operationKey)
        setTasks((current) => current.map((row) => row.id === task.id ? { ...row, status: target, effective_status: target } : row))
        setPendingOperations((current) => [...current.filter((item) => item.operationId !== operation.operationId), operation])
        setState('offline')
        setError('Task status এই device-এর IndexedDB queue-তে রাখা হয়েছে; অন্য device-এ sync হয়নি। Network ফিরলে retry হবে।')
      } catch (queueError) {
        setError(`Offline queue-তে save হয়নি: ${messageForError(queueError)}`)
        throw queueError
      }
    }
  }, [client, refresh, refreshQueue, syncQueue, userId])

  const retryConflict = useCallback(async (operation: PendingTaskStatus) => {
    const latest = await client.from('task_instance_clock').select('version').eq('id', operation.taskId).maybeSingle()
    if (latest.error || !latest.data) {
      setError(messageForError(latest.error ?? new Error('Task পাওয়া যায়নি।')))
      return
    }
    await updateQueuedStatusVersion(operation.operationId, latest.data.version)
    setError('সর্বশেষ version-এর উপর আপনার queued status change আবার প্রয়োগের জন্য প্রস্তুত হয়েছে।')
    await syncQueue()
  }, [client, syncQueue])

  const discardOperation = useCallback(async (operation: PendingTaskStatus) => {
    await removeQueuedStatus(operation.operationId)
    await refreshQueue()
    await refresh()
    setError('Queued change বাতিল করা হয়েছে; server-এর সর্বশেষ data আবার লোড হয়েছে।')
  }, [refresh, refreshQueue])

  const startTimer = useCallback((taskId: string) => withOnlineMutation(() => startLiveTimer(client, taskId)), [client, withOnlineMutation])
  const pauseTimer = useCallback((taskId: string) => withOnlineMutation(() => pauseLiveTimer(client, taskId)), [client, withOnlineMutation])
  const resumeTimer = useCallback((taskId: string) => withOnlineMutation(() => resumeLiveTimer(client, taskId)), [client, withOnlineMutation])
  const stopRecurrence = useCallback((task: LiveTask, operationId: string) => withOnlineMutation(() => stopLiveDailyRecurrence(client, task, operationId)), [client, withOnlineMutation])
  const dismissError = useCallback(() => setError(''), [])

  const value = useMemo<LiveTaskContextValue>(() => ({
    tasks, state, online, realtimeConnected, error, cacheWarning, pendingOperations,
    refresh, createTask, updateTask, deleteTask, setTaskStatus, startTimer, pauseTimer, resumeTimer, stopRecurrence,
    retryConflict, discardOperation, dismissError,
  }), [tasks, state, online, realtimeConnected, error, cacheWarning, pendingOperations, refresh, createTask, updateTask, deleteTask, setTaskStatus, startTimer, pauseTimer, resumeTimer, stopRecurrence, retryConflict, discardOperation, dismissError])

  return <LiveTaskContext.Provider value={value}>{children}</LiveTaskContext.Provider>
}

export function useLiveTasks() {
  const value = useContext(LiveTaskContext)
  if (!value) throw new Error('useLiveTasks must be used inside LiveTaskProvider')
  return value
}
