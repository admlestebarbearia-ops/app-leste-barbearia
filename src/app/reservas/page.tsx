import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReservasClient } from './ReservasClient'
import { dedupeById, GUEST_BOOKING_PHONE_COOKIE, isAuthenticatedUser, normalizePhoneLookup } from '@/lib/auth/session-state'
import type { AppointmentStatus, BusinessConfig, ProductReservation } from '@/lib/supabase/types'

interface HistoryAppt {
  id: string
  date: string
  start_time: string
  status: AppointmentStatus
  service_name_snapshot: string | null
  services: { name: string } | null
}

interface HistoryApptRow extends Omit<HistoryAppt, 'services'> {
  services: { name: string } | { name: string }[] | null
}

function normalizeHistoryAppt(row: HistoryApptRow): HistoryAppt {
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
  // Inclui TODOS os agendamentos no calendário — passados e futuros.
  // isReservationHistoryEntry não é mais usado aqui para não excluir futuros confirmados.
  const historyAppts = dedupeById(
    ((historyApptsRaw ?? []) as HistoryApptRow[]).map(normalizeHistoryAppt)
  )

  return (
    <ReservasClient
      appointments={dedupeById(appointments ?? [])}
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
