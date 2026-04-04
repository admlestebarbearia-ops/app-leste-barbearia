import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BookingForm } from '@/components/booking/BookingForm'
import type { BusinessConfig, Barber, Service, WorkingHours, SpecialSchedule } from '@/lib/supabase/types'

export default async function AgendarPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: config } = await supabase
    .from('business_config')
    .select('*')
    .single()

  const typedConfig = config as BusinessConfig | null

  // Se modo Google é obrigatório e usuário não está logado
  if (typedConfig?.require_google_login && !user) {
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

  let isAdmin = false
  let userPhone: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, phone')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.is_admin ?? false
    userPhone = profile?.phone ?? null
  }

  return (
    <main className="min-h-screen bg-background pb-32">
      <BookingForm
        services={(services as Service[] | null) ?? []}
        barber={barber}
        workingHours={(workingHours as WorkingHours[] | null) ?? []}
        specialSchedules={(specialSchedules as SpecialSchedule[] | null) ?? []}
        config={typedConfig}
        userEmail={user?.email ?? null}
        userId={user?.id ?? null}
        userPhone={userPhone}
        isAdmin={isAdmin}
      />
    </main>
  )
}
