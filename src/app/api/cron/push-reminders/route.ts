import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/app/api/push/actions'

// Roda a cada 15 minutos via Vercel Cron
// Envia lembretes push 1h antes e 30min antes do horário do agendamento

export async function GET(request: Request) {
  // Segurança: verifica secret do cron (Vercel envia automaticamente)
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

    // Janelas de envio (em minutos a partir de agora)
    // 1h antes: start_time entre 55min e 65min daqui
    const min1h = nowMinutes + 55
    const max1h = nowMinutes + 65
    // 30min antes: start_time entre 25min e 35min daqui
    const min30 = nowMinutes + 25
    const max30 = nowMinutes + 35

    const toTimeStr = (minutes: number) => {
      const h = Math.floor((minutes % 1440) / 60).toString().padStart(2, '0')
      const m = (minutes % 60).toString().padStart(2, '0')
      return `${h}:${m}:00`
    }

    // Busca agendamentos confirmados de hoje com client_id (usuários logados)
    const { data: appointments, error } = await adminSupabase
      .from('appointments')
      .select('id, client_id, service_name_snapshot, start_time, reminder_1h_sent, reminder_30min_sent, barbers(name, nickname)')
      .eq('date', todayStr)
      .eq('status', 'confirmado')
      .not('client_id', 'is', null)

    if (error) throw error
    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Nenhum agendamento hoje.' })
    }

    let sent1h = 0
    let sent30 = 0
    let failed = 0

    for (const appt of appointments) {
      if (!appt.client_id || !appt.start_time) continue

      const [h, m] = appt.start_time.split(':').map(Number)
      const apptMinutes = h * 60 + m

      const barber = appt.barbers as unknown as { name: string; nickname: string | null } | null
      const barberName = barber?.nickname ?? barber?.name ?? 'barbeiro'
      const timeLabel = appt.start_time.slice(0, 5)
      const service = appt.service_name_snapshot ?? 'serviço'

      // Lembrete de 1h antes
      if (!appt.reminder_1h_sent && apptMinutes >= min1h && apptMinutes <= max1h) {
        const result = await sendPushToUser(appt.client_id, {
          title: '✂️ Daqui 1 hora!',
          body: `${service} às ${timeLabel} com ${barberName}. Não esqueça!`,
          url: '/reservas',
          tag: `lembrete-1h-${appt.id}`,
        })
        sent1h += result.sent
        failed += result.failed
        // Marca como enviado para não reenviar
        await adminSupabase
          .from('appointments')
          .update({ reminder_1h_sent: true })
          .eq('id', appt.id)
      }

      // Lembrete de 30min antes
      if (!appt.reminder_30min_sent && apptMinutes >= min30 && apptMinutes <= max30) {
        const result = await sendPushToUser(appt.client_id, {
          title: '⏰ 30 minutos!',
          body: `${service} às ${timeLabel} com ${barberName}. Estamos te esperando!`,
          url: '/reservas',
          tag: `lembrete-30min-${appt.id}`,
        })
        sent30 += result.sent
        failed += result.failed
        await adminSupabase
          .from('appointments')
          .update({ reminder_30min_sent: true })
          .eq('id', appt.id)
      }
    }

    return NextResponse.json({
      date: todayStr,
      nowBrasilia: toTimeStr(nowMinutes),
      appointments: appointments.length,
      sent1h,
      sent30min: sent30,
      failed,
    })
  } catch (e) {
    console.error('[cron/push-reminders]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
