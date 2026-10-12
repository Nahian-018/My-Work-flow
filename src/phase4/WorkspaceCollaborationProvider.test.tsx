import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { clearUserTaskData } from '../lib/offline-task-store'
import { WorkspaceCollaborationProvider, useWorkspaceCollaboration } from './WorkspaceCollaborationProvider'
import type { WorkspaceNote } from './WorkspaceCollaborationProvider'

const USER_ID = 'phase4-provider-user'
const WORKSPACE_ID = 'phase4-provider-workspace'
const CHAT_OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOTE_OPERATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))

let serverMessages: Array<Record<string, unknown>>
let serverReceipts: Array<Record<string, unknown>>
let serverNotes: WorkspaceNote[]
let client: {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  removeChannel: ReturnType<typeof vi.fn>
}
let noteWriteAttempts: number

function makeBuilder(table: string) {
  const builder: Record<string, any> = {}
  for (const method of ['select', 'eq', 'neq', 'order', 'is', 'lt']) builder[method] = vi.fn(() => builder)
  builder.in = vi.fn(() => Promise.resolve({ data: table === 'chat_read_receipts' ? [...serverReceipts] : [], error: null }))
  builder.limit = vi.fn(() => Promise.resolve({
    data: table === 'chat_messages' ? [...serverMessages]
      : table === 'workspace_notes' ? [...serverNotes]
        : [],
    error: null,
  }))
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: serverNotes[0] ?? null, error: null }))
  return builder
}

function makeClient() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      queueMicrotask(() => callback?.('SUBSCRIBED'))
      return channel
    }),
  }
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_chat_unread_count') return { data: 0, error: null }
    if (name === 'send_chat_message') {
      const prior = serverMessages.find((message) => message.client_operation_id === args.p_operation_id)
      if (prior) return { data: prior, error: null }
      const message = {
        id: `db-${String(args.p_operation_id)}`,
        workspace_id: WORKSPACE_ID,
        sender_id: USER_ID,
        client_operation_id: args.p_operation_id,
        body: args.p_body,
        created_at: new Date().toISOString(),
      }
      serverMessages.push(message)
      return { data: message, error: null }
    }
    if (name === 'mark_chat_messages_read') return { data: 0, error: null }
    if (name === 'upsert_workspace_note') {
      noteWriteAttempts += 1
      if (noteWriteAttempts === 1) return { data: null, error: { message: 'NOTE_VERSION_CONFLICT: test conflict' } }
      const updated: WorkspaceNote = {
        ...serverNotes[0],
        id: String(args.p_note_id),
        owner_id: USER_ID,
        workspace_id: WORKSPACE_ID,
        visibility: args.p_visibility === 'shared' ? 'shared' : 'private',
        title: String(args.p_title),
        body: String(args.p_body),
        category: String(args.p_category),
        is_pinned: Boolean(args.p_is_pinned),
        version: Number(args.p_expected_version) + 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }
      serverNotes = [updated]
      return { data: updated, error: null }
    }
    if (name === 'delete_workspace_note') {
      serverNotes = serverNotes.filter((note) => note.id !== args.p_note_id)
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })
  client = {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  mocks.useAuth.mockReturnValue({
    client,
    user: { id: USER_ID, email: 'member@example.invalid' },
    membership: { workspace_id: WORKSPACE_ID, member_role: 'member' },
  })
}

function Probe() {
  const collaboration = useWorkspaceCollaboration()
  const existingNote = serverNotes[0]
  const draft = { title: 'Local title', body: 'Local body', category: 'work', visibility: 'shared' as const, is_pinned: true }
  return <main>
    <span data-testid="chat-state">{collaboration.chatState}</span>
    <span data-testid="realtime">{String(collaboration.chatRealtimeConnected)}</span>
    <span data-testid="chat-pending">{collaboration.chatPendingCount}</span>
    <span data-testid="notes-state">{collaboration.notesState}</span>
    <span data-testid="note-pending">{collaboration.notePendingCount}</span>
    <span data-testid="note-conflicts">{collaboration.noteConflicts.length}</span>
    {collaboration.chatMessages.map((message) => <p key={message.id} data-testid="message">{message.body}:{String(Boolean(message.local_only))}</p>)}
    {collaboration.notes.map((note) => <p key={note.id} data-testid="note">{note.title}:{String(Boolean(note.local_only))}</p>)}
    <button onClick={() => void collaboration.sendChatMessage('Offline chat message', CHAT_OPERATION_ID)}>Queue chat</button>
    <button onClick={() => void collaboration.saveNote(existingNote, draft, existingNote.id, NOTE_OPERATION_ID)}>Queue note edit</button>
    <button onClick={() => {
      const conflict = collaboration.noteConflicts[0]
      if (conflict) void collaboration.retryNoteConflict(conflict)
    }}>Retry note conflict</button>
    <button onClick={() => {
      const conflict = collaboration.noteConflicts[0]
      if (conflict) void collaboration.discardOperation(conflict)
    }}>Discard note conflict</button>
  </main>
}

function renderProvider() {
  return render(<WorkspaceCollaborationProvider><Probe /></WorkspaceCollaborationProvider>)
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

beforeEach(async () => {
  serverMessages = []
  serverReceipts = []
  serverNotes = [{
    id: 'note-shared', workspace_id: WORKSPACE_ID, owner_id: 'other-member', visibility: 'shared',
    title: 'Server title', body: 'Server body', category: 'work', is_pinned: false, version: 4,
    created_at: '2026-10-10T10:00:00.000Z', updated_at: '2026-10-10T10:00:00.000Z', deleted_at: null,
  }]
  noteWriteAttempts = 0
  setOnline(true)
  makeClient()
  await clearUserTaskData(USER_ID)
})

afterEach(async () => {
  cleanup()
  await clearUserTaskData(USER_ID)
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  vi.clearAllMocks()
})

describe('Phase 4 collaboration provider simulation', () => {
  it('keeps offline chat local, then automatically syncs once with the same operation id', async () => {
    setOnline(false)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('chat-state')).toHaveTextContent('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Queue chat' }))

    await waitFor(() => expect(screen.getByTestId('message')).toHaveTextContent('Offline chat message:true'))
    await waitFor(() => expect(screen.getByTestId('chat-pending')).toHaveTextContent('1'))
    expect(client.rpc).not.toHaveBeenCalledWith('send_chat_message', expect.anything())

    setOnline(true)
    await waitFor(() => expect(screen.getByTestId('chat-pending')).toHaveTextContent('0'))
    await waitFor(() => expect(screen.getByTestId('message')).toHaveTextContent('Offline chat message:false'))
    expect(client.rpc).toHaveBeenCalledWith('send_chat_message', {
      p_body: 'Offline chat message', p_operation_id: CHAT_OPERATION_ID,
    })
    expect(screen.getByTestId('realtime')).toHaveTextContent('true')
  })

  it('detects an offline note version conflict and requires an explicit retry against the latest server version', async () => {
    setOnline(false)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('notes-state')).toHaveTextContent('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Queue note edit' }))
    await waitFor(() => expect(screen.getByTestId('note-pending')).toHaveTextContent('1'))
    expect(screen.getByTestId('note')).toHaveTextContent('Local title:true')

    setOnline(true)
    await waitFor(() => expect(screen.getByTestId('note-conflicts')).toHaveTextContent('1'))
    expect(noteWriteAttempts).toBe(1)
    expect(serverNotes[0].title).toBe('Server title')

    fireEvent.click(screen.getByRole('button', { name: 'Retry note conflict' }))
    await waitFor(() => expect(screen.getByTestId('note-pending')).toHaveTextContent('0'))
    expect(noteWriteAttempts).toBe(2)
    expect(client.rpc).toHaveBeenCalledWith('upsert_workspace_note', expect.objectContaining({
      p_note_id: 'note-shared', p_expected_version: 4, p_title: 'Local title',
    }))
    await waitFor(() => expect(screen.getByTestId('note')).toHaveTextContent('Local title:false'))
  })
})
