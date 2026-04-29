import { createClient as createSupabaseBrowser } from '@/lib/supabase/client'

export async function ensurePushBrowserSession() {
  const supabase = createSupabaseBrowser()

  const { data: currentUserResult, error: currentUserError } = await supabase.auth.getUser()
  if (currentUserError) throw currentUserError

  if (currentUserResult.user?.id) {
    return {
      userId: currentUserResult.user.id,
      sessionKind: currentUserResult.user.is_anonymous ? 'anonymous' as const : 'authenticated' as const,
      created: false,
    }
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user?.id) {
    throw new Error('Sessão anônima indisponível para notificações.')
  }

  return {
    userId: data.user.id,
    sessionKind: 'anonymous' as const,
    created: true,
  }
}