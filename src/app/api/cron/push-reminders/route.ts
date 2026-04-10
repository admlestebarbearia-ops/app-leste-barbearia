import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/app/api/push/actions'

// Roda a cada 15 minutos via scheduler externo (GitHub Actions)
// Envia lembretes push: 1h30, 1h15, 1h, 45min, 30min e 15min antes do agendamento

export async function GET(request: Request) {
  // Segurança: verifica secret enviado pelo agendador
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminSupabase = createAdminClient()

    // Horário atual em Brasília (UTC-3)
    const now = new Date()
    const brasiliaOffset = -3 * 60 // minutos
    const nowBrasilia = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000)
    const todayStr = nowBrasilia.toISOString().split('T')[0]
    const nowMinutes = nowBrasilia.getHours() * 60 + nowBrasilia.getMinutes()

    const toTimeStr = (minutes: number) => {
      const safeMin = ((minutes % 1440) + 1440) % 1440
      const h = Math.floor(safeMin / 60).toString().padStart(2, '0')
      const m = (safeMin % 60).toString().padStart(2, '0')
      return `${h}:${m}:00`
    }

    // Janelas de ±7 min em torno de cada intervalo (cron roda a cada 15min)
    // Garante que todo agendamento seja coberto sem reenvio duplo (flags no BD)
    const REMINDERS = [
      { label: '1h30',  minutes: 90, flag: 'reminder_90min_sent', title: '✂️ Daqui 1h30!',    bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}.` },
      { label: '1h15',  minutes: 75, flag: 'reminder_75min_sent', title: '✂️ Daqui 1h15!',    bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}.` },
      { label: '1h',    minutes: 60, flag: 'reminder_1h_sent',    title: '✂️ Daqui 1 hora!',  bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}. Não esqueça!` },
      { label: '45min', minutes: 45, flag: 'reminder_45min_sent', title: '⏰ Daqui 45 min!',  bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}. Vai chegando!` },
      { label: '30min', minutes: 30, flag: 'reminder_30min_sent', title: '⏰ 30 minutos!',    bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}. Estamos te esperando!` },
      { label: '15min', minutes: 15, flag: 'reminder_15min_sent', title: '🔔 15 minutos!',    bodyFn: (s: string, t: string, b: string) => `${s} às ${t} com ${b}. Saia já!` },
    ] as const

    // ─── Expirar payment_intents vencidos ────────────────────────────────────
    const nowIso = now.toISOString()
    const { data: expiredIntents } = await adminSupabase
      .from('payment_intents')
      .select('id, appointment_id')
      .eq('status', 'pending')
      .lt('expires_at', nowIso)

    if (expiredIntents && expiredIntents.length > 0) {
      const expiredIds = expiredIntents.map((e) => e.id)
      const expiredApptIds = expiredIntents.map((e) => e.appointment_id)

      await adminSupabase
        .from('payment_intents')
        .update({ status: 'expired', updated_at: nowIso })
        .in('id', expiredIds)

      await adminSupabase
        .from('appointments')
        .update({ status: 'cancelado' })
        .in('id', expiredApptIds)
        .eq('status', 'aguardando_pagamento')

      console.log(`[cron] ${expiredIntents.length} payment_intents expirados processados.`)
    }

    // Busca agendamentos confirmados de hoje com client_id (usuários logados)
    const { data: appointments, error } = await adminSupabase
      .from('appointments')
      .select(`
        id, client_id, service_name_snapshot, start_time,
        reminder_90min_sent, reminder_75min_sent,
        reminder_1h_sent, reminder_45min_sent,
        reminder_30min_sent, reminder_15min_sent,
        barbers(name, nickname)
      `)
      .eq('date', todayStr)
      .eq('status', 'confirmado')
      .not('client_id', 'is', null)

    if (error) throw error
    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Nenhum agendamento hoje.' })
    }

    const sentCounts: Record<string, number> = {}
    let failed = 0

    for (const appt of appointments) {
      if (!appt.client_id || !appt.start_time) continue

      const [h, m] = appt.start_time.split(':').map(Number)
      const apptMinutes = h * 60 + m

      const barber = appt.barbers as unknown as { name: string; nickname: string | null } | null
      const barberName = barber?.nickname ?? barber?.name ?? 'barbeiro'
      const timeLabel = appt.start_time.slice(0, 5)
      const service = appt.service_name_snapshot ?? 'serviço'

      for (const reminder of REMINDERS) {
        const alreadySent = (appt as Record<string, unknown>)[reminder.flag] === true
        if (alreadySent) continue

        const minWindow = nowMinutes + reminder.minutes - 7
        const maxWindow = nowMinutes + reminder.minutes + 7
        if (apptMinutes < minWindow || apptMinutes > maxWindow) continue

        const result = await sendPushToUser(appt.client_id, {
          title: reminder.title,
          body: reminder.bodyFn(service, timeLabel, barberName),
          url: '/reservas',
          tag: `lembrete-${reminder.label}-${appt.id}`,
        })

        sentCounts[reminder.label] = (sentCounts[reminder.label] ?? 0) + result.sent
        failed += result.failed

        await adminSupabase
          .from('appointments')
          .update({ [reminder.flag]: true })
          .eq('id', appt.id)
      }
    }

    return NextResponse.json({
      date: todayStr,
      nowBrasilia: toTimeStr(nowMinutes),
      appointments: appointments.length,
      sent: sentCounts,
      failed,
      expiredIntents: expiredIntents?.length ?? 0,
    })
  } catch (e) {
    console.error('[cron/push-reminders]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
