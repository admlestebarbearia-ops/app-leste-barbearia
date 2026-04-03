import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { OnboardingWizard } from '@/components/admin/OnboardingWizard'
import type { BusinessConfig, WorkingHours, Service, SpecialSchedule, Appointment } from '@/lib/supabase/types'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Verifica se é admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  // Dados do negócio
  const [
    { data: config },
    { data: workingHours },
    { data: services },
    { data: specialSchedules },
  ] = await Promise.all([
    supabase.from('business_config').select('*').single(),
    supabase.from('working_hours').select('*').order('day_of_week'),
    supabase.from('services').select('*').order('name'),
    supabase
      .from('special_schedules')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date'),
  ])

  const typedConfig = config as BusinessConfig | null

  // Se onboarding não foi feito, mostra o wizard
  if (!typedConfig?.onboarding_complete) {
    return (
      <main className="min-h-screen bg-background">
        <OnboardingWizard
          initialConfig={typedConfig}
          workingHours={(workingHours as WorkingHours[]) ?? []}
        />
      </main>
    )
  }

  // Todos os agendamentos a partir de hoje
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: allAppointments } = await supabase
    .from('appointments')
    .select(`
      *,
      services(name, price, duration_minutes),
      profiles(is_blocked, display_name)
    `)
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  return (
    <main className="min-h-screen bg-background">
      <AdminDashboard
        config={typedConfig!}
        workingHours={(workingHours as WorkingHours[]) ?? []}
        services={(services as Service[]) ?? []}
        specialSchedules={(specialSchedules as SpecialSchedule[]) ?? []}
        appointments={(allAppointments as Appointment[]) ?? []}
      />
    </main>
  )
}
