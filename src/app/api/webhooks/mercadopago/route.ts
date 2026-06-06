import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processMercadoPagoWebhook } from '@/lib/mercadopago/webhook-route'
import { notifyMercadoPagoAppointmentStatusChange } from '@/lib/mercadopago/webhook-notifications'
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
            // Guarda de estado: impede que webhook tardio sobrescreva um intent
            // já cancelado manualmente ou expirado há muito tempo.
            .in('status', ['pending', 'expired'])

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
            .select('client_id, client_name, service_name_snapshot, date, start_time, barber_id, current_status:status, expected_payment_date')
            .eq('id', appointmentId)
            .single()

          // Ressurreição segura: PIX aprovado após o cron cancelar por falta de pagamento.
          // Antes de restaurar, verifica se o horário ainda está livre (sem colisão).
          if (status === 'confirmado' && appt?.current_status === 'cancelado_falta_pagamento') {
            if (!appt.barber_id || !appt.date || !appt.start_time) {
              throw new Error(
                `[MP Webhook] Dados insuficientes para verificar conflito (appointmentId=${appointmentId})`
              )
            }

            const { count: conflictCount } = await adminClient
              .from('appointments')
              .select('id', { count: 'exact', head: true })
              .eq('barber_id', appt.barber_id)
              .eq('date', appt.date)
              .eq('start_time', appt.start_time)
              .in('status', ['confirmado', 'aguardando_pagamento'])
              .neq('id', appointmentId)
              .is('deleted_at', null)

            if (conflictCount !== null && conflictCount > 0) {
              console.error('[MP Webhook] Conflito de agendamento detectado — ressurreição bloqueada', {
                appointmentId,
                barber_id: appt.barber_id,
                date: appt.date,
                start_time: appt.start_time,
                conflictCount,
              })
              // Retorna 200 ao MP: o dinheiro foi recebido e o barbeiro
              // tratará o caso manualmente via painel admin.
              return
            }
          }

          // Transições de status permitidas:
          // 'confirmado' → 'aguardando_pagamento' (fluxo normal) ou
          //                'cancelado_falta_pagamento' (ressurreição sem colisão).
          // 'cancelado'  → 'aguardando_pagamento' (recusa) ou 'confirmado' (estorno).
          const allowedFromStatus: string[] = status === 'confirmado'
            ? ['aguardando_pagamento', 'cancelado_falta_pagamento']
            : ['aguardando_pagamento', 'confirmado']

          const { data: updatedRows, error } = await adminClient
            .from('appointments')
            .update({ status })
            .eq('id', appointmentId)
            .in('status', allowedFromStatus)
            .select('id')

          if (error) throw error
          if (!updatedRows || updatedRows.length === 0) {
            throw new Error(
              `[MP Webhook] UPDATE afetou 0 linhas — status incompatível (appointmentId=${appointmentId}, nextStatus=${status})`
            )
          }

          if (
            status === 'confirmado' &&
            appt?.current_status === 'concluido' &&
            appt.expected_payment_date != null
          ) {
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
          }

          await notifyMercadoPagoAppointmentStatusChange(
            {
              appointmentId,
              nextStatus: status,
              appointment: appt
                ? {
                    client_id: appt.client_id ?? null,
                    client_name: appt.client_name ?? null,
                    service_name_snapshot: appt.service_name_snapshot ?? null,
                    date: appt.date ?? null,
                    start_time: appt.start_time ?? null,
                    current_status: appt.current_status ?? null,
                    expected_payment_date: appt.expected_payment_date ?? null,
                  }
                : null,
            },
            {
              notifyUser: firePushToUser,
              notifyAdmins: firePushToAdmins,
            }
          )
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
