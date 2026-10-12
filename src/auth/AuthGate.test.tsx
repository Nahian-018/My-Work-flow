import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthGate } from './AuthGate'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  configured: true,
}))

vi.mock('./AuthProvider', () => ({ useAuth: mocks.useAuth }))
vi.mock('../phase3/LiveWorkspace', () => ({ LiveWorkspace: () => <div>Protected live task workspace</div> }))
vi.mock('../lib/supabase', () => ({ get supabaseConfigured() { return mocks.configured } }))

afterEach(() => {
  mocks.configured = true
  vi.clearAllMocks()
})

function setAuth(status: string, overrides: Record<string, unknown> = {}) {
  mocks.useAuth.mockReturnValue({
    status,
    error: '',
    user: null,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

describe('protected Phase 3 auth gate', () => {
  it('does not show task routes before session and backend membership verification', () => {
    setAuth('verifying')
    render(<AuthGate />)
    expect(screen.getByRole('status')).toHaveTextContent('Workspace অনুমতি যাচাই হচ্ছে')
    expect(screen.queryByText('Protected live task workspace')).not.toBeInTheDocument()
  })

  it('starts Google login from the explicit user action', () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    setAuth('signed_out', { signInWithGoogle })
    render(<AuthGate />)
    fireEvent.click(screen.getByRole('button', { name: /Google দিয়ে চালিয়ে যান/ }))
    expect(signInWithGoogle).toHaveBeenCalledOnce()
    expect(screen.getByText(/অনুমতি ছাড়া task data পাওয়া যাবে না/)).toBeInTheDocument()
  })

  it('denies an account without private workspace membership', () => {
    setAuth('denied', { error: 'not authorized', user: { email: 'outside@gmail.com' } })
    render(<AuthGate />)
    expect(screen.getByRole('heading', { name: 'এই account-এ অনুমতি নেই' })).toBeInTheDocument()
    expect(screen.getByText('outside@gmail.com')).toBeInTheDocument()
    expect(screen.queryByText('Protected live task workspace')).not.toBeInTheDocument()
  })

  it('renders the live workspace only after membership is ready', () => {
    setAuth('ready')
    render(<AuthGate />)
    expect(screen.getByText('Protected live task workspace')).toBeInTheDocument()
  })

  it('shows setup guidance instead of claiming login when Supabase config is absent', () => {
    mocks.configured = false
    render(<AuthGate />)
    expect(screen.getByRole('heading', { name: 'Live workspace চালু করা যায়নি' })).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument()
  })
})
