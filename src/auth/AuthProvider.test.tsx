import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './AuthProvider'
import { clearUserTaskData, cacheTasks, getPendingTaskStatuses, queueTaskStatus, readCachedTasks, readVerifiedMembership } from '../lib/offline-task-store'
import type { LiveTask } from '../lib/task-service'

const USER_ID = 'auth-offline-user'
const session = {
  user: { id: USER_ID, email: 'member-fixture@gmail.com', user_metadata: { full_name: 'Live Member' } },
} as unknown as Session

afterEach(async () => {
  cleanup()
  await clearUserTaskData(USER_ID)
  vi.restoreAllMocks()
})

function createClient({ provisioningError = null, profileError = null }: { provisioningError?: { code: string; message: string } | null; profileError?: { code: string; message: string } | null } = {}) {
  const profileResult = { data: { display_name: 'Live Member', avatar_url: null }, error: profileError }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(profileResult),
  }
  const client = {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: provisioningError ? null : [{ workspace_id: 'workspace-live', member_role: 'member' }],
      error: provisioningError,
    }),
    from: vi.fn(() => builder),
  }
  return client as unknown as SupabaseClient
}

function AuthStatusProbe() {
  const { status, membership, membershipVerification, error } = useAuth()
  return <div>
    <span>{`${status}:${membershipVerification}:${membership?.member_role ?? 'none'}`}</span>
    {error && <p>{error}</p>}
  </div>
}

describe('session restoration and offline membership recovery', () => {
  it('caches a server-verified membership and restores only that user partition during a network outage', async () => {
    const onlineClient = createClient()
    const first = render(<AuthProvider client={onlineClient}><AuthStatusProbe /></AuthProvider>)
    expect(await screen.findByText('ready:live:member')).toBeInTheDocument()
    first.unmount()
    expect(await readVerifiedMembership(USER_ID)).toMatchObject({ workspaceId: 'workspace-live', memberRole: 'member' })

    const offlineClient = createClient({ provisioningError: { code: 'FETCH_ERROR', message: 'Failed to fetch: network offline' } })
    render(<AuthProvider client={offlineClient}><AuthStatusProbe /></AuthProvider>)
    expect(await screen.findByText('ready:cached:member')).toBeInTheDocument()
    expect(screen.getByText(/শেষ সফল backend membership/)).toBeInTheDocument()
  })

  it('does not allow a revoked membership to fall back to a stale offline authorization cache', async () => {
    await clearUserTaskData(USER_ID)
    await (await import('../lib/offline-task-store')).cacheVerifiedMembership({
      userId: USER_ID, workspaceId: 'workspace-live', memberRole: 'member', displayName: 'Live Member', avatarUrl: null,
    })
    await cacheTasks(USER_ID, [{ id: 'cached-task', title: 'Offline task' } as LiveTask])
    await queueTaskStatus({ operationId: 'queued-operation', userId: USER_ID, taskId: 'cached-task', targetStatus: 'completed', expectedVersion: 1 })
    const revokedClient = createClient({ provisioningError: { code: '42501', message: 'not authorized' } })
    render(<AuthProvider client={revokedClient}><AuthStatusProbe /></AuthProvider>)
    expect(await screen.findByText('denied:none:none')).toBeInTheDocument()
    await waitFor(async () => {
      expect(await readVerifiedMembership(USER_ID)).toBeNull()
      expect(await readCachedTasks(USER_ID)).toEqual([])
      expect(await getPendingTaskStatuses(USER_ID)).toEqual([])
    })
  })
})
