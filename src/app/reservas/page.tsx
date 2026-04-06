import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReservasClient } from './ReservasClient'
import { dedupeById, GUEST_BOOKING_PHONE_COOKIE, isAuthenticatedUser, normalizePhoneLookup } from '@/lib/auth/session-state'
import type { BusinessConfig } from '@/lib/supabase/types'

export const metadata = {
  title: 'Minhas Reservas — Leste Barbearia',
}

export default async function ReservasPage() {
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

  const [{ data: appointments }, { data: configRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, services(name, price, duration_minutes)')
      .eq('status', 'confirmado')
      .gte('date', today)
      .or(ownershipFilter)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase.from('business_config').select('cancellation_window_minutes').single(),
  ])

  const config = configRaw as Pick<BusinessConfig, 'cancellation_window_minutes'> | null

  return (
    <ReservasClient
      appointments={dedupeById(appointments ?? [])}
      cancellationWindowMinutes={config?.cancellation_window_minutes ?? 60}
    />
  )
}
