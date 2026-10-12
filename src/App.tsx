import { PreviewProvider } from './PreviewContext'
import { AppShell } from './components/AppShell'
import { AuthGate } from './auth/AuthGate'
import { AuthProvider } from './auth/AuthProvider'
import { supabaseConfigured } from './lib/supabase'

export default function App() {
  if (supabaseConfigured) return <AuthProvider><AuthGate /></AuthProvider>
  return <PreviewProvider><AppShell /></PreviewProvider>
}
