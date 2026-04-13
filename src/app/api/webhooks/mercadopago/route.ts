import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processMercadoPagoWebhook } from '@/lib/mercadopago/webhook-route'

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
        updateAppointmentStatus: async (appointmentId, status) => {
          const { error } = await adminClient
            .from('appointments')
            .update({ status })
            .eq('id', appointmentId)
            .in('status', ['aguardando_pagamento', 'confirmado'])

          if (error) throw error
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
