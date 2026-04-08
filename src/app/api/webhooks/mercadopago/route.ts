import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Verificação de assinatura HMAC do Mercado Pago ──────────────────────────
function verifyMpSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string
): boolean {
  if (!xSignature) return false

  let ts: string | null = null
  let v1: string | null = null

  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=')
    if (key?.trim() === 'ts') ts = value?.trim() ?? null
    if (key?.trim() === 'v1') v1 = value?.trim() ?? null
  }

  if (!ts || !v1) return false

  // Monta o template conforme documentação MP
  const parts: string[] = []
  if (dataId) parts.push(`id:${dataId}`)
  if (xRequestId) parts.push(`request-id:${xRequestId}`)
  parts.push(`ts:${ts}`)
  const manifest = parts.join(';') + ';'

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
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
    const dataId = url.searchParams.get('data.id')       // ID do evento (pagamento)
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

    const adminClient = createAdminClient()

    // Busca o access token e webhook secret no business_config
    const { data: config } = await adminClient
      .from('business_config')
      .select('mp_access_token, mp_webhook_secret')
      .eq('id', 1)
      .single()

    if (!config?.mp_access_token) {
      console.warn('[MP Webhook] Access token não configurado — ignorando evento.')
      return NextResponse.json({ received: true })
    }

    // Verifica assinatura (apenas se o secret estiver configurado)
    if (config.mp_webhook_secret) {
      const valid = verifyMpSignature(xSignature, xRequestId, dataId, config.mp_webhook_secret)
      if (!valid) {
        console.warn('[MP Webhook] Assinatura HMAC inválida.')
        return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
      }
    }

    // Consulta os detalhes do pagamento na API do MP
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
    } else if (payment.status === 'pending' || payment.status === 'in_process') {
      // Pagamento pendente (ex: boleto, PIX aguardando) — mantém aguardando_pagamento
      newIntentStatus = 'pending'
    }

    // Atualiza payment_intent
    if (newIntentStatus) {
      await adminClient
        .from('payment_intents')
        .update({ status: newIntentStatus, mp_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq('appointment_id', appointmentId)
        .eq('status', 'pending')
    }

    // Atualiza o agendamento
    if (newAppointmentStatus) {
      await adminClient
        .from('appointments')
        .update({ status: newAppointmentStatus })
        .eq('id', appointmentId)
        .eq('status', 'aguardando_pagamento')
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[MP Webhook] Erro ao processar:', error)
    // Retorna 200 para evitar reenvio infinito do MP
    return NextResponse.json({ received: true })
  }
}
