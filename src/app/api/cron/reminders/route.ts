import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { firePushToUser, firePushToAdmins } from '@/app/api/push/actions'

export async function GET(request: NextRequest) {
  // Autenticação via CRON_SECRET (Vercel injeta o Bearer automaticamente)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const adminClient = createAdminClient()

    // Busca transações PENDING com vencimento hoje
    const { data: pendingTxs, error: txErr } = await adminClient
      .from('financial_transactions')
      .select('id, amount, source_id')
      .eq('status', 'PENDING')
      .eq('source_type', 'APPOINTMENT')
      .eq('due_date', today)

    if (txErr) throw txErr
    if (!pendingTxs?.length) return NextResponse.json({ sent: 0, total: 0 })

    // Busca detalhes dos agendamentos correspondentes
    const apptIds = pendingTxs.map((t: { source_id: string }) => t.source_id)
    const { data: appts, error: apptErr } = await adminClient
      .from('appointments')
      .select('id, client_id, client_name, service_name_snapshot, date, start_time')
      .in('id', apptIds)

    if (apptErr) throw apptErr

    // Envia push para cada cliente com débito vencendo hoje
    let sent = 0
    for (const tx of pendingTxs as Array<{ id: string; amount: number; source_id: string }>) {
      const appt = (appts as Array<{ id: string; client_id: string; client_name: string; service_name_snapshot: string; date: string; start_time: string }>)?.find(
        (a) => a.id === tx.source_id
      )
      if (!appt?.client_id) continue

      try {
        await firePushToUser(appt.client_id, {
          title: '⏰ Lembrete de pagamento',
          body: `Seu pagamento de R$ ${Number(tx.amount).toFixed(2).replace('.', ',')} (${appt.service_name_snapshot ?? 'Serviço'}) vence hoje!`,
          url: '/reservas',
          tag: `fiado-reminder-${tx.id}`,
        })
        sent++
      } catch {
        // silencioso — cliente sem push registrado
      }
    }

    // Resumo para o admin
    if (sent > 0) {
      void firePushToAdmins({
        title: '🔔 Lembretes de fiado enviados',
        body: `${sent} cliente(s) notificado(s) sobre pagamento(s) que vencem hoje.`,
        url: '/admin',
        tag: `admin-fiado-reminders-${today}`,
      })
    }

    return NextResponse.json({ sent, total: pendingTxs.length })
  } catch (err) {
    console.error('[cron/reminders] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
