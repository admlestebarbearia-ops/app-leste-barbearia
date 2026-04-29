import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const REMINDERS = [
  { label: '90min', minutes: 90, flag: 'reminder_90min_sent' },
  { label: '75min', minutes: 75, flag: 'reminder_75min_sent' },
  { label: '60min', minutes: 60, flag: 'reminder_1h_sent' },
  { label: '45min', minutes: 45, flag: 'reminder_45min_sent' },
  { label: '30min', minutes: 30, flag: 'reminder_30min_sent' },
  { label: '20min', minutes: 20, flag: 'reminder_20min_sent' },
  { label: '15min', minutes: 15, flag: 'reminder_15min_sent' },
  { label: '10min', minutes: 10, flag: 'reminder_10min_sent' },
  { label: '5min', minutes: 5, flag: 'reminder_5min_sent' },
] as const

type ReminderFlag = (typeof REMINDERS)[number]['flag']

interface AppointmentAuditRow {
  id: string
  client_id: string | null
  start_time: string | null
  reminder_90min_sent: boolean
  reminder_75min_sent: boolean
  reminder_1h_sent: boolean
  reminder_45min_sent: boolean
  reminder_30min_sent: boolean
  reminder_20min_sent: boolean
  reminder_15min_sent: boolean
  reminder_10min_sent: boolean
  reminder_5min_sent: boolean
}

function getBrasiliaNow() {
  const now = new Date()
  const brasiliaOffset = -3 * 60
  const nowBrasilia = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000)
  return nowBrasilia
}

function toTimeStr(minutes: number) {
  const safeMin = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(safeMin / 60).toString().padStart(2, '0')
  const m = (safeMin % 60).toString().padStart(2, '0')
  return `${h}:${m}:00`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminSupabase = createAdminClient()
    const nowBrasilia = getBrasiliaNow()
    const todayStr = nowBrasilia.toISOString().split('T')[0]
    const nowMinutes = nowBrasilia.getHours() * 60 + nowBrasilia.getMinutes()

    const [adminsRes, allSubsRes, appointmentsRes] = await Promise.all([
      adminSupabase.from('profiles').select('id').eq('is_admin', true),
      adminSupabase.from('push_subscriptions').select('user_id'),
      adminSupabase
        .from('appointments')
        .select(`
          id, client_id, start_time,
          reminder_90min_sent, reminder_75min_sent,
          reminder_1h_sent, reminder_45min_sent,
          reminder_30min_sent, reminder_20min_sent,
          reminder_15min_sent, reminder_10min_sent,
          reminder_5min_sent
        `)
        .eq('date', todayStr)
        .eq('status', 'confirmado'),
    ])

    if (adminsRes.error) throw adminsRes.error
    if (allSubsRes.error) throw allSubsRes.error
    if (appointmentsRes.error) throw appointmentsRes.error

    const adminIds = (adminsRes.data ?? []).map((profile) => profile.id)
    const subscriptions = allSubsRes.data ?? []
    const subscribedUserIds = new Set(subscriptions.map((subscription) => subscription.user_id).filter(Boolean))
    const adminSubscribedIds = adminIds.filter((adminId) => subscribedUserIds.has(adminId))
    const appointments = (appointmentsRes.data ?? []) as AppointmentAuditRow[]

    const reachability = {
      totalConfirmedToday: appointments.length,
      withClientId: 0,
      withoutClientId: 0,
      withReachablePush: 0,
      withoutReachablePush: 0,
    }

    const eligibility = Object.fromEntries(
      REMINDERS.map((reminder) => [reminder.label, {
        eligibleNow: 0,
        withSubscription: 0,
        withoutSubscription: 0,
        withoutClientId: 0,
      }])
    ) as Record<string, {
      eligibleNow: number
      withSubscription: number
      withoutSubscription: number
      withoutClientId: number
    }>

    for (const appointment of appointments) {
      const hasClientId = !!appointment.client_id
      const hasSubscription = hasClientId && subscribedUserIds.has(appointment.client_id)

      if (hasClientId) {
        reachability.withClientId++
      } else {
        reachability.withoutClientId++
      }

      if (hasSubscription) {
        reachability.withReachablePush++
      } else {
        reachability.withoutReachablePush++
      }

      if (!appointment.start_time) continue

      const [h, m] = appointment.start_time.split(':').map(Number)
      const appointmentMinutes = h * 60 + m

      for (const reminder of REMINDERS) {
        const alreadySent = appointment[reminder.flag as ReminderFlag] === true
        if (alreadySent) continue

        const minWindow = nowMinutes + reminder.minutes - 7
        const maxWindow = nowMinutes + reminder.minutes + 7
        if (appointmentMinutes < minWindow || appointmentMinutes > maxWindow) continue

        eligibility[reminder.label].eligibleNow++
        if (!hasClientId) {
          eligibility[reminder.label].withoutClientId++
        } else if (hasSubscription) {
          eligibility[reminder.label].withSubscription++
        } else {
          eligibility[reminder.label].withoutSubscription++
        }
      }
    }

    const hasVapidPublic = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const hasVapidPrivate = !!process.env.VAPID_PRIVATE_KEY
    const risks: string[] = []

    if (!hasVapidPublic || !hasVapidPrivate) {
      risks.push('VAPID ausente: push servidor não consegue entregar notificações web.')
    }
    if (adminIds.length === 0) {
      risks.push('Nenhum admin com profile is_admin=true encontrado.')
    }
    if (adminIds.length > 0 && adminSubscribedIds.length === 0) {
      risks.push('Admins sem push_subscriptions: webhook de pagamento do MP não entregará push com painel fechado.')
    }
    if (reachability.withoutClientId > 0) {
      risks.push('Existem appointments confirmados sem client_id: o fluxo atual de lembrete push não alcança visitantes.')
    }
    if (reachability.withClientId > 0 && reachability.withReachablePush === 0) {
      risks.push('Há clientes logados com agendamento confirmado hoje, mas nenhum com subscription ativa.')
    }

    return NextResponse.json({
      nowBrasilia: toTimeStr(nowMinutes),
      date: todayStr,
      env: {
        hasCronSecret: !!cronSecret,
        hasVapidPublic,
        hasVapidPrivate,
        vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:contato@lestebarbearia.com',
      },
      adminPush: {
        totalAdmins: adminIds.length,
        adminsWithSubscription: adminSubscribedIds.length,
        adminsWithoutSubscription: Math.max(adminIds.length - adminSubscribedIds.length, 0),
        paymentWebhookPushReady: adminSubscribedIds.length > 0 && hasVapidPublic && hasVapidPrivate,
        note: 'AdminDashboard também recebe alerts locais por Realtime quando o painel está aberto; isso não prova push servidor.',
      },
      subscriptions: {
        totalRows: subscriptions.length,
        uniqueUsers: subscribedUserIds.size,
      },
      reachability,
      eligibility,
      risks,
    })
  } catch (error) {
    console.error('[ops/notification-audit]', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}