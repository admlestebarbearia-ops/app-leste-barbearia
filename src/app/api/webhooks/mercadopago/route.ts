import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processMercadoPagoWebhook } from '@/lib/mercadopago/webhook-route'
import { firePushToUser, firePushToAdmins } from '@/app/api/push/actions'

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
          // Busca detalhes ANTES de atualizar (push + detecção de fiado)
          const { data: appt } = await adminClient
            .from('appointments')
            .select('client_id, client_name, service_name_snapshot, date, start_time, current_status:status, expected_payment_date')
            .eq('id', appointmentId)
            .single()

          const { error } = await adminClient
            .from('appointments')
            .update({ status })
            .eq('id', appointmentId)
            .in('status', ['aguardando_pagamento', 'confirmado'])

          if (error) throw error

          // ── Baixa automática de fiado ──────────────────────────────────────
          // Se o agendamento já estava `concluido` com promessa de pagamento
          // e o MP aprovou → marcar transação financeira como PAID.
          // O trigger de INSERT não é acionado aqui (é só UPDATE).
          const isFiadoQuitacao =
            status === 'confirmado' &&
            (appt as Record<string, unknown>)?.current_status === 'concluido' &&
            (appt as Record<string, unknown>)?.expected_payment_date != null

          if (isFiadoQuitacao) {
            try {
              const { error: ftErr } = await adminClient
                .from('financial_transactions')
                .update({ status: 'PAID' })
                .eq('source_id', appointmentId)
                .eq('source_type', 'APPOINTMENT')
                .eq('status', 'PENDING')

              if (ftErr) console.error('[Fiado] Erro ao dar baixa automática:', ftErr)
            } catch (ftEx) {
              console.error('[Fiado] Exceção ao dar baixa automática:', ftEx)
            }

            // Notifica admin: fiado quitado via MP
            void firePushToAdmins({
              title: '💰 Fiado quitado via Mercado Pago',
              body: `${(appt as Record<string, unknown>)?.client_name ?? 'Cliente'} pagou o agendamento de ${String((appt as Record<string, unknown>)?.date ?? '').split('-').reverse().join('/')} às ${String((appt as Record<string, unknown>)?.start_time ?? '').slice(0, 5)}`,
              url: '/admin',
              tag: `admin-fiado-quitado-${appointmentId}`,
            })
            return // não processa push de "confirmação" normal para agendados concluídos
          }

          // Pagamento normal aprovado → notifica cliente e admins
          if (status === 'confirmado') {
            if (appt?.client_id) {
              void firePushToUser(appt.client_id, {
                title: '💳 Pagamento confirmado!',
                body: `${appt.service_name_snapshot ?? 'Serviço'} em ${appt.date.split('-').reverse().join('/')} às ${appt.start_time.slice(0, 5)} está confirmado.`,
                url: '/reservas',
                tag: `pagamento-confirmado-${appointmentId}`,
              })
            }
            void firePushToAdmins({
              title: '💳 Pagamento recebido',
              body: `${appt?.client_name ?? 'Cliente'} — ${appt?.service_name_snapshot ?? 'Serviço'} em ${appt?.date?.split('-').reverse().join('/') ?? '?'} às ${appt?.start_time?.slice(0, 5) ?? '?'}`,
              url: '/admin',
              tag: `admin-pagamento-${appointmentId}`,
            })
          }
        },
        updateProductReservationStatus: async (reservationId, status) => {
          await updateProductReservationStatus(adminClient, reservationId, status)
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
