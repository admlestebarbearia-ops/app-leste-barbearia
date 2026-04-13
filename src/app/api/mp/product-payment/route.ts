import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { randomUUID } from 'crypto'
import { processMercadoPagoProductPaymentRequest } from '@/lib/mercadopago/product-payment-route'

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

async function restoreProductStock(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  quantity: number
) {
  const { data: product } = await admin
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single()

  if (product && product.stock_quantity >= 0) {
    await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity + quantity })
      .eq('id', productId)
  }
}

async function expirePendingReservationPayment(
  admin: ReturnType<typeof createAdminClient>,
  reservationId: string
) {
  const nowIso = new Date().toISOString()

  const { data: reservation } = await admin
    .from('product_reservations')
    .select('product_id, quantity, status')
    .eq('id', reservationId)
    .single()

  await admin
    .from('product_payment_intents')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('reservation_id', reservationId)
    .eq('status', 'pending')

  if (reservation?.status === 'aguardando_pagamento') {
    await restoreProductStock(admin, reservation.product_id, reservation.quantity)

    await admin
      .from('product_reservations')
      .update({ status: 'cancelado', updated_at: nowIso })
      .eq('id', reservationId)
      .eq('status', 'aguardando_pagamento')
  }
}

export async function POST(req: NextRequest) {
  let body: { formData: Record<string, unknown>; reservationId: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const result = await processMercadoPagoProductPaymentRequest(body, {
    getPendingReservation: async (reservationId) => {
      const { data: reservation } = await admin
        .from('product_reservations')
        .select('id, status, client_id, client_phone, product_name_snapshot, product_price_snapshot, quantity')
        .eq('id', reservationId)
        .eq('status', 'aguardando_pagamento')
        .single()

      if (!reservation) return null

      const { data: profile } = reservation.client_id
        ? await admin
            .from('profiles')
            .select('display_name, email, phone')
            .eq('id', reservation.client_id)
            .single()
        : { data: null }

      return {
        ...reservation,
        client_name: profile?.display_name ?? null,
        client_email: profile?.email ?? null,
        client_phone: reservation.client_phone ?? profile?.phone ?? null,
      }
    },
    getPaymentIntent: async (reservationId) => {
      const { data } = await admin
        .from('product_payment_intents')
        .select('id, status, mp_payment_id, expires_at')
        .eq('reservation_id', reservationId)
        .single()

      return data
    },
    expirePendingIntent: async (intentId, reservationId) => {
      void intentId
      await expirePendingReservationPayment(admin, reservationId)
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
        .from('product_payment_intents')
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