import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAuthenticatedUser } from '@/lib/auth/session-state'

/**
 * POST /api/push/refresh
 *
 * Chamado pelo service worker quando o browser renova automaticamente uma
 * PushSubscription expirada (evento `pushsubscriptionchange`).
 * Substitui o endpoint antigo pelo novo no banco.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      oldEndpoint?: string
      newSubscription?: {
        endpoint: string
        keys?: { p256dh?: string; auth?: string }
      }
    }

    const { oldEndpoint, newSubscription } = body

    if (!newSubscription?.endpoint || !newSubscription.keys?.p256dh || !newSubscription.keys?.auth) {
      return NextResponse.json({ error: 'Dados de subscription inválidos.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!isAuthenticatedUser(user)) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    // Remove o endpoint antigo (se fornecido) e salva o novo
    if (oldEndpoint) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', oldEndpoint)
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: newSubscription.endpoint,
          p256dh: newSubscription.keys.p256dh,
          auth_key: newSubscription.keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
