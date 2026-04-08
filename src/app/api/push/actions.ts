'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import webpush from 'web-push'

// ─── Configurar VAPID ────────────────────────────────────────────────────
// As chaves VAPID ficam em variáveis de ambiente.
// Gerar uma vez com: npx web-push generate-vapid-keys
function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:contato@lestebarbearia.com'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

// ─── Salvar subscription push do usuário ────────────────────────────────
export async function savePushSubscription(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!isAuthenticatedUser(user)) {
      return { success: false, error: 'Usuário não autenticado.' }
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
      }, { onConflict: 'user_id,endpoint' })

    if (error) throw error
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Remover subscription push do usuário ───────────────────────────────
export async function removePushSubscription(endpoint: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!isAuthenticatedUser(user)) {
      return { success: false, error: 'Usuário não autenticado.' }
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) throw error
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Enviar push para um usuário específico (uso admin/cron) ─────────────
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ sent: number; failed: number }> {
  const vapid = getVapidConfig()
  if (!vapid) return { sent: 0, failed: 0 }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const adminSupabase = createAdminClient()
  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const expiredEndpoints: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24h TTL
        )
        sent++
      } catch (err: unknown) {
        failed++
        // 410 Gone = subscription expirada/inválida → remover
        if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
          expiredEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  // Remove subscriptions expiradas
  if (expiredEndpoints.length > 0) {
    await adminSupabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expiredEndpoints)
  }

  return { sent, failed }
}
