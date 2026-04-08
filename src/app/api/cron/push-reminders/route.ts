import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/app/api/push/actions'
import { addDays, format } from 'date-fns'

// Roda diariamente às 12:00 UTC (9:00 Brasília)
// Envia lembrete push para clientes com agendamento CONFIRMADO amanhã

export async function GET(request: Request) {
  // Segurança: verifica secret do cron (Vercel envia automaticamente)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    const adminSupabase = createAdminClient()

    // Busca agendamentos confirmados para amanhã com client_id (usuários logados)
    const { data: appointments, error } = await adminSupabase
      .from('appointments')
      .select('client_id, client_name, service_name_snapshot, start_time, barber_id, barbers(name, nickname)')
      .eq('date', tomorrow)
      .eq('status', 'confirmado')
      .not('client_id', 'is', null)

    if (error) throw error
    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Nenhum agendamento amanhã.' })
    }

    let totalSent = 0
    let totalFailed = 0

    for (const appt of appointments) {
      if (!appt.client_id) continue

      const barber = appt.barbers as unknown as { name: string; nickname: string | null } | null
      const barberName = barber?.nickname ?? barber?.name ?? 'barbeiro'
      const time = appt.start_time?.slice(0, 5) ?? ''
      const service = appt.service_name_snapshot ?? 'serviço'

      const { sent, failed } = await sendPushToUser(appt.client_id, {
        title: '✂️ Lembrete de amanhã',
        body: `${service} às ${time} com ${barberName}. Te esperamos!`,
        url: '/reservas',
        tag: `lembrete-${appt.client_id}-${tomorrow}`,
      })

      totalSent += sent
      totalFailed += failed
    }

    return NextResponse.json({
      date: tomorrow,
      appointments: appointments.length,
      sent: totalSent,
      failed: totalFailed,
    })
  } catch (e) {
    console.error('[cron/push-reminders]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
