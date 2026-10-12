import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cacheVerifiedMembership, clearUserTaskData, readVerifiedMembership } from '../lib/offline-task-store'

type Membership = { workspace_id: string; member_role: 'admin' | 'member' }
type Profile = { display_name: string; avatar_url: string | null }
type AuthStatus = 'loading' | 'signed_out' | 'verifying' | 'ready' | 'denied' | 'error'

function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error ? String(error.message)
      : String(error)
  return /failed to fetch|network|fetch failed|offline|load failed|timeout/i.test(message)
}

interface AuthContextValue {
  client: SupabaseClient
  session: Session | null
  user: User | null
  membership: Membership | null
  membershipVerification: 'live' | 'cached' | 'none'
  profile: Profile | null
  status: AuthStatus
  error: string
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children, client: clientOverride }: { children: ReactNode; client?: SupabaseClient }) {
  const authClient = clientOverride ?? supabase
  if (!authClient) throw new Error('AuthProvider requires configured Supabase client')
  return <ConfiguredAuthProvider client={authClient}>{children}</ConfiguredAuthProvider>
}

function ConfiguredAuthProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [membershipVerification, setMembershipVerification] = useState<'live' | 'cached' | 'none'>('none')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState('')
  const attempt = useRef(0)

  const resolveSession = useCallback(async (nextSession: Session | null) => {
    const currentAttempt = ++attempt.current
    setSession(nextSession)
    setMembership(null)
    setMembershipVerification('none')
    setProfile(null)
    setError('')

    if (!nextSession?.user) {
      setStatus('signed_out')
      return
    }

    setStatus('verifying')
    const userId = nextSession.user.id
    const provisioningResult = await Promise.resolve(client.rpc('ensure_current_user_workspace_member')).catch((requestError: unknown) => ({
      data: null,
      error: { code: 'FETCH_ERROR', message: isNetworkFailure(requestError) ? 'Network fetch failed.' : String(requestError) },
    }))
    if (currentAttempt !== attempt.current) return
    if (provisioningResult.error) {
      const errorCode = provisioningResult.error.code
      if (errorCode === '42501') {
        await clearUserTaskData(userId).catch(() => undefined)
        setStatus('denied')
        setError('এই Google account-কে SmartFlow Duo workspace-এ অনুমতি দেওয়া হয়নি।')
        return
      }
      if (isNetworkFailure(provisioningResult.error)) {
        const cached = await readVerifiedMembership(userId).catch(() => null)
        if (currentAttempt !== attempt.current) return
        if (cached) {
          setMembership({ workspace_id: cached.workspaceId, member_role: cached.memberRole })
          setProfile({ display_name: cached.displayName, avatar_url: cached.avatarUrl })
          setMembershipVerification('cached')
          setStatus('ready')
          setError('Offline: শেষ সফল backend membership ব্যবহার করা হচ্ছে। Internet ফিরলে অনুমতি পুনরায় যাচাই হবে; offline cache server authorization-এর বিকল্প নয়।')
          return
        }
      }
      setStatus('error')
      setError('Backend membership restore করা যায়নি। Network, Phase 3 migration, private allowlist ও RLS configuration পরীক্ষা করুন।')
      return
    }

    const membershipRows = Array.isArray(provisioningResult.data) ? provisioningResult.data : []
    const verifiedRow = membershipRows[0]
    if (!verifiedRow || !['admin', 'member'].includes(verifiedRow.member_role)) {
      setStatus('error')
      setError('Backend থেকে বৈধ workspace membership পাওয়া যায়নি। Migration ও allowlist পরীক্ষা করুন।')
      return
    }
    const verifiedMembership: Membership = {
      workspace_id: verifiedRow.workspace_id,
      member_role: verifiedRow.member_role as Membership['member_role'],
    }

    const profileResult = await Promise.resolve(client
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle()).catch((requestError: unknown) => ({
        data: null,
        error: { code: 'FETCH_ERROR', message: isNetworkFailure(requestError) ? 'Network fetch failed.' : String(requestError) },
      }))
    if (currentAttempt !== attempt.current) return
    if (profileResult.error && !isNetworkFailure(profileResult.error)) {
      setStatus('error')
      setError('Profile load করা যায়নি। Database policy ও connection পরীক্ষা করুন।')
      return
    }
    const fallbackName = nextSession.user.user_metadata?.full_name || nextSession.user.email?.split('@')[0] || 'SmartFlow member'
    const verifiedProfile: Profile = profileResult.data as Profile | null ?? { display_name: fallbackName, avatar_url: null }

    await cacheVerifiedMembership({
      userId,
      workspaceId: verifiedMembership.workspace_id,
      memberRole: verifiedMembership.member_role,
      displayName: verifiedProfile.display_name,
      avatarUrl: verifiedProfile.avatar_url,
    }).catch(() => undefined)
    if (currentAttempt !== attempt.current) return
    setMembership(verifiedMembership)
    setProfile(verifiedProfile)
    setMembershipVerification('live')
    setStatus('ready')
    if (profileResult.error) setError('Workspace অনুমতি online যাচাই হয়েছে; Profile-এর শেষ local copy ব্যবহার করা হচ্ছে।')
  }, [client])

  useEffect(() => {
    let mounted = true
    const handleResolveError = (failure: unknown) => {
      if (!mounted) return
      setStatus('error')
      setError(isNetworkFailure(failure) ? 'Network পাওয়া যাচ্ছে না; আগে যাচাই করা membership থাকলে আবার load করুন।' : 'Session বা workspace যাচাইয়ে অপ্রত্যাশিত error হয়েছে।')
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      // Supabase warns against starting follow-up Auth/Database requests inside its auth callback.
      if (mounted) queueMicrotask(() => { if (mounted) void resolveSession(nextSession).catch(handleResolveError) })
    })
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) {
        setStatus('error')
        setError('Login session পড়া যায়নি। আবার চেষ্টা করুন।')
        return
      }
      void resolveSession(data.session).catch(handleResolveError)
    }).catch(handleResolveError)
    return () => {
      mounted = false
      attempt.current += 1
      subscription.unsubscribe()
    }
  }, [client, resolveSession])

  useEffect(() => {
    if (!session || membershipVerification !== 'cached') return
    const recheckWhenOnline = () => {
      if (navigator.onLine) void resolveSession(session)
    }
    const recheckWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void resolveSession(session)
    }
    window.addEventListener('online', recheckWhenOnline)
    document.addEventListener('visibilitychange', recheckWhenVisible)
    return () => {
      window.removeEventListener('online', recheckWhenOnline)
      document.removeEventListener('visibilitychange', recheckWhenVisible)
    }
  }, [membershipVerification, resolveSession, session])

  const signInWithGoogle = useCallback(async () => {
    setError('')
    const { error: authError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (authError) {
      setStatus('signed_out')
      setError(`Google Login শুরু করা যায়নি: ${authError.message}`)
    }
  }, [client])

  const signOut = useCallback(async () => {
    setError('')
    const { error: signOutError } = await client.auth.signOut()
    if (signOutError) setError(`Logout সম্পন্ন হয়নি: ${signOutError.message}`)
  }, [client])

  const value = useMemo<AuthContextValue>(() => ({
    client, session, user: session?.user ?? null, membership, membershipVerification, profile, status, error,
    signInWithGoogle, signOut, clearError: () => setError(''),
  }), [client, session, membership, membershipVerification, profile, status, error, signInWithGoogle, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
