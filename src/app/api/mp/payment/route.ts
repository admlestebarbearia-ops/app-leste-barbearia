import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { randomUUID } from 'crypto'
import {
  buildPaymentCreationIdempotencyKey,
  isPaymentIntentExpired,
  mapMercadoPagoStatusToIntentStatus,
  shouldReuseMercadoPagoPayment,
  validateMercadoPagoPaymentRequest,
} from '@/lib/mercadopago/payment-flow'

// Campos permitidos vindos do Payment Brick — whitelist de segurança
const ALLOWED_FORM_FIELDS = [
  'token',
  'payment_method_id',
  'payment_type_id',
  'installments',
  'issuer_id',
  'payer',
] as const

type AllowedField = (typeof ALLOWED_FORM_FIELDS)[number]

function sanitizeFormData(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) =>
      (ALLOWED_FORM_FIELDS as readonly string[]).includes(key as AllowedField)
    )
  )
}

async function fetchMpPaymentStatus(paymentId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`MP API retornou ${res.status}`)
  }

  return res.json() as Promise<{
    id: number
    status: string
    status_detail?: string
  }>
}

export async function POST(req: NextRequest) {
  let body: { formData: Record<string, unknown>; appointmentId: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const { formData, appointmentId } = body

  // Validação básica de entrada
  if (
    !formData ||
    typeof formData !== 'object' ||
    typeof appointmentId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(appointmentId)
  ) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Busca o agendamento — deve existir e estar aguardando pagamento
  const { data: appt } = await admin
    .from('appointments')
    .select('id, status, service_name_snapshot, service_price_snapshot')
    .eq('id', appointmentId)
    .eq('status', 'aguardando_pagamento')
    .single()

  if (!appt) {
    return NextResponse.json(
      { error: 'Agendamento não encontrado ou pagamento já processado.' },
      { status: 404 }
    )
  }

  const { data: paymentIntent } = await admin
    .from('payment_intents')
    .select('id, status, mp_payment_id, expires_at')
    .eq('appointment_id', appointmentId)
    .single()

  if (!paymentIntent) {
    return NextResponse.json(
      { error: 'Controle de pagamento não encontrado.' },
      { status: 409 }
    )
  }

  if (isPaymentIntentExpired(paymentIntent.expires_at)) {
    await admin
      .from('payment_intents')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', paymentIntent.id)
      .eq('status', 'pending')

    return NextResponse.json(
      { error: 'Prazo de pagamento expirado. Faça um novo agendamento.' },
      { status: 409 }
    )
  }

  // Obtém access token do Mercado Pago do banco (fonte confiável)
  const { data: config } = await admin
    .from('business_config')
    .select('mp_access_token')
    .single()

  if (!config?.mp_access_token) {
    return NextResponse.json(
      { error: 'Pagamento online não configurado. Contate a barbearia.' },
      { status: 503 }
    )
  }

  const mpClient = new MercadoPagoConfig({ accessToken: config.mp_access_token })
  const mpPayment = new Payment(mpClient)

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Sanitiza campos do formulário (remove qualquer campo injetado pelo cliente)
  const safeFormData = sanitizeFormData(formData)
  const paymentDescription = appt.service_name_snapshot ?? 'Serviço Barbearia'

  const validationError = validateMercadoPagoPaymentRequest({
    appointmentId,
    amount: Number(appt.service_price_snapshot),
    description: paymentDescription,
    formData: safeFormData,
  })

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  try {
    if (paymentIntent.mp_payment_id && shouldReuseMercadoPagoPayment(paymentIntent.status)) {
      const existingPayment = await fetchMpPaymentStatus(paymentIntent.mp_payment_id, config.mp_access_token)
      const existingIntentStatus = mapMercadoPagoStatusToIntentStatus(existingPayment.status)

      await admin
        .from('payment_intents')
        .update({
          status: existingIntentStatus,
          mp_payment_id: String(existingPayment.id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentIntent.id)

      if (shouldReuseMercadoPagoPayment(existingPayment.status)) {
        return NextResponse.json({
          status: existingPayment.status,
          statusDetail: existingPayment.status_detail,
          paymentId: existingPayment.id,
          reused: true,
        })
      }
    }

    const payment = await mpPayment.create({
      body: {
        ...safeFormData,
        // Valores confiáveis do banco — nunca do cliente
        transaction_amount: Number(appt.service_price_snapshot),
        description: paymentDescription,
        statement_descriptor: 'BARBEARIA LESTE',
        external_reference: appointmentId,
        installments: 1,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      },
      requestOptions: {
        idempotencyKey: paymentIntent.mp_payment_id
          ? randomUUID()
          : buildPaymentCreationIdempotencyKey(paymentIntent.id),
      },
    })

    const mappedIntentStatus = mapMercadoPagoStatusToIntentStatus(payment.status)

    // O backend NUNCA confirma o agendamento aqui.
    // A confirmação oficial vem apenas pelo webhook do Mercado Pago.
    await admin
      .from('payment_intents')
      .update({
        status: mappedIntentStatus,
        mp_payment_id: payment.id ? String(payment.id) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentIntent.id)

    return NextResponse.json({
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentId: payment.id,
    })
  } catch (err) {
    console.error('[MP Payment] Erro ao processar:', err)
    return NextResponse.json(
      { error: 'Erro ao processar pagamento. Tente novamente.' },
      { status: 500 }
    )
  }
}
