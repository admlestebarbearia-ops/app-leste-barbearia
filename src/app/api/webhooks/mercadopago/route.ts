import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processMercadoPagoWebhook } from '@/lib/mercadopago/webhook-route'
import { mapMercadoPagoPaymentMethod } from '@/lib/mercadopago/integration-alignment'

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
    payment_method_id?: string | null
    payment_type_id?: string | null
    date_approved?: string | null
  }>
}

async function ensureFinancialEntryForApprovedPayment(
  adminClient: ReturnType<typeof createAdminClient>,
  input: {
    target: { kind: 'appointment' | 'product_reservation'; id: string }
    payment: {
      transaction_amount: number
      payment_method_id?: string | null
      payment_type_id?: string | null
      date_approved?: string | null
    }
  }
) {
  const { target, payment } = input
  const source = target.kind === 'appointment' ? 'agendamento' : 'produto'

  const { data: existingEntry } = await adminClient
    .from('financial_entries')
    .select('id')
    .eq('source', source)
    .eq('reference_id', target.id)
    .limit(1)
    .maybeSingle()

  if (existingEntry) return

  const paymentMethod = mapMercadoPagoPaymentMethod(
    payment.payment_method_id ?? null,
    payment.payment_type_id ?? null
  )
  const approvedDate = (payment.date_approved ?? new Date().toISOString()).slice(0, 10)

  if (target.kind === 'appointment') {
    const { data: appointment } = await adminClient
      .from('appointments')
      .select('service_name_snapshot, service_price_snapshot')
      .eq('id', target.id)
      .single()

    const amount = Number(payment.transaction_amount || appointment?.service_price_snapshot || 0)
    if (!(amount > 0)) return

    const { error } = await adminClient.from('financial_entries').insert({
      type: 'receita',
      source: 'agendamento',
      amount,
      description: appointment?.service_name_snapshot ?? 'Serviço',
      payment_method: paymentMethod,
      card_rate_pct: 0,
      net_amount: amount,
      reference_id: target.id,
      date: approvedDate,
      created_by: null,
    })

    if (error) throw error
    return
  }

  const { data: reservation } = await adminClient
    .from('product_reservations')
    .select('product_name_snapshot, product_price_snapshot, quantity')
    .eq('id', target.id)
    .single()

  const amount = Number(
    payment.transaction_amount || ((reservation?.product_price_snapshot ?? 0) * (reservation?.quantity ?? 1))
  )
  if (!(amount > 0)) return

  const { error } = await adminClient.from('financial_entries').insert({
    type: 'receita',
    source: 'produto',
    amount,
    description: reservation?.product_name_snapshot ?? 'Produto',
    payment_method: paymentMethod,
    card_rate_pct: 0,
    net_amount: amount,
    reference_id: target.id,
    date: approvedDate,
    created_by: null,
  })

  if (error) throw error
}

async function ensureFinancialReversalForCancelledPayment(
  adminClient: ReturnType<typeof createAdminClient>,
  input: {
    target: { kind: 'appointment' | 'product_reservation'; id: string }
  }
) {
  const { target } = input
  const source = target.kind === 'appointment' ? 'agendamento' : 'produto'

  const { data: existingReversal } = await adminClient
    .from('financial_entries')
    .select('id')
    .eq('source', 'estorno')
    .eq('reference_id', target.id)
    .limit(1)
    .maybeSingle()

  if (existingReversal) return

  const { data: existingRevenue } = await adminClient
    .from('financial_entries')
    .select('amount, description, payment_method, net_amount')
    .eq('source', source)
    .eq('reference_id', target.id)
    .limit(1)
    .maybeSingle()

  if (!existingRevenue) return

  const { error } = await adminClient.from('financial_entries').insert({
    type: 'despesa',
    source: 'estorno',
    amount: existingRevenue.amount,
    description: `Estorno automático: ${existingRevenue.description}`,
    payment_method: existingRevenue.payment_method ?? null,
    card_rate_pct: 0,
    net_amount: -Math.abs(existingRevenue.net_amount ?? existingRevenue.amount),
    reference_id: target.id,
    date: new Date().toISOString().slice(0, 10),
    created_by: null,
  })

  if (error) throw error
}

