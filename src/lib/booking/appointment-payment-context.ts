import { createAdminClient } from '@/lib/supabase/admin'

export type AppointmentPaymentContext = 'paid_online' | 'pay_locally'

export async function getAppointmentPaymentContextMap(appointmentIds: string[]) {
  const uniqueIds = [...new Set(appointmentIds.filter((id) => typeof id === 'string' && id.length > 0))]

  if (uniqueIds.length === 0) {
    return {} as Record<string, AppointmentPaymentContext>
  }

  const adminClient = createAdminClient()
  const [{ data: approvedIntents }, { data: revenueEntries }] = await Promise.all([
    adminClient
      .from('payment_intents')
      .select('appointment_id')
      .eq('status', 'approved')
      .in('appointment_id', uniqueIds),
    adminClient
      .from('financial_entries')
      .select('reference_id')
      .eq('source', 'agendamento')
      .in('reference_id', uniqueIds),
  ])

  const paidOnlineIds = new Set<string>()

  for (const paymentIntent of approvedIntents ?? []) {
    if (paymentIntent.appointment_id) {
      paidOnlineIds.add(paymentIntent.appointment_id)
    }
  }

  for (const entry of revenueEntries ?? []) {
    if (entry.reference_id) {
      paidOnlineIds.add(entry.reference_id)
    }
  }

  return Object.fromEntries(
    uniqueIds.map((appointmentId) => [
      appointmentId,
      paidOnlineIds.has(appointmentId) ? 'paid_online' : 'pay_locally',
    ])
  ) as Record<string, AppointmentPaymentContext>
}