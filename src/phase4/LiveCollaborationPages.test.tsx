import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatMessage, WorkspaceNote } from './WorkspaceCollaborationProvider'
import { LiveChatPage } from './LiveChatPage'
import { LiveNotesPage } from './LiveNotesPage'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), useCollaboration: vi.fn(), newOperationId: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('./WorkspaceCollaborationProvider', () => ({ useWorkspaceCollaboration: mocks.useCollaboration }))
vi.mock('../lib/task-service', () => ({ newOperationId: mocks.newOperationId }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const OTHER_USER = 'other-user'
const USER_ID = 'current-user'
const NEW_NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NEW_NOTE_OPERATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const chatMessages: ChatMessage[] = [
  {
    id: 'message-other', workspace_id: 'workspace', sender_id: OTHER_USER,
    client_operation_id: 'operation-other', body: 'আগামীকালের পরিকল্পনা',
    created_at: '2026-10-10T10:00:00.000Z', read_by: [],
  },
  {
    id: 'message-own', workspace_id: 'workspace', sender_id: USER_ID,
    client_operation_id: 'operation-own', body: 'আমি কাজটি শেষ করব',
    created_at: '2026-10-10T10:02:00.000Z', read_by: [USER_ID, OTHER_USER],
  },
]

function makeNote(overrides: Partial<WorkspaceNote> = {}): WorkspaceNote {
  return {
    id: 'note-shared', workspace_id: 'workspace', owner_id: OTHER_USER, visibility: 'shared',
    title: 'Shared note', body: 'Team notes', category: 'work', is_pinned: true, version: 2,
    created_at: '2026-10-10T10:00:00.000Z', updated_at: '2026-10-10T11:00:00.000Z', deleted_at: null,
    ...overrides,
  }
}

function makePageContext(notes: WorkspaceNote[] = [
  makeNote(), makeNote({ id: 'note-private', owner_id: USER_ID, visibility: 'private', title: 'My private note', category: 'personal', is_pinned: false }),
]) {
  const methods = {
    refreshChat: vi.fn().mockResolvedValue(undefined),
    loadEarlierChat: vi.fn().mockResolvedValue(undefined),
    sendChatMessage: vi.fn().mockResolvedValue(undefined),
    markChatRead: vi.fn().mockResolvedValue(undefined),
    refreshNotes: vi.fn().mockResolvedValue(undefined),
    saveNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    retryNoteConflict: vi.fn().mockResolvedValue(undefined),
    discardOperation: vi.fn().mockResolvedValue(undefined),
    syncPending: vi.fn().mockResolvedValue(undefined),
  }
  const profileBuilder = {
    select: vi.fn(() => profileBuilder),
    eq: vi.fn(() => profileBuilder),
    neq: vi.fn(() => profileBuilder),
    limit: vi.fn(() => profileBuilder),
    maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: OTHER_USER, display_name: 'রাফি' }, error: null }),
  }
  const client = { from: vi.fn(() => profileBuilder) }
  mocks.useAuth.mockReturnValue({
    client, user: { id: USER_ID, email: 'member@example.invalid' },
    profile: { display_name: 'মিম', avatar_url: null },
    membership: { workspace_id: 'workspace', member_role: 'member' },
  })
  mocks.useCollaboration.mockReturnValue({
    chatMessages, chatState: 'connected', chatRealtimeConnected: true, chatError: '', chatUnreadCount: 1,
    chatHasMore: false, chatPendingCount: 0, notes, notesState: 'connected', notesError: '',
    notePendingCount: 0, noteConflicts: [], ...methods,
  })
  mocks.newOperationId.mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  return { methods, client }
}

describe('Phase 4 chat and quick-note pages', () => {
  it('shows database history, the authorized conversation partner, read state, and sends a stable message', async () => {
    const user = userEvent.setup()
    const { methods, client } = makePageContext()
    render(<LiveChatPage />)

    expect(screen.getByRole('heading', { name: 'লাইভ কথোপকথন' })).toBeInTheDocument()
    expect(screen.getByText('আগামীকালের পরিকল্পনা')).toBeInTheDocument()
    expect(screen.getByText('আমি কাজটি শেষ করব')).toBeInTheDocument()
    expect(methods.markChatRead).toHaveBeenCalled()
    expect(await screen.findAllByText('রাফি')).not.toHaveLength(0)
    expect(client.from).toHaveBeenCalledWith('profiles')

    const textarea = screen.getByRole('textbox', { name: 'বার্তা লিখুন' })
    await user.type(textarea, 'নতুন database message')
    await user.click(screen.getByRole('button', { name: /পাঠান/ }))
    await waitFor(() => expect(methods.sendChatMessage).toHaveBeenCalledWith(
      'নতুন database message', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ))
    expect(textarea).toHaveValue('')
  })

  it('searches notes, identifies the current owner correctly, and passes pin/edit/delete actions to the server-backed provider', async () => {
    const user = userEvent.setup()
    const { methods } = makePageContext()
    render(<LiveNotesPage />)

    expect(screen.getByText('Shared note')).toBeInTheDocument()
    expect(screen.getByText('My private note')).toBeInTheDocument()
    expect(screen.getByText('Owner · আপনি')).toBeInTheDocument()
    expect(screen.getByText('Owner · অন্য সদস্য')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: 'নোট খুঁজুন' })
    await user.type(search, 'private')
    expect(screen.getByText('My private note')).toBeInTheDocument()
    expect(screen.queryByText('Shared note')).not.toBeInTheDocument()
    await user.clear(search)
    await user.selectOptions(screen.getByLabelText('Category'), 'personal')
    expect(screen.getByText('My private note')).toBeInTheDocument()
    expect(screen.queryByText('Shared note')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Category'), 'all')
    await user.selectOptions(screen.getByLabelText('দৃশ্যমানতা'), 'private')
    expect(screen.getByText('My private note')).toBeInTheDocument()
    expect(screen.queryByText('Shared note')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('দৃশ্যমানতা'), 'all')

    await user.click(screen.getByRole('button', { name: 'Edit Shared note' }))
    const editor = screen.getByRole('dialog')
    await user.clear(within(editor).getByLabelText('শিরোনাম'))
    await user.type(within(editor).getByLabelText('শিরোনাম'), 'Edited shared note')
    await user.click(within(editor).getByRole('button', { name: 'সংরক্ষণ করুন' }))
    await waitFor(() => expect(methods.saveNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-shared' }),
      expect.objectContaining({ title: 'Edited shared note', visibility: 'shared', is_pinned: true }),
      'note-shared', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ))

    await user.click(screen.getByRole('button', { name: 'Unpin Shared note' }))
    await waitFor(() => expect(methods.saveNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-shared' }),
      expect.objectContaining({ title: 'Shared note', visibility: 'shared', is_pinned: false }),
      'note-shared', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ))

    await user.click(screen.getByRole('button', { name: 'Delete Shared note' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/নোট মুছবেন/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'মুছুন' }))
    await waitFor(() => expect(methods.deleteNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-shared' }), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ))
  })

  it('creates a shared quick note with validated form input', async () => {
    const user = userEvent.setup()
    const { methods } = makePageContext([])
    mocks.newOperationId.mockReset()
      .mockReturnValueOnce(NEW_NOTE_ID)
      .mockReturnValueOnce(NEW_NOTE_OPERATION_ID)
    render(<LiveNotesPage />)
    await user.click(screen.getByRole('button', { name: /নতুন নোট/ }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('শিরোনাম'), 'বাংলা পরিকল্পনা')
    await user.type(within(dialog).getByLabelText('বিষয়'), 'দলের জন্য গুরুত্বপূর্ণ কাজ')
    await user.selectOptions(within(dialog).getByLabelText('দৃশ্যমানতা'), 'shared')
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ করুন' }))

    await waitFor(() => expect(methods.saveNote).toHaveBeenCalledWith(
      null,
      { title: 'বাংলা পরিকল্পনা', body: 'দলের জন্য গুরুত্বপূর্ণ কাজ', category: 'general', visibility: 'shared', is_pinned: false },
      NEW_NOTE_ID, NEW_NOTE_OPERATION_ID,
    ))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
