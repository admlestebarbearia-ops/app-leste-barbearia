'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { GUEST_BOOKING_IDS_COOKIE, parseGuestIds } from '@/lib/auth/guest-ownership'
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

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  /** Emoji-prefixed icon path, e.g. '/android-chrome-192x192.png' */
  icon?: string
  /** Dados extras opcionais repassados para o service worker */
  data?: Record<string, unknown>
}

type PushSkipReason = 'missing-vapid' | 'no-subscriptions' | 'no-admin-profiles' | null

interface PushDeliveryResult {
  sent: number
  failed: number
  subscriptions: number
  expiredRemoved: number
  skippedReason: PushSkipReason
}

type PushSessionKind = 'authenticated' | 'anonymous'

function resolvePushSessionOwner(user: { id?: string; is_anonymous?: boolean } | null | undefined) {
  if (!user?.id) return null

  return {
    userId: user.id,
    sessionKind: user.is_anonymous ? 'anonymous' as const : 'authenticated' as const,
  }
}

// Vincula ao dono da inscricao de push os agendamentos que ESTE APARELHO criou.
//
// A versao anterior vinculava por TELEFONE, o que era mais grave que a falha de
// leitura: alem de exibir, ela GRAVAVA client_id, transferindo a posse de forma
// permanente. Quem digitasse o numero de outra pessoa e ativasse as notificacoes
// se tornaria dono dos agendamentos dela no banco.
async function linkGuestAppointmentsToPushOwner(userId: string) {
  const cookieStore = await cookies()
  const guestAppointmentIds = await parseGuestIds(cookieStore.get(GUEST_BOOKING_IDS_COOKIE)?.value)

  if (guestAppointmentIds.length === 0) return 0

  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('appointments')
    .update({ client_id: userId })
    .is('client_id', null)
    .in('id', guestAppointmentIds)
    .in('status', ['confirmado', 'aguardando_pagamento'])
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

function logPushDelivery(scope: 'user' | 'admins', target: string, payload: PushPayload, result: PushDeliveryResult) {
  if (result.sent > 0 && result.failed === 0 && result.expiredRemoved === 0) return

  console.warn(`[push/${scope}] delivery summary`, {
    target,
    tag: payload.tag ?? null,
    url: payload.url ?? null,
    sent: result.sent,
    failed: result.failed,
    subscriptions: result.subscriptions,
    expiredRemoved: result.expiredRemoved,
    skippedReason: result.skippedReason,
  })
}

// ─── Salvar subscription push do usuário ────────────────────────────────
export async function savePushSubscription(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ success: boolean; error?: string; sessionKind?: PushSessionKind; linkedAppointments?: number }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const owner = resolvePushSessionOwner(user)

    if (!owner) {
      return { success: false, error: 'Usuário não autenticado.' }
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: owner.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
      }, { onConflict: 'user_id,endpoint' })

    if (error) throw error

    let linkedAppointments = 0
    try {
      linkedAppointments = await linkGuestAppointmentsToPushOwner(owner.userId)
    } catch (linkError) {
      console.warn('[push/save] failed to link guest appointments', {
        target: owner.userId.slice(0, 8),
        error: linkError instanceof Error ? linkError.message : String(linkError),
      })
    }

    return { success: true, sessionKind: owner.sessionKind, linkedAppointments }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Remover subscription push do usuário ───────────────────────────────
export async function removePushSubscription(endpoint: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const owner = resolvePushSessionOwner(user)

    if (!owner) {
      return { success: false, error: 'Usuário não autenticado.' }
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', owner.userId)
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
  payload: PushPayload
) : Promise<PushDeliveryResult> {
  const vapid = getVapidConfig()
  if (!vapid) {
    return { sent: 0, failed: 0, subscriptions: 0, expiredRemoved: 0, skippedReason: 'missing-vapid' }
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const adminSupabase = createAdminClient()
  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, subscriptions: 0, expiredRemoved: 0, skippedReason: 'no-subscriptions' }
  }

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

  return {
    sent,
    failed,
    subscriptions: subs.length,
    expiredRemoved: expiredEndpoints.length,
    skippedReason: null,
  }
}

// ─── Enviar push para todos os admins ────────────────────────────────────
// Busca todos os user_ids admin via profiles, depois envia para cada um.
// Fire-and-forget: não levanta exception - usá-la como `void sendPushToAdmins(...)`
export async function sendPushToAdmins(
  payload: PushPayload
) : Promise<PushDeliveryResult> {
  const vapid = getVapidConfig()
  if (!vapid) {
    return { sent: 0, failed: 0, subscriptions: 0, expiredRemoved: 0, skippedReason: 'missing-vapid' }
  }

  const adminSupabase = createAdminClient()

  // Busca todos os admins com pelo menos uma subscription
  const { data: adminProfiles } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)

  if (!adminProfiles || adminProfiles.length === 0) {
    return { sent: 0, failed: 0, subscriptions: 0, expiredRemoved: 0, skippedReason: 'no-admin-profiles' }
  }

  const adminIds = adminProfiles.map((p) => p.id)

  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key, user_id')
    .in('user_id', adminIds)

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, subscriptions: 0, expiredRemoved: 0, skippedReason: 'no-subscriptions' }
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  let sent = 0
  let failed = 0
  const expiredEndpoints: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ ...payload, url: payload.url ?? '/admin' }),
          { TTL: 60 * 60 * 6 } // 6h TTL para notificações admin
        )
        sent++
      } catch (err: unknown) {
        failed++
        if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
          expiredEndpoints.push(sub.endpoint)
        }
      }
    })
  )

  if (expiredEndpoints.length > 0) {
    await adminSupabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints)
  }

  return {
    sent,
    failed,
    subscriptions: subs.length,
    expiredRemoved: expiredEndpoints.length,
    skippedReason: null,
  }
}

// ─── Helper: disparo silencioso (não propaga exceção) ────────────────────
// Use: void firePushToUser(userId, payload) quando notificação não é crítica.
export async function firePushToUser(
  userId: string | null | undefined,
  payload: PushPayload
): Promise<void> {
  if (!userId) return
  try {
    const result = await sendPushToUser(userId, payload)
    logPushDelivery('user', userId.slice(0, 8), payload, result)
  } catch (error) {
    console.error('[push/user] unexpected failure', {
      target: userId.slice(0, 8),
      tag: payload.tag ?? null,
      url: payload.url ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    // Notificações não devem quebrar o fluxo principal
  }
}

export async function firePushToAdmins(payload: PushPayload): Promise<void> {
  try {
    const result = await sendPushToAdmins(payload)
    logPushDelivery('admins', 'all-admins', payload, result)
  } catch (error) {
    console.error('[push/admins] unexpected failure', {
      target: 'all-admins',
      tag: payload.tag ?? null,
      url: payload.url ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    // Notificações não devem quebrar o fluxo principal
  }
}
