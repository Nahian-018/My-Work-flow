import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
const validUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(projectUrl)

export const supabaseConfigured = Boolean(validUrl && publishableKey && !publishableKey.startsWith('your_'))

/** Browser-safe Supabase client. Only the publishable key belongs here; RLS is mandatory. */
export const supabase = supabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      global: { headers: { 'X-Client-Info': 'smartflow-duo-web' } },
    })
  : null
