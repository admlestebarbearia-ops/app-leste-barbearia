import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BookingForm } from '@/components/booking/BookingForm'
import { GUEST_BOOKING_PHONE_COOKIE, isAuthenticatedUser, normalizePhoneLookup } from '@/lib/auth/session-state'
import type { BusinessConfig, Barber, Service, WorkingHours, SpecialSchedule } from '@/lib/supabase/types'

export default async function AgendarPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const resolvedParams = await (searchParams ?? Promise.resolve({}))

  const { data: { user } } = await supabase.auth.getUser()
  const signedInWithGoogle = isAuthenticatedUser(user)
  const guestBookingPhone = normalizePhoneLookup(cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value)

  const { data: config } = await supabase
    .from('business_config')
    .select('*')
    .single()

  const typedConfig = config as BusinessConfig | null

  // Se modo Google é obrigatório e usuário não está logado
  if (typedConfig?.require_google_login && !signedInWithGoogle) {
    redirect('/')
  }

  const [
    { data: services },
    { data: barbers },
    { data: workingHours },
    { data: specialSchedules },
  ] = await Promise.all([
    supabase.from('services').select('*').eq('is_active', true).order('name'),
    supabase.from('barbers').select('*').eq('is_active', true).limit(1),
    supabase.from('working_hours').select('*').order('day_of_week'),
    supabase
      .from('special_schedules')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0]),
  ])

  const barber = (barbers as Barber[] | null)?.[0] ?? null
  const publicServices = ((services as Service[] | null) ?? []).filter(
    (service) => Number.isFinite(service.duration_minutes) && service.duration_minutes > 0
  )

  let isAdmin = false
  let userPhone: string | null = null
  if (signedInWithGoogle) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, phone')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.is_admin ?? false
    userPhone = normalizePhoneLookup(profile?.phone)
  }

  const canViewAppointments = signedInWithGoogle || !!guestBookingPhone || !!user
  const setupPhone = resolvedParams['setup_phone'] === '1' && signedInWithGoogle && !userPhone

  return (
    <main className="min-h-screen bg-background pb-32">
      <BookingForm
        services={publicServices}
        barber={barber}
        workingHours={(workingHours as WorkingHours[] | null) ?? []}
        specialSchedules={(specialSchedules as SpecialSchedule[] | null) ?? []}
        config={typedConfig}
        userEmail={signedInWithGoogle ? user.email ?? null : null}
        userId={signedInWithGoogle ? user.id : null}
        userPhone={signedInWithGoogle ? userPhone : guestBookingPhone}
        isAdmin={isAdmin}
        isAuthenticatedUser={signedInWithGoogle}
        canViewAppointments={canViewAppointments}
        setupPhone={setupPhone}
      />
    </main>
  )
}
