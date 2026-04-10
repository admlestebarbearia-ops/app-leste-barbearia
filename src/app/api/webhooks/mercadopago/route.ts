import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Fetch estado do pagamento na API do MP ───────────────────────────────────
async function fetchMpPaymentStatus(paymentId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Não cachear respostas de webhook
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`MP API retornou ${res.status}`)
  return res.json() as Promise<{
    id: number
    status: string          // 'approved' | 'pending' | 'rejected' | 'cancelled' | 'refunded' | ...
    external_reference: string | null
    transaction_amount: number
  }>
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const dataId = url.searchParams.get('data.id')       // ID do evento (pagamento)

    // Lê o body para determinar tipo do evento
    const body = await request.json() as {
      type?: string
      action?: string
      data?: { id?: string | number }
    }

    // Apenas processa eventos de pagamento
    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const paymentIdRaw = body.data?.id ?? dataId
    if (!paymentIdRaw) {
      return NextResponse.json({ error: 'payment id ausente' }, { status: 400 })
    }
    const paymentId = String(paymentIdRaw)

    const adminClient = createAdminClient()

    // Busca o access token no business_config
    const { data: config } = await adminClient
      .from('business_config')
      .select('mp_access_token')
      .eq('id', 1)
      .single()

    if (!config?.mp_access_token) {
      console.warn('[MP Webhook] Access token não configurado — ignorando evento.')
      return NextResponse.json({ received: true })
    }

    // Consulta os detalhes do pagamento na API do MP (verifica autenticidade indiretamente)
    const payment = await fetchMpPaymentStatus(paymentId, config.mp_access_token)

    const appointmentId = payment.external_reference
    if (!appointmentId) {
      console.warn('[MP Webhook] external_reference ausente no pagamento', paymentId)
      return NextResponse.json({ received: true })
    }

    // Mapeia status MP → status do agendamento
    let newAppointmentStatus: string | null = null
    let newIntentStatus: string | null = null

    if (payment.status === 'approved') {
      newAppointmentStatus = 'confirmado'
      newIntentStatus = 'approved'
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      newAppointmentStatus = 'cancelado'
      newIntentStatus = payment.status === 'rejected' ? 'rejected' : 'cancelled'
    } else if (payment.status === 'refunded' || payment.status === 'charged_back') {
      // Reembolso emitido pelo MP/banco — retorna agendamento para cancelado
      newAppointmentStatus = 'cancelado'
      newIntentStatus = payment.status
    } else if (payment.status === 'pending' || payment.status === 'in_process') {
      // Pagamento pendente (ex: PIX aguardando) — mantém aguardando_pagamento
      newIntentStatus = 'pending'
    }

    // Atualiza payment_intent (sem filtrar por status anterior — permite atualizações subsequentes)
    if (newIntentStatus) {
      await adminClient
        .from('payment_intents')
        .update({ status: newIntentStatus, mp_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq('appointment_id', appointmentId)
    }

    // Atualiza o agendamento
    if (newAppointmentStatus) {
      await adminClient
        .from('appointments')
        .update({ status: newAppointmentStatus })
        .eq('id', appointmentId)
        .in('status', ['aguardando_pagamento', 'confirmado'])
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[MP Webhook] Erro ao processar:', error)
    // Retorna 200 para evitar reenvio infinito do MP
    return NextResponse.json({ received: true })
  }
}