async function syncFinancialEntryForPaymentStatus(
  adminClient: ReturnType<typeof createAdminClient>,
  input: {
    target: { kind: 'appointment' | 'product_reservation'; id: string }
    payment: {
      status: string
      transaction_amount: number
      payment_method_id?: string | null
      payment_type_id?: string | null
      date_approved?: string | null
    }
  }
) {
  if (input.payment.status === 'approved') {
    await ensureFinancialEntryForApprovedPayment(adminClient, input)
    return
  }

  if (
    input.payment.status === 'cancelled' ||
    input.payment.status === 'refunded' ||
    input.payment.status === 'charged_back'
  ) {
    await ensureFinancialReversalForCancelledPayment(adminClient, input)
  }
}

async function updateProductReservationStatus(
  adminClient: ReturnType<typeof createAdminClient>,
  reservationId: string,
  status: 'reservado' | 'cancelado'
) {
  const nowIso = new Date().toISOString()

  const { data: currentReservation } = await adminClient
    .from('product_reservations')
    .select('product_id, quantity, status')
    .eq('id', reservationId)
    .single()

  if (!currentReservation) return

  if (status === 'cancelado' && currentReservation.status !== 'cancelado') {
    const { data: product } = await adminClient
      .from('products')
      .select('stock_quantity')
      .eq('id', currentReservation.product_id)
      .single()

    if (product && product.stock_quantity >= 0) {
      const { error: restoreStockError } = await adminClient
        .from('products')
        .update({ stock_quantity: product.stock_quantity + currentReservation.quantity })
        .eq('id', currentReservation.product_id)

      if (restoreStockError) throw restoreStockError
    }
  }

  const { error } = await adminClient
    .from('product_reservations')
    .update({ status, updated_at: nowIso })
    .eq('id', reservationId)

  if (error) throw error
}

export async function POST(request: NextRequest) {
  let body: {
    type?: string
    action?: string
    data?: { id?: string | number }
  }

  try {
    body = await request.json() as {
      type?: string
      action?: string
      data?: { id?: string | number }
    }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  try {
    const result = await processMercadoPagoWebhook(
      {
        url: request.url,
        headers: {
          xSignature: request.headers.get('x-signature'),
          xRequestId: request.headers.get('x-request-id'),
        },
        body,
      },
      {
        webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
        getAccessToken: async () => {
          const { data } = await adminClient
            .from('business_config')
            .select('mp_access_token')
            .eq('id', 1)
            .single()

          return data?.mp_access_token ?? null
        },
        fetchPaymentStatus: fetchMpPaymentStatus,
        updatePaymentIntentByAppointmentId: async (appointmentId, patch) => {
          const { error } = await adminClient
            .from('payment_intents')
            .update(patch)
            .eq('appointment_id', appointmentId)

          if (error) throw error
        },
        updateProductPaymentIntentByReservationId: async (reservationId, patch) => {
          const { error } = await adminClient
            .from('product_payment_intents')
            .update(patch)
            .eq('reservation_id', reservationId)

          if (error) throw error
        },
        updateAppointmentStatus: async (appointmentId, status) => {
          const { error } = await adminClient
            .from('appointments')
            .update({ status })
            .eq('id', appointmentId)
            .in('status', ['aguardando_pagamento', 'confirmado'])

          if (error) throw error
        },
        updateProductReservationStatus: async (reservationId, status) => {
          await updateProductReservationStatus(adminClient, reservationId, status)
        },
        syncFinancialEntry: async ({ target, payment }) => {
          await syncFinancialEntryForPaymentStatus(adminClient, { target, payment })
        },
        getNow: () => new Date(),
      }
    )

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('[MP Webhook] Erro ao processar:', error)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
