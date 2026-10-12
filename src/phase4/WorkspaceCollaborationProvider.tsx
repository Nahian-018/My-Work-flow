import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  cacheWorkspaceRecords,
  enqueueWorkspaceOperation,
  getPendingWorkspaceOperations,
  markWorkspaceOperationConflict,
  readCachedWorkspaceRecords,
  removeWorkspaceOperation,
  updateWorkspaceOperationVersion,
} from '../lib/offline-task-store'
import type { PendingWorkspaceOperation } from '../lib/offline-task-store'
import { newOperationId } from '../lib/task-service'

export interface ChatMessage {
  id: string
  workspace_id: string
  sender_id: string
  client_operation_id: string
  body: string
  created_at: string
  read_by: string[]
  local_only?: boolean
}

export interface WorkspaceNote {
  id: string
  workspace_id: string
  owner_id: string
  visibility: 'private' | 'shared'
  title: string
  body: string
  category: string
  is_pinned: boolean
  version: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  local_only?: boolean
}

export interface NoteDraft {
  title: string
  body: string
  category: string
  visibility: 'private' | 'shared'
  is_pinned: boolean
}

type LoadState = 'loading' | 'connected' | 'offline' | 'error'
interface WorkspaceCollaborationValue {
  chatMessages: ChatMessage[]
  chatState: LoadState
  chatRealtimeConnected: boolean
  chatError: string
  chatUnreadCount: number
  chatHasMore: boolean
  chatPendingCount: number
  refreshChat: () => Promise<void>
  loadEarlierChat: () => Promise<void>
  sendChatMessage: (body: string, operationId: string) => Promise<void>
  markChatRead: () => Promise<void>
  notes: WorkspaceNote[]
  notesState: LoadState
  notesError: string
  notePendingCount: number
  noteConflicts: PendingWorkspaceOperation[]
  refreshNotes: () => Promise<void>
  saveNote: (note: WorkspaceNote | null, draft: NoteDraft, noteId: string, operationId: string) => Promise<void>
  deleteNote: (note: WorkspaceNote, operationId: string) => Promise<void>
  retryNoteConflict: (operation: PendingWorkspaceOperation) => Promise<void>
  discardOperation: (operation: PendingWorkspaceOperation) => Promise<void>
  syncPending: () => Promise<void>
}

const WorkspaceCollaborationContext = createContext<WorkspaceCollaborationValue | null>(null)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error ? String(error.message)
      : String(error)
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return /failed to fetch|network|fetch failed|offline|load failed|timeout/i.test(errorMessage(error))
}

function mergeById<T extends { id: string }>(left: T[], right: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of left) map.set(item.id, item)
  for (const item of right) map.set(item.id, item)
  return [...map.values()]
}

export function countUnreadMessages(messages: ChatMessage[], userId: string): number {
  return messages.filter((message) => message.sender_id !== userId && !message.read_by.includes(userId)).length
}

export function sortWorkspaceNotes(notes: WorkspaceNote[]): WorkspaceNote[] {
  return [...notes].sort((left, right) => Number(right.is_pinned) - Number(left.is_pinned)
    || right.updated_at.localeCompare(left.updated_at)
    || left.title.localeCompare(right.title))
}

function overlayPendingChat(messages: ChatMessage[], operations: PendingWorkspaceOperation[], userId: string, workspaceId: string) {
  let visible = [...messages]
  for (const operation of operations.filter((entry) => entry.action === 'mark_chat_read')) {
    const ids = new Set(Array.isArray(operation.payload.messageIds) ? operation.payload.messageIds.map(String) : [])
    visible = visible.map((message) => ids.has(message.id) ? { ...message, read_by: [...new Set([...message.read_by, userId])] } : message)
  }
  const pending = operations.filter((operation) => operation.action === 'send_chat_message')
    .map((operation): ChatMessage => ({
      id: `local:${operation.operationId}`,
      workspace_id: workspaceId,
      sender_id: userId,
      client_operation_id: operation.operationId,
      body: String(operation.payload.body ?? ''),
      created_at: new Date(operation.createdAt).toISOString(),
      read_by: [userId],
      local_only: true,
    }))
  return mergeById(visible, pending).sort((left, right) => left.created_at.localeCompare(right.created_at))
}

