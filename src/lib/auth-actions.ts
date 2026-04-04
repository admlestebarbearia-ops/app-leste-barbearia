'use client'

import { createClient } from '@/lib/supabase/client'

export async function signInWithGoogle() {
  const supabase = createClient()
  // Usa NEXT_PUBLIC_SITE_URL se definido (garante domínio canônico em vez do URL do Vercel)
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? window.location.origin
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/'
}
