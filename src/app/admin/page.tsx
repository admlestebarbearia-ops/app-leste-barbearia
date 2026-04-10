import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { OnboardingWizard } from '@/components/admin/OnboardingWizard'
import type { BusinessConfig, WorkingHours, Service, SpecialSchedule, Appointment, Product, ProductReservation } from '@/lib/supabase/types'

// Força renderização dinâmica para garantir dados sempre frescos (sem cache)
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string; reason?: string }>
}) {
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

  // Lê parâmetros de status do OAuth do MP (se veio de callback)
  const { mp: mpStatus, reason: mpReason } = await searchParams

  // Dados do negócio — usa adminClient para garantir dados frescos sem cache de sessão
  const adminClient = createAdminClient()
  const [
    { data: config },
    { data: workingHours },
    { data: services },
    { data: specialSchedules },
    { data: products },
  ] = await Promise.all([
    adminClient.from('business_config').select('*').single(),
    adminClient.from('working_hours').select('*').order('day_of_week'),
    adminClient.from('services').select('*').order('name'),
    adminClient
      .from('special_schedules')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date'),
    adminClient.from('products').select('*').order('sort_order').order('created_at'),
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

  // Busca reservas de produtos vinculadas aos agendamentos do período
  let productReservations: ProductReservation[] = []
  const apptIds = (allAppointments ?? []).map((a) => a.id).filter(Boolean)
  if (apptIds.length > 0) {
    const { data: prData } = await adminClient
      .from('product_reservations')
      .select('*')
      .in('appointment_id', apptIds)
      .in('status', ['reservado', 'retirado'])
    productReservations = (prData ?? []) as ProductReservation[]
  }

  // Busca reservas standalone da loja (sem agendamento) — inclui canceladas para o admin excluir
  const { data: standaloneData } = await adminClient
    .from('product_reservations')
    .select('*')
    .is('appointment_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  let standaloneReservations: ProductReservation[] = (standaloneData ?? []) as ProductReservation[]

  // Enriquece com perfis (para mostrar nome/email no painel)
  if (standaloneReservations.length > 0) {
    const clientIds = [
      ...new Set(standaloneReservations.map((r) => r.client_id).filter(Boolean)),
    ] as string[]
    if (clientIds.length > 0) {
      const { data: profilesData } = await adminClient
        .from('profiles')
        .select('id, display_name, email, phone')
        .in('id', clientIds)
      if (profilesData) {
        const profilesMap = Object.fromEntries(profilesData.map((p) => [p.id, p]))
        standaloneReservations = standaloneReservations.map((r) => ({
          ...r,
          profiles: r.client_id ? (profilesMap[r.client_id] ?? null) : null,
        })) as ProductReservation[]
      }
    }
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
        initialProductReservations={productReservations}
        initialStandaloneReservations={standaloneReservations}
        appointmentsError={apptError?.message ?? null}
        mpStatus={mpStatus}
        mpReason={mpReason}
      />
    </main>
  )
}