function overlayPendingNotes(notes: WorkspaceNote[], operations: PendingWorkspaceOperation[], userId: string, workspaceId: string) {
  let result = [...notes]
  for (const operation of operations.filter((entry) => entry.entityType === 'workspace_note')) {
    if (operation.action === 'delete_workspace_note') {
      result = result.filter((note) => note.id !== operation.recordId)
    } else if (operation.action === 'upsert_workspace_note') {
      const previous = result.find((note) => note.id === operation.recordId)
      const payload = operation.payload
      const optimistic: WorkspaceNote = {
        id: operation.recordId,
        workspace_id: workspaceId,
        owner_id: previous?.owner_id ?? userId,
        visibility: payload.visibility === 'shared' ? 'shared' : 'private',
        title: String(payload.title ?? ''),
        body: String(payload.body ?? ''),
        category: String(payload.category ?? 'general'),
        is_pinned: Boolean(payload.is_pinned),
        version: previous?.version ?? 1,
        created_at: previous?.created_at ?? new Date(operation.createdAt).toISOString(),
        updated_at: new Date(operation.createdAt).toISOString(),
        deleted_at: null,
        local_only: true,
      }
      result = mergeById(result, [optimistic])
    }
  }
  return sortWorkspaceNotes(result)
}

function readMessageRows(rows: Array<Record<string, unknown>>, reads: Array<Record<string, unknown>>): ChatMessage[] {
  const readByMessage = new Map<string, string[]>()
  for (const receipt of reads) {
    const messageId = String(receipt.message_id)
    readByMessage.set(messageId, [...(readByMessage.get(messageId) ?? []), String(receipt.reader_id)])
  }
  return rows.map((row) => ({
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    sender_id: String(row.sender_id),
    client_operation_id: String(row.client_operation_id),
    body: String(row.body),
    created_at: String(row.created_at),
    read_by: readByMessage.get(String(row.id)) ?? [],
  }))
}

function unwrapRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return data && typeof data === 'object' ? data as T : null
}

