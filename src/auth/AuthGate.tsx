import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { LiveWorkspace } from '../phase3/LiveWorkspace'
import { supabaseConfigured } from '../lib/supabase'

export function AuthGate() {
  if (!supabaseConfigured) {
    return <AuthFrame>
      <div className="auth-mark">SF</div>
      <p className="live-eyebrow">SMARTFLOW DUO · PHASE 3</p>
      <h1>Live workspace চালু করা যায়নি</h1>
      <p className="auth-copy">Supabase project URL ও publishable key পাওয়া যায়নি। এটি demo fallback নয়—live mode-এর setup অসম্পূর্ণ।</p>
      <div className="auth-error" role="alert">Owner-side setup সম্পন্ন করে <code>VITE_SUPABASE_URL</code> এবং <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> দিন।</div>
      <p className="auth-footnote">Owner setup ও migration checklist: project-এর <code>supabase/README.md</code>।</p>
    </AuthFrame>
  }

  return <ConfiguredGate />
}

function ConfiguredGate() {
  const { status, error, user, signInWithGoogle, signOut } = useAuth()
  if (status === 'ready') return <LiveWorkspace />

  let content: ReactNode
  if (status === 'loading' || status === 'verifying') {
    content = <div className="auth-state" role="status" aria-live="polite">
      <span className="live-spinner" />
      <h1>{status === 'loading' ? 'Session পুনরুদ্ধার হচ্ছে…' : 'Workspace অনুমতি যাচাই হচ্ছে…'}</h1>
      <p className="auth-copy">Google session ও private membership policy যাচাই না হওয়া পর্যন্ত task data দেখানো হবে না।</p>
    </div>
  } else if (status === 'denied') {
    content = <div className="auth-state">
      <div className="auth-mark">!</div>
      <p className="live-eyebrow">ACCESS DENIED</p>
      <h1>এই account-এ অনুমতি নেই</h1>
      <p className="auth-copy">Signed-in Google account workspace-এর সক্রিয় দুই সদস্যের একজন নয়। অনুমোদন backend-এ যাচাই করা হয়েছে।</p>
      {user?.email && <p className="auth-account">বর্তমান account: <strong>{user.email}</strong></p>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="live-button live-button-secondary" onClick={() => void signOut()}>Logout</button>
    </div>
  } else if (status === 'error') {
    content = <div className="auth-state">
      <div className="auth-mark">!</div>
      <p className="live-eyebrow">SECURE SESSION CHECK</p>
      <h1>Session যাচাই করা যায়নি</h1>
      <p className="auth-copy">Network, migration ও RLS policy পরীক্ষা করে আবার চেষ্টা করুন। যাচাই ব্যর্থ হলে protected workspace দেখানো হয় না।</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="auth-actions">
        <button className="live-button live-button-primary" onClick={() => window.location.reload()}>আবার চেষ্টা</button>
        <button className="live-button live-button-secondary" onClick={() => void signOut()}>Logout</button>
      </div>
    </div>
  } else {
    content = <div className="auth-state">
      <div className="auth-mark">SF</div>
      <p className="live-eyebrow">PRIVATE WORKSPACE · ASIA/DHAKA</p>
      <h1>SmartFlow Duo-তে প্রবেশ করুন</h1>
      <p className="auth-copy">Google দিয়ে login করুন। Backend-এ সংরক্ষিত membership অনুমতি ছাড়া task data পাওয়া যাবে না।</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="live-button live-button-primary auth-google-button" onClick={() => void signInWithGoogle()}>
        <GoogleMark /> Google দিয়ে চালিয়ে যান
      </button>
      <p className="auth-footnote">Login session এই browser-এ restore হয়। Logout local IndexedDB task cache মুছে না; shared/public device হলে logout-এর পর browser site data clear করুন।</p>
    </div>
  }
  return <AuthFrame>{content}</AuthFrame>
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="auth-screen"><div className="auth-card">{children}</div><p className="auth-footer">SmartFlow Duo · Private shared workspace</p></main>
}

function GoogleMark() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 48 48" fill="none">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.9-3.6-11.5-8.4H5.6v5.4A20.5 20.5 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.5 27.4a12.3 12.3 0 0 1 0-7.8v-5.4H5.6a20.5 20.5 0 0 0 0 18.6l6.9-5.4Z" />
    <path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3.1l5.9-5.9C34.2 5 29.5 3 24 3A20.5 20.5 0 0 0 5.6 14.2l6.9 5.4C14.1 14.8 18.7 11.2 24 11.2Z" />
  </svg>
}
