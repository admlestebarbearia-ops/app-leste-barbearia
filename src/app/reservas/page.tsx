import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReservasClient } from './ReservasClient'
import { dedupeById, GUEST_BOOKING_PHONE_COOKIE, isAuthenticatedUser, normalizePhoneLookup } from '@/lib/auth/session-state'
import type { AppointmentStatus, BusinessConfig, ProductReservation } from '@/lib/supabase/types'
import { getAppointmentPaymentSummaryMap } from '@/lib/booking/appointment-payment-context'
import type { AppointmentPaymentContext } from '@/lib/booking/appointment-payment-context'
import { getAppointmentOperationalStatus, isAppointmentPast } from '@/lib/booking/appointment-visibility'

interface HistoryApptBase {
  id: string
  date: string
  start_time: string
  status: AppointmentStatus | 'aguardando_acao_barbeiro'
  service_name_snapshot: string | null
  services: { name: string } | null
}

interface HistoryAppt extends HistoryApptBase {
  payment_context: AppointmentPaymentContext | null
}

interface HistoryApptRow extends Omit<HistoryApptBase, 'services' | 'status'> {
  status: AppointmentStatus
  services: { name: string } | { name: string }[] | null
}

interface NormalizedHistoryApptRow extends Omit<HistoryApptBase, 'services' | 'status'> {
  status: AppointmentStatus
  services: { name: string } | null
}

function normalizeHistoryAppt(row: HistoryApptRow): NormalizedHistoryApptRow {
  return {
    ...row,
    services: Array.isArray(row.services) ? row.services[0] ?? null : row.services,
  }
}

export const metadata = {
  title: 'Minhas Reservas — Leste Barbearia',
}

interface Props {
  searchParams: Promise<{ notice?: string; appt_id?: string }>
}

export default async function ReservasPage({ searchParams }: Props) {
  const { notice, appt_id } = await searchParams
  const supabase = await createClient()
  const cookieStore = await cookies()

  const { data: { user } } = await supabase.auth.getUser()
  const signedInWithGoogle = isAuthenticatedUser(user)
  const guestPhone = normalizePhoneLookup(cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value)

  let lookupPhones = guestPhone ? [guestPhone] : []

  if (signedInWithGoogle) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    const profilePhone = normalizePhoneLookup(profile?.phone)
    lookupPhones = [...new Set([guestPhone, profilePhone].filter((phone): phone is string => Boolean(phone)))]
  }

  const ownershipFilter = [
    ...(user ? [`client_id.eq.${user.id}`] : []),
    ...lookupPhones.map((phone) => `client_phone.eq.${phone}`),
  ].join(',')

  if (!ownershipFilter) redirect('/?next=/reservas')

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Usa adminClient para buscar reservas de produtos (evita complexidade de RLS com visitantes)
  const adminClient = createAdminClient()

  const productOwnershipOrClauses = [
    ...(user ? [`client_id.eq.${user.id}`] : []),
    ...lookupPhones.map((phone) => `client_phone.eq.${phone}`),
  ].join(',')

  const [{ data: appointments }, { data: cancelledByAdmin }, { data: configRaw }, { data: productReservationsRaw }, { data: historyApptsRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, services(name, price, duration_minutes)')
      .in('status', ['confirmado', 'aguardando_pagamento'])
      .is('deleted_at', null)
      .gte('date', today)
      .or(ownershipFilter)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('appointments')
      .select('id, date, start_time, service_name_snapshot')
      .eq('status', 'cancelado')
      .eq('cancelled_by_admin', true)
      .is('deleted_at', null)
      .gte('date', sevenDaysAgo)
      .or(ownershipFilter)
      .order('date', { ascending: false }),
    supabase.from('business_config').select('cancellation_window_minutes, whatsapp_number').single(),
    productOwnershipOrClauses
      ? adminClient
          .from('product_reservations')
          .select('*, products(name, cover_image_url, price)')
          .or(productOwnershipOrClauses)
          .neq('status', 'cancelado')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from('appointments')
      .select('id, date, start_time, status, service_name_snapshot, services(name)')
      .or(ownershipFilter)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false }),
  ])

  const config = configRaw as Pick<BusinessConfig, 'cancellation_window_minutes' | 'whatsapp_number'> | null
  const activeAppointments = dedupeById(appointments ?? [])
  const historyRows = dedupeById(
    ((historyApptsRaw ?? []) as HistoryApptRow[]).map(normalizeHistoryAppt)
  )
  const paymentSummaryById = await getAppointmentPaymentSummaryMap([
    ...activeAppointments.map((appointment) => appointment.id),
    ...historyRows.map((appointment) => appointment.id),
  ])
  const hydratedAppointments = activeAppointments
    .filter((appointment) => !isAppointmentPast(appointment.date, appointment.start_time))
    .map((appointment) => ({
    ...appointment,
    payment_context: appointment.status === 'confirmado'
      ? paymentSummaryById[appointment.id]?.paymentContext ?? 'pay_locally'
      : null,
  }))

  // Busca expires_at de payment_intents para agendamentos aguardando pagamento
  const pendingIds = hydratedAppointments
    .filter((a) => a.status === 'aguardando_pagamento')
    .map((a) => a.id)
  const pendingExpiresAtMap: Record<string, string> = {}
  if (pendingIds.length > 0) {
    const { data: pis } = await adminClient
      .from('payment_intents')
      .select('appointment_id, expires_at')
      .in('appointment_id', pendingIds)
      .eq('status', 'pending')
    for (const pi of pis ?? []) {
      if (pi.appointment_id && pi.expires_at) {
        pendingExpiresAtMap[pi.appointment_id] = pi.expires_at
      }
    }
  }

  const hydratedWithExpiry = hydratedAppointments.map((a) => ({
    ...a,
    expiresAt: pendingExpiresAtMap[a.id] ?? null,
  }))
  const historyAppts = historyRows.map((appointment) => ({
    ...appointment,
    status: getAppointmentOperationalStatus(appointment.status, appointment.date, appointment.start_time),
    payment_context: paymentSummaryById[appointment.id]?.paymentContext ?? null,
  }))

  return (
    <ReservasClient
      appointments={hydratedWithExpiry as Array<{
        id: string
        date: string
        start_time: string
        status: AppointmentStatus
        services: { name: string; price: number; duration_minutes: number | null } | null
        payment_context: AppointmentPaymentContext | null
        expiresAt: string | null
      }>}
      cancelledByAdmin={cancelledByAdmin ?? []}
      cancellationWindowMinutes={config?.cancellation_window_minutes ?? 60}
      whatsappNumber={config?.whatsapp_number ?? null}
      productReservations={(productReservationsRaw ?? []) as ProductReservation[]}
      historyAppts={historyAppts}
      notice={notice ?? null}
      highlightedAppointmentId={appt_id ?? null}
    />
  )
}
