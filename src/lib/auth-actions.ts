'use client'

import { createClient } from '@/lib/supabase/client'

export async function signInWithGoogle() {
  const supabase = createClient()
  // Usa window.location.origin para funcionar tanto em localhost quanto em IP de rede (192.168.x.x)
  // Em produção o Supabase já ignora esse redirectTo e usa o Site URL configurado no dashboard
  const origin = window.location.origin
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
