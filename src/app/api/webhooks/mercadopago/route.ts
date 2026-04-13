import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac, timingSafeEqual } from 'crypto'
import { mapMercadoPagoStatusToIntentStatus } from '@/lib/mercadopago/payment-flow'

// ─── Valida assinatura do webhook (x-signature header) ───────────────────────
// Conforme documentação MP: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
function validateMpSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string
): boolean {
  if (!xSignature) return false

  let ts: string | null = null
  let hash: string | null = null

  for (const part of xSignature.split(',')) {
    const [k, v] = part.split('=')
    if (k?.trim() === 'ts') ts = v?.trim() ?? null
    if (k?.trim() === 'v1') hash = v?.trim() ?? null
  }

  if (!ts || !hash) return false

  // Monta o template conforme spec do MP
  const parts: string[] = []
  if (dataId) parts.push(`id:${dataId}`)
  if (xRequestId) parts.push(`request-id:${xRequestId}`)
  if (ts) parts.push(`ts:${ts}`)
  const template = parts.join(';') + ';'

  const computed = createHmac('sha256', secret).update(template).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

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
    const dataId = url.searchParams.get('data.id')          // ID do evento (pagamento)
    const xSignature = request.headers.get('x-signature')
    const xRequestId = request.headers.get('x-request-id')

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

    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    if (webhookSecret) {
      const valid = validateMpSignature(xSignature, xRequestId, dataId ?? paymentId, webhookSecret)
      if (!valid) {
        console.warn('[MP Webhook] Assinatura ausente ou inválida — validando via API do Mercado Pago.')
      }
    }

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
      newIntentStatus = mapMercadoPagoStatusToIntentStatus(payment.status)
    } else if (payment.status === 'refunded' || payment.status === 'charged_back') {
      // Reembolso emitido pelo MP/banco — retorna agendamento para cancelado
      newAppointmentStatus = 'cancelado'
      newIntentStatus = mapMercadoPagoStatusToIntentStatus(payment.status)
    } else if (payment.status === 'pending' || payment.status === 'in_process') {
      // Pagamento pendente (ex: PIX aguardando) — mantém aguardando_pagamento
      newIntentStatus = mapMercadoPagoStatusToIntentStatus(payment.status)
    }

    // Atualiza payment_intent (sem filtrar por status anterior — permite atualizações subsequentes)
    if (newIntentStatus) {
      const { error: intentError } = await adminClient
        .from('payment_intents')
        .update({ status: newIntentStatus, mp_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq('appointment_id', appointmentId)

      if (intentError) throw intentError
    }

    // Atualiza o agendamento
    if (newAppointmentStatus) {
      const { error: appointmentError } = await adminClient
        .from('appointments')
        .update({ status: newAppointmentStatus })
        .eq('id', appointmentId)
        .in('status', ['aguardando_pagamento', 'confirmado'])

      if (appointmentError) throw appointmentError
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[MP Webhook] Erro ao processar:', error)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
