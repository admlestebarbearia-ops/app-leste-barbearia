import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Auto-concluir atendimentos de dias passados ──────────────────────────────
// Marca como 'concluido' os agendamentos CONFIRMADOS de datas anteriores a hoje
// (BRT) e cria o lançamento financeiro correspondente:
//   • Pago online (payment_intent aprovado) → forma real detectada.
//   • Presencial → PAGO, valor cheio, forma "a definir" (corrigível depois).
//
// Segurança:
//   • Só roda se business_config.auto_conclude_enabled = true (padrão OFF).
//   • Só toca em datas PASSADAS (nunca no dia de hoje) e ignora bloqueios de horário.
//   • Optimistic lock (.eq('status','confirmado')) evita corrida com o barbeiro.
//   • Idempotente: não duplica financial_transactions (checa source_id existente).
//   • Reutiliza EXATAMENTE a mesma tabela/colunas do botão "Concluir Todos".
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Pagos online SEMPRE concluem (dinheiro já entrou, é seguro).
    // Presenciais só concluem se o barbeiro ativou o auto-concluir.
    const { data: config } = await admin
      .from('business_config')
      .select('auto_conclude_enabled')
      .eq('id', 1)
      .maybeSingle()

    const presencialEnabled = config?.auto_conclude_enabled === true

    // Hoje em BRT (UTC-3, sem horário de verão no Brasil).
    const todayBRT = new Date(Date.now() - 3 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Agendamentos confirmados de dias ANTERIORES a hoje.
    const { data: appts, error: apptErr } = await admin
      .from('appointments')
      .select('id, date, is_admin_block, service_name_snapshot, service_price_snapshot')
      .eq('status', 'confirmado')
      .lt('date', todayBRT)

    if (apptErr) throw apptErr
    if (!appts?.length) return NextResponse.json({ concluded: 0, total: 0 })

    type Appt = {
      id: string
      date: string
      is_admin_block: boolean | null
      service_name_snapshot: string | null
      service_price_snapshot: number | null
    }

    let concluded = 0
    let skipped = 0
    const errors: string[] = []

    for (const appt of appts as Appt[]) {
      // Ignora bloqueios de horário (não são atendimentos reais).
      if (appt.is_admin_block) { skipped++; continue }

      // Detecta pagamento online aprovado para gravar a forma real.
      const { data: pi } = await admin
        .from('payment_intents')
        .select('status, payment_method, refunded_at')
        .eq('appointment_id', appt.id)
        .maybeSingle()

      const onlinePaid = pi?.status === 'approved' && !pi?.refunded_at
      const resolvedMethod = onlinePaid ? (pi?.payment_method ?? 'mercado_pago') : null

      // Presencial (sem pagamento online) só conclui se o barbeiro ativou.
      // Pagos online concluem sempre (dinheiro já entrou).
      if (!onlinePaid && !presencialEnabled) { skipped++; continue }

      // Atualiza status com optimistic lock — só se ainda estiver confirmado.
      const { data: updated, error: updErr } = await admin
        .from('appointments')
        .update({ status: 'concluido' })
        .eq('id', appt.id)
        .eq('status', 'confirmado')
        .select('id')

      if (updErr) { errors.push(`${appt.id}: ${updErr.message}`); continue }
      if (!updated?.length) { skipped++; continue } // já concluído por outro caminho

      // Lançamento financeiro (idempotente).
      const amount = appt.service_price_snapshot ?? 0
      if (amount > 0) {
        const { data: existingTx } = await admin
          .from('financial_transactions')
          .select('id')
          .eq('source_id', appt.id)
          .eq('source_type', 'APPOINTMENT')
          .maybeSingle()

        if (!existingTx) {
          const service = appt.service_name_snapshot ?? 'Serviço'
          const description = resolvedMethod
            ? `${service} (${resolvedMethod})`
            : `${service} (a definir)`
          const { error: txErr } = await admin.from('financial_transactions').insert({
            amount,
            type: 'IN',
            status: 'PAID',
            due_date: appt.date,
            source_id: appt.id,
            source_type: 'APPOINTMENT',
            description,
          })
          if (txErr) { errors.push(`tx ${appt.id}: ${txErr.message}`); continue }
        }
      }

      concluded++
    }

    return NextResponse.json({ concluded, skipped, total: appts.length, errors })
  } catch (err) {
    console.error('[cron/auto-conclude] erro:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
