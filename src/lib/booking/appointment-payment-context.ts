import { createAdminClient } from '@/lib/supabase/admin'
import type { PaymentMethod } from '@/lib/supabase/types'

export type AppointmentPaymentContext = 'paid_online' | 'pay_locally' | 'paid' | 'refunded'

export interface AppointmentPaymentSummary {
  paymentContext: AppointmentPaymentContext
  paymentMethod: PaymentMethod | null
  hasApprovedOnlinePayment: boolean
  hasRevenue: boolean
  hasRefund: boolean
}

export async function getAppointmentPaymentSummaryMap(appointmentIds: string[]) {
  const uniqueIds = [...new Set(appointmentIds.filter((id) => typeof id === 'string' && id.length > 0))]

  if (uniqueIds.length === 0) {
    return {} as Record<string, AppointmentPaymentSummary>
  }

  const adminClient = createAdminClient()
  const [{ data: intents }, { data: entries }] = await Promise.all([
    adminClient
      .from('payment_intents')
      .select('appointment_id, status, payment_method, refunded_at')
      .in('appointment_id', uniqueIds),
    adminClient
      .from('financial_entries')
      .select('reference_id, source, payment_method')
      .in('source', ['agendamento', 'estorno'])
      .in('reference_id', uniqueIds),
  ])

  const summaryById: Record<string, AppointmentPaymentSummary> = Object.fromEntries(
    uniqueIds.map((appointmentId) => [
      appointmentId,
      {
        paymentContext: 'pay_locally',
        paymentMethod: null,
        hasApprovedOnlinePayment: false,
        hasRevenue: false,
        hasRefund: false,
      },
    ])
  )

  for (const intent of intents ?? []) {
    if (!intent.appointment_id || !summaryById[intent.appointment_id]) continue
    const current = summaryById[intent.appointment_id]

    if (intent.status === 'approved') {
      current.hasApprovedOnlinePayment = true
      current.paymentMethod = current.paymentMethod ?? intent.payment_method ?? null
    }

    if (intent.refunded_at) {
      current.hasRefund = true
      current.paymentMethod = current.paymentMethod ?? intent.payment_method ?? null
    }
  }

  for (const entry of entries ?? []) {
    if (!entry.reference_id || !summaryById[entry.reference_id]) continue
    const current = summaryById[entry.reference_id]

    if (entry.source === 'agendamento') {
      current.hasRevenue = true
      current.paymentMethod = entry.payment_method ?? current.paymentMethod
      continue
    }

    if (entry.source === 'estorno') {
      current.hasRefund = true
      current.paymentMethod = entry.payment_method ?? current.paymentMethod
    }
  }

  for (const appointmentId of uniqueIds) {
    const current = summaryById[appointmentId]
    current.paymentContext = current.hasRefund
      ? 'refunded'
      : current.hasRevenue
      ? 'paid'
      : current.hasApprovedOnlinePayment
      ? 'paid_online'
      : 'pay_locally'
  }

  return summaryById
}

export async function getAppointmentPaymentContextMap(appointmentIds: string[]) {
  const summaryById = await getAppointmentPaymentSummaryMap(appointmentIds)
  return Object.fromEntries(
    Object.entries(summaryById).map(([appointmentId, summary]) => [
      appointmentId,
      summary.paymentContext,
    ])
  ) as Record<string, AppointmentPaymentContext>
}