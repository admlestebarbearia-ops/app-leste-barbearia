import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { firePushToAdmins } from '@/app/api/push/actions'

// ─── Lembrete diário: "conclua os atendimentos de hoje" ───────────────────────
// Dispara notificação forte para o(s) admin(s) enquanto houver atendimentos de
// HOJE ainda 'confirmado' (esperando concluir/faltou). Ideal chamar via
// cron-job.org algumas vezes depois do horário de fechar (efeito "enche-saco"),
// já que o serviço externo não tem os limites da Vercel.
//
// Só faz sentido quando o AUTO-CONCLUIR está DESLIGADO (se ligado, os
// presenciais concluem sozinhos e não há o que lembrar).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    const { data: config } = await admin
      .from('business_config')
      .select('auto_conclude_enabled')
      .eq('id', 1)
      .maybeSingle()

    // Se o auto-concluir (presencial) está ligado, não precisa lembrar.
    if (config?.auto_conclude_enabled) {
      return NextResponse.json({ skipped: true, reason: 'auto_conclude_on' })
    }

    // Hoje em BRT (UTC-3).
    const todayBRT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Atendimentos de hoje ainda confirmados (esperando concluir/faltou),
    // ignorando bloqueios de horário.
    const { data: appts, error } = await admin
      .from('appointments')
      .select('id, is_admin_block')
      .eq('date', todayBRT)
      .eq('status', 'confirmado')

    if (error) throw error

    const pending = (appts ?? []).filter(
      (a: { is_admin_block: boolean | null }) => !a.is_admin_block,
    ).length

    if (pending === 0) {
      return NextResponse.json({ pending: 0, notified: false })
    }

    await firePushToAdmins({
      title: '📋 Conclua o dia de hoje',
      body: `Você tem ${pending} atendimento${pending > 1 ? 's' : ''} de hoje esperando. Quem veio? Quem faltou? Abra e confirme.`,
      url: '/admin',
      tag: 'conclude-reminder',
    })

    return NextResponse.json({ pending, notified: true })
  } catch (err) {
    console.error('[cron/conclude-reminder] erro:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
