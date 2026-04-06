import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { OnboardingWizard } from '@/components/admin/OnboardingWizard'
import type { BusinessConfig, WorkingHours, Service, SpecialSchedule, Appointment, Product } from '@/lib/supabase/types'

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
    { data: products },
  ] = await Promise.all([
    supabase.from('business_config').select('*').single(),
    supabase.from('working_hours').select('*').order('day_of_week'),
    supabase.from('services').select('*').order('name'),
    supabase
      .from('special_schedules')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date'),
    supabase.from('products').select('*').order('sort_order').order('created_at'),
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

  // Todos os agendamentos — usa cliente admin (service role) para bypassar RLS
  // e ver agendamentos de TODOS os clientes, não só do admin logado
  const adminClient = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  // Inclui os últimos 30 dias para não perder histórico recente
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: rawAppointments, error: apptError } = await adminClient
    .from('appointments')
    .select(`
      *,
      services(name, price, duration_minutes)
    `)
    .gte('date', thirtyDaysAgo)
    .is('deleted_at', null)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  // Busca profiles separadamente para evitar erro de FK inexistente no schema cache
  let allAppointments = rawAppointments as Appointment[] | null
  if (rawAppointments && rawAppointments.length > 0) {
    const clientIds = [...new Set(rawAppointments.map((a) => a.client_id).filter(Boolean))] as string[]
    if (clientIds.length > 0) {
      const { data: profilesData } = await adminClient
        .from('profiles')
        .select('id, is_blocked, display_name, email, phone')
        .in('id', clientIds)
      if (profilesData) {
        const profilesMap = Object.fromEntries(profilesData.map((p) => [p.id, p]))
        allAppointments = rawAppointments.map((a) => ({
          ...a,
          profiles: a.client_id ? profilesMap[a.client_id] ?? null : null,
        })) as Appointment[]
      }
    }
  }

  if (apptError) {
    console.error('[admin] Erro ao buscar agendamentos:', apptError.message)
  }

  return (
    <main className="min-h-screen bg-background">
      <AdminDashboard
        config={typedConfig!}
        workingHours={(workingHours as WorkingHours[]) ?? []}
        services={(services as Service[]) ?? []}
        specialSchedules={(specialSchedules as SpecialSchedule[]) ?? []}
        appointments={(allAppointments as Appointment[]) ?? []}
        products={(products as Product[]) ?? []}
        appointmentsError={apptError?.message ?? null}
      />
    </main>
  )
}