export function WorkspaceCollaborationProvider({ children }: { children: ReactNode }) {
  const { client, user, membership } = useAuth()
  const userId = user?.id ?? ''
  const workspaceId = membership?.workspace_id ?? ''
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatState, setChatState] = useState<LoadState>('loading')
  const [chatRealtimeConnected, setChatRealtimeConnected] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const [chatHasMore, setChatHasMore] = useState(false)
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [notesState, setNotesState] = useState<LoadState>('loading')
  const [notesError, setNotesError] = useState('')
  const [pendingOperations, setPendingOperations] = useState<PendingWorkspaceOperation[]>([])
  const [notesLoaded, setNotesLoaded] = useState(false)
  const [chatLoaded, setChatLoaded] = useState(false)
  const syncing = useRef(false)
  const reading = useRef(false)
  const chatMessagesRef = useRef<ChatMessage[]>([])
  chatMessagesRef.current = chatMessages

  const refreshPending = useCallback(async () => {
    if (!userId) return
    const operations = await getPendingWorkspaceOperations(userId).catch(() => [])
    setPendingOperations(operations)
    return operations
  }, [userId])

  const refreshChat = useCallback(async () => {
    if (!userId || !workspaceId) return
    setChatError('')
    if (!navigator.onLine) {
      const [cached, operations] = await Promise.all([
        readCachedWorkspaceRecords<ChatMessage>(userId, 'chat').catch(() => []),
        getPendingWorkspaceOperations(userId).catch(() => []),
      ])
      setChatMessages(overlayPendingChat(cached, operations, userId, workspaceId))
      setChatUnreadCount(countUnreadMessages(cached, userId))
      setChatHasMore(cached.length >= 500)
      setChatState('offline')
      setChatLoaded(true)
      setPendingOperations(operations)
      return
    }

    setChatState((current) => current === 'connected' ? 'connected' : 'loading')
    try {
      const { data, error } = await client.from('chat_messages')
        .select('id,workspace_id,sender_id,client_operation_id,body,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      const rows = (data ?? []) as Array<Record<string, unknown>>
      const ids = rows.map((row) => String(row.id))
      let receiptRows: Array<Record<string, unknown>> = []
      if (ids.length) {
        const receipts = await client.from('chat_read_receipts')
          .select('message_id,reader_id,read_at')
          .eq('workspace_id', workspaceId)
          .in('message_id', ids)
        if (receipts.error) throw receipts.error
        receiptRows = (receipts.data ?? []) as Array<Record<string, unknown>>
      }
      const recent = readMessageRows(rows.reverse(), receiptRows)
      const firstRecent = recent[0]?.created_at
      const existingOlder = firstRecent
        ? chatMessagesRef.current.filter((message) => !message.local_only && message.created_at < firstRecent)
        : []
      const { data: countData, error: countError } = await client.rpc('get_chat_unread_count')
      if (countError) throw countError
      const operations = await getPendingWorkspaceOperations(userId).catch(() => [])
      const merged = overlayPendingChat(mergeById(existingOlder, recent), operations, userId, workspaceId)
      setChatMessages(merged)
      setChatUnreadCount(Number(countData ?? countUnreadMessages(merged, userId)))
      setChatHasMore(rows.length === 500)
      setPendingOperations(operations)
      setChatState('connected')
      setChatLoaded(true)
      await cacheWorkspaceRecords(userId, 'chat', merged).catch(() => undefined)
    } catch (error) {
      if (!isNetworkError(error)) {
        setChatMessages([])
        setChatUnreadCount(0)
        setChatHasMore(false)
        setChatState('error')
        setChatError(`Chat load হয়নি: ${errorMessage(error)}`)
        return
      }
      const [cached, operations] = await Promise.all([
        readCachedWorkspaceRecords<ChatMessage>(userId, 'chat').catch(() => []),
        getPendingWorkspaceOperations(userId).catch(() => []),
      ])
      setChatMessages(overlayPendingChat(cached, operations, userId, workspaceId))
      setChatUnreadCount(countUnreadMessages(cached, userId))
      setChatState('offline')
      setChatLoaded(true)
      setPendingOperations(operations)
      setChatError('Server-এ পৌঁছানো যায়নি; cached message এই device-এ দেখানো হচ্ছে।')
    }
  }, [client, userId, workspaceId])

  const refreshNotes = useCallback(async () => {
    if (!userId || !workspaceId) return
    setNotesError('')
    if (!navigator.onLine) {
      const [cached, operations] = await Promise.all([
        readCachedWorkspaceRecords<WorkspaceNote>(userId, 'notes').catch(() => []),
        getPendingWorkspaceOperations(userId).catch(() => []),
      ])
      setNotes(overlayPendingNotes(cached, operations, userId, workspaceId))
      setNotesState('offline')
      setNotesLoaded(true)
      setPendingOperations(operations)
      return
    }

    setNotesState((current) => current === 'connected' ? 'connected' : 'loading')
    try {
      const { data, error } = await client.from('workspace_notes')
        .select('id,workspace_id,owner_id,visibility,title,body,category,is_pinned,version,created_at,updated_at,deleted_at')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      const serverRows = sortWorkspaceNotes((data ?? []) as WorkspaceNote[])
      const operations = await getPendingWorkspaceOperations(userId).catch(() => [])
      const merged = overlayPendingNotes(serverRows, operations, userId, workspaceId)
      setNotes(merged)
      setNotesState('connected')
      setNotesLoaded(true)
      setPendingOperations(operations)
      await cacheWorkspaceRecords(userId, 'notes', serverRows).catch(() => undefined)
    } catch (error) {
      if (!isNetworkError(error)) {
        setNotes([])
        setNotesState('error')
        setNotesError(`Notes load হয়নি: ${errorMessage(error)}`)
        return
      }
      const [cached, operations] = await Promise.all([
        readCachedWorkspaceRecords<WorkspaceNote>(userId, 'notes').catch(() => []),
        getPendingWorkspaceOperations(userId).catch(() => []),
      ])
      setNotes(overlayPendingNotes(cached, operations, userId, workspaceId))
      setNotesState('offline')
      setNotesLoaded(true)
      setPendingOperations(operations)
      setNotesError('Server-এ পৌঁছানো যায়নি; RLS-এ আগে দৃশ্যমান cached note এই device-এ দেখানো হচ্ছে।')
    }
  }, [client, userId, workspaceId])

  const syncPending = useCallback(async () => {
    if (!userId || !workspaceId || !navigator.onLine || syncing.current) return
    syncing.current = true
    setChatError('')
    setNotesError('')
    let shouldRefreshChat = chatLoaded
    let shouldRefreshNotes = notesLoaded
    try {
      const operations = await getPendingWorkspaceOperations(userId)
      setPendingOperations(operations)
      for (const operation of operations) {
        if (operation.state === 'conflict') continue
        if (operation.action === 'send_chat_message' || operation.action === 'mark_chat_read') shouldRefreshChat = true
        if (operation.entityType === 'workspace_note') shouldRefreshNotes = true
        let rpcError: { message: string } | null = null
        try {
          if (operation.action === 'send_chat_message') {
            const result = await client.rpc('send_chat_message', {
              p_body: String(operation.payload.body ?? ''),
              p_operation_id: operation.operationId,
            })
            rpcError = result.error
          } else if (operation.action === 'mark_chat_read') {
            const result = await client.rpc('mark_chat_messages_read', {
              p_message_ids: Array.isArray(operation.payload.messageIds) ? operation.payload.messageIds : [],
            })
            rpcError = result.error
          } else if (operation.action === 'upsert_workspace_note') {
            const result = await client.rpc('upsert_workspace_note', {
              p_note_id: operation.recordId,
              p_title: String(operation.payload.title ?? ''),
              p_body: String(operation.payload.body ?? ''),
              p_category: String(operation.payload.category ?? 'general'),
              p_visibility: operation.payload.visibility === 'shared' ? 'shared' : 'private',
              p_is_pinned: Boolean(operation.payload.is_pinned),
              p_expected_version: operation.expectedVersion,
              p_operation_id: operation.operationId,
            })
            rpcError = result.error
          } else if (operation.action === 'delete_workspace_note') {
            const result = await client.rpc('delete_workspace_note', {
              p_note_id: operation.recordId,
              p_expected_version: operation.expectedVersion,
              p_operation_id: operation.operationId,
            })
            rpcError = result.error
          }
        } catch (requestError) {
          if (isNetworkError(requestError)) break
          rpcError = { message: errorMessage(requestError) }
        }
        if (rpcError) {
          if (rpcError.message.includes('NOTE_VERSION_CONFLICT')) {
            await markWorkspaceOperationConflict(operation.operationId, 'Server note version বদলে গেছে; local edit overwrite না করে user-এর সিদ্ধান্ত দরকার।')
          }
          if (isNetworkError(rpcError)) break
          if (operation.entityType === 'workspace_note') setNotesError(`Offline note sync হয়নি: ${rpcError.message}`)
          else setChatError(`Offline chat sync হয়নি: ${rpcError.message}`)
          continue
        }
        await removeWorkspaceOperation(operation.operationId)
      }
    } catch (error) {
      if (isNetworkError(error)) setChatError('Network পাওয়া যাচ্ছে না; pending changes এই device-এ রাখা হয়েছে।')
      else setChatError(`Sync queue পড়া যায়নি: ${errorMessage(error)}`)
    } finally {
      syncing.current = false
      await refreshPending()
      if (navigator.onLine) {
        if (shouldRefreshChat) await refreshChat()
        if (shouldRefreshNotes) await refreshNotes()
      }
    }
  }, [chatLoaded, client, notesLoaded, refreshChat, refreshNotes, refreshPending, userId, workspaceId])

  useEffect(() => {
    void refreshChat()
    void refreshNotes()
  }, [refreshChat, refreshNotes])

  const pendingSignature = pendingOperations.filter((operation) => operation.state === 'pending')
    .map((operation) => operation.operationId).join('|')
  useEffect(() => {
    if (pendingSignature && navigator.onLine) void syncPending()
  }, [pendingSignature, syncPending])

  useEffect(() => {
    const refreshOnNetwork = () => {
      if (navigator.onLine) {
        void syncPending()
        void refreshChat()
        void refreshNotes()
      } else {
        void refreshChat()
        void refreshNotes()
      }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshOnNetwork() }
    window.addEventListener('online', refreshOnNetwork)
    window.addEventListener('offline', refreshOnNetwork)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('online', refreshOnNetwork)
      window.removeEventListener('offline', refreshOnNetwork)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshChat, refreshNotes, syncPending])

  useEffect(() => {
    if (!workspaceId || typeof client.channel !== 'function') {
      setChatRealtimeConnected(false)
      return
    }
    setChatRealtimeConnected(false)
    const channel = client.channel(`smartflow-phase4-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (navigator.onLine) void refreshChat()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_read_receipts', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (navigator.onLine) void refreshChat()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_notes', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (navigator.onLine) void refreshNotes()
      })
      .subscribe((status) => setChatRealtimeConnected(status === 'SUBSCRIBED'))
    return () => { void client.removeChannel(channel) }
  }, [client, refreshChat, refreshNotes, workspaceId])

  const sendChatMessage = useCallback(async (body: string, operationId: string) => {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > 5000) throw new Error('বার্তা ১ থেকে ৫০০০ অক্ষরের মধ্যে দিন।')
    if (!navigator.onLine) {
      const operation = await enqueueWorkspaceOperation({
        operationId, userId, workspaceId, entityType: 'chat_message', action: 'send_chat_message',
        recordId: operationId, expectedVersion: null, payload: { body: trimmed },
      })
      if (!operation) return
      setChatMessages((current) => overlayPendingChat(current, [operation], userId, workspaceId))
      setChatState('offline')
      setChatError('বার্তাটি এই browser-এর offline queue-তে আছে; অন্য সদস্য এখনো পাননি।')
      await refreshPending()
      await cacheWorkspaceRecords(userId, 'chat', chatMessages).catch(() => undefined)
      return
    }
    const { data, error } = await client.rpc('send_chat_message', { p_body: trimmed, p_operation_id: operationId })
    if (error && !isNetworkError(error)) throw new Error(error.message)
    if (error) {
      const operation = await enqueueWorkspaceOperation({
        operationId, userId, workspaceId, entityType: 'chat_message', action: 'send_chat_message',
        recordId: operationId, expectedVersion: null, payload: { body: trimmed },
      })
      if (operation) setChatMessages((current) => overlayPendingChat(current, [operation], userId, workspaceId))
      setChatState('offline')
      setChatError('Network বিচ্ছিন্ন; বার্তাটি local queue-তে রাখা হয়েছে, অন্য সদস্য এখনো পাননি।')
      await refreshPending()
      return
    }
    const row = unwrapRow<Record<string, unknown>>(data)
    if (row) {
      const sent = readMessageRows([row], []).map((message) => ({ ...message, read_by: [userId] }))[0]
      setChatMessages((current) => mergeById(current.filter((message) => message.client_operation_id !== operationId), [sent])
        .sort((left, right) => left.created_at.localeCompare(right.created_at)))
      setChatState('connected')
      setChatError('')
      await cacheWorkspaceRecords(userId, 'chat', chatMessages).catch(() => undefined)
      await refreshChat()
    }
  }, [chatMessages, client, refreshChat, refreshPending, userId, workspaceId])

  const markChatRead = useCallback(async () => {
    if (!userId || reading.current) return
    const messageIds = chatMessages.filter((message) => message.sender_id !== userId
      && !message.read_by.includes(userId) && !message.local_only).map((message) => message.id)
    if (!messageIds.length) return
    reading.current = true
    try {
      if (!navigator.onLine) {
        const operationId = newOperationId()
        await enqueueWorkspaceOperation({
          operationId, userId, workspaceId, entityType: 'chat_read_receipt', action: 'mark_chat_read',
          recordId: operationId, expectedVersion: null, payload: { messageIds },
        })
      } else {
        const { error } = await client.rpc('mark_chat_messages_read', { p_message_ids: messageIds })
        if (error && !isNetworkError(error)) throw error
        if (error) {
          const operationId = newOperationId()
          await enqueueWorkspaceOperation({
            operationId, userId, workspaceId, entityType: 'chat_read_receipt', action: 'mark_chat_read',
            recordId: operationId, expectedVersion: null, payload: { messageIds },
          })
        }
      }
      setChatMessages((current) => current.map((message) => messageIds.includes(message.id)
        ? { ...message, read_by: [...new Set([...message.read_by, userId])] }
        : message))
      setChatUnreadCount((count) => Math.max(0, count - messageIds.length))
      await refreshPending()
    } catch (error) {
      setChatError(`Read receipt save হয়নি: ${errorMessage(error)}`)
    } finally {
      reading.current = false
    }
  }, [chatMessages, client, refreshPending, userId, workspaceId])

  const loadEarlierChat = useCallback(async () => {
    if (!chatMessages.length || !navigator.onLine || !chatHasMore) return
    const firstMessage = chatMessages.find((message) => !message.local_only)
    if (!firstMessage) return
    const { data, error } = await client.from('chat_messages')
      .select('id,workspace_id,sender_id,client_operation_id,body,created_at')
      .eq('workspace_id', workspaceId)
      .lt('created_at', firstMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) { setChatError(`পুরোনো message load হয়নি: ${error.message}`); return }
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const ids = rows.map((row) => String(row.id))
    let reads: Array<Record<string, unknown>> = []
    if (ids.length) {
      const receiptResult = await client.from('chat_read_receipts').select('message_id,reader_id,read_at')
        .eq('workspace_id', workspaceId).in('message_id', ids)
      if (receiptResult.error) { setChatError(`Read state load হয়নি: ${receiptResult.error.message}`); return }
      reads = (receiptResult.data ?? []) as Array<Record<string, unknown>>
    }
    const earlier = readMessageRows(rows.reverse(), reads)
    setChatMessages((current) => mergeById(earlier, current).sort((left, right) => left.created_at.localeCompare(right.created_at)))
    setChatHasMore(rows.length === 500)
    await cacheWorkspaceRecords(userId, 'chat', mergeById(earlier, chatMessages)).catch(() => undefined)
  }, [chatHasMore, chatMessages, client, userId, workspaceId])

  const saveNote = useCallback(async (note: WorkspaceNote | null, draft: NoteDraft, noteId: string, operationId: string) => {
    const cleanDraft = {
      title: draft.title.trim(), body: draft.body, category: draft.category.trim() || 'general',
      visibility: draft.visibility, is_pinned: draft.is_pinned,
    }
    if (!cleanDraft.title || cleanDraft.title.length > 200 || cleanDraft.body.length > 10000 || cleanDraft.category.length > 80) {
      throw new Error('Note title/category/body-এর সীমা মানুন।')
    }
    if (navigator.onLine) {
      const { data, error } = await client.rpc('upsert_workspace_note', {
        p_note_id: noteId,
        p_title: cleanDraft.title,
        p_body: cleanDraft.body,
        p_category: cleanDraft.category,
        p_visibility: cleanDraft.visibility,
        p_is_pinned: cleanDraft.is_pinned,
        p_expected_version: note?.version ?? null,
        p_operation_id: operationId,
      })
      if (!error) {
        const saved = unwrapRow<WorkspaceNote>(data)
        if (saved) setNotes((current) => sortWorkspaceNotes(mergeById(current, [saved])))
        setNotesState('connected')
        setNotesError('')
        await refreshNotes()
        return
      }
      if (!isNetworkError(error)) throw new Error(error.message)
    }
    const operation = await enqueueWorkspaceOperation({
      operationId, userId, workspaceId, entityType: 'workspace_note', action: 'upsert_workspace_note',
      recordId: noteId, expectedVersion: note?.version ?? null, payload: cleanDraft,
    })
    if (operation) {
      setNotes((current) => overlayPendingNotes(current, [operation], userId, workspaceId))
      setNotesState('offline')
      setNotesError('Note এই browser-এর offline queue-তে আছে; sync না হওয়া পর্যন্ত অন্য সদস্য দেখবেন না।')
    }
    await refreshPending()
    await cacheWorkspaceRecords(userId, 'notes', notes).catch(() => undefined)
  }, [client, notes, refreshNotes, refreshPending, userId, workspaceId])

  const deleteNote = useCallback(async (note: WorkspaceNote, operationId: string) => {
    if (navigator.onLine && !note.local_only) {
      const { error } = await client.rpc('delete_workspace_note', {
        p_note_id: note.id, p_expected_version: note.version, p_operation_id: operationId,
      })
      if (!error) {
        setNotes((current) => current.filter((item) => item.id !== note.id))
        setNotesError('')
        await refreshNotes()
        return
      }
      if (!isNetworkError(error)) throw new Error(error.message)
    }
    const operation = await enqueueWorkspaceOperation({
      operationId, userId, workspaceId, entityType: 'workspace_note', action: 'delete_workspace_note',
      recordId: note.id, expectedVersion: note.local_only ? null : note.version, payload: {},
    })
    setNotes((current) => current.filter((item) => item.id !== note.id))
    setNotesState('offline')
    setNotesError(operation ? 'Delete এই browser-এর offline queue-তে আছে; server confirmation বাকি।' : '')
    await refreshPending()
    await cacheWorkspaceRecords(userId, 'notes', notes.filter((item) => item.id !== note.id)).catch(() => undefined)
  }, [client, notes, refreshNotes, refreshPending, userId, workspaceId])

  const retryNoteConflict = useCallback(async (operation: PendingWorkspaceOperation) => {
    if (operation.entityType !== 'workspace_note' || !navigator.onLine) return
    const { data, error } = await client.from('workspace_notes')
      .select('id,workspace_id,owner_id,visibility,title,body,category,is_pinned,version,created_at,updated_at,deleted_at')
      .eq('id', operation.recordId).eq('workspace_id', workspaceId).maybeSingle()
    if (error || !data) {
      setNotesError(`সর্বশেষ note version পড়া যায়নি: ${error?.message ?? 'Note access নেই বা মুছে গেছে।'}`)
      return
    }
    await updateWorkspaceOperationVersion(operation.operationId, Number(data.version))
    setNotesError('সর্বশেষ version-এর উপর local পরিবর্তন আবার sync করার জন্য প্রস্তুত।')
    await refreshPending()
    await syncPending()
  }, [client, refreshPending, syncPending, workspaceId])

  const discardOperation = useCallback(async (operation: PendingWorkspaceOperation) => {
    await removeWorkspaceOperation(operation.operationId)
    await refreshPending()
    await refreshChat()
    await refreshNotes()
    setNotesError('Queued note পরিবর্তন বাতিল করে server-এর বর্তমান দৃশ্যমান data লোড করা হয়েছে।')
  }, [refreshChat, refreshNotes, refreshPending])

  const noteConflicts = pendingOperations.filter((operation) => operation.entityType === 'workspace_note' && operation.state === 'conflict')
  const chatPendingCount = pendingOperations.filter((operation) => operation.entityType !== 'workspace_note').length
  const notePendingCount = pendingOperations.filter((operation) => operation.entityType === 'workspace_note').length

  const value = useMemo<WorkspaceCollaborationValue>(() => ({
    chatMessages, chatState, chatRealtimeConnected, chatError, chatUnreadCount, chatHasMore, chatPendingCount,
    refreshChat, loadEarlierChat, sendChatMessage, markChatRead,
    notes, notesState, notesError, notePendingCount, noteConflicts, refreshNotes,
    saveNote, deleteNote, retryNoteConflict, discardOperation, syncPending,
  }), [chatMessages, chatState, chatRealtimeConnected, chatError, chatUnreadCount, chatHasMore, chatPendingCount, refreshChat, loadEarlierChat,
    sendChatMessage, markChatRead, notes, notesState, notesError, notePendingCount, noteConflicts, refreshNotes,
    saveNote, deleteNote, retryNoteConflict, discardOperation, syncPending])

  return <WorkspaceCollaborationContext.Provider value={value}>{children}</WorkspaceCollaborationContext.Provider>
}

export function useWorkspaceCollaboration() {
  const value = useContext(WorkspaceCollaborationContext)
  if (!value) throw new Error('useWorkspaceCollaboration must be used inside WorkspaceCollaborationProvider')
  return value
}
