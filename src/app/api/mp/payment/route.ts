import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { randomUUID } from 'crypto'
import { processMercadoPagoPaymentRequest } from '@/lib/mercadopago/payment-route'

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

  const admin = createAdminClient()

  const result = await processMercadoPagoPaymentRequest(body, {
    getPendingAppointment: async (appointmentId) => {
      const { data } = await admin
        .from('appointments')
        .select('id, status, service_name_snapshot, service_price_snapshot, client_name, client_email, client_phone')
        .eq('id', appointmentId)
        .eq('status', 'aguardando_pagamento')
        .single()

      return data
    },
    getPaymentIntent: async (appointmentId) => {
      const { data } = await admin
        .from('payment_intents')
        .select('id, status, mp_payment_id, expires_at')
        .eq('appointment_id', appointmentId)
        .single()

      return data
    },
    expirePendingIntent: async (intentId) => {
      await admin
        .from('payment_intents')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', intentId)
        .eq('status', 'pending')
    },
    getAccessToken: async () => {
      const { data } = await admin
        .from('business_config')
        .select('mp_access_token')
        .single()

      return data?.mp_access_token ?? null
    },
    fetchExistingPaymentStatus: fetchMpPaymentStatus,
    createPayment: async ({ body, idempotencyKey, accessToken }) => {
      const mpClient = new MercadoPagoConfig({ accessToken })
      const mpPayment = new Payment(mpClient)

      const payment = await mpPayment.create({
        body,
        requestOptions: { idempotencyKey },
      })

      return {
        id: payment.id,
        status: payment.status ?? 'pending',
        status_detail: payment.status_detail,
      }
    },
    updatePaymentIntent: async (intentId, patch) => {
      await admin
        .from('payment_intents')
        .update(patch)
        .eq('id', intentId)
    },
    generateRandomId: () => randomUUID(),
    getNow: () => new Date(),
    getBaseUrl: () =>
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  })

  return NextResponse.json(result.body, { status: result.status })
}
