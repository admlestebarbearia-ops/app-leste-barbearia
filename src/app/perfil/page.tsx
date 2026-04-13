import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import { PerfilClient } from './PerfilClient'
import { getMyAppointments } from '@/app/agendar/actions'
import { getAppointmentPaymentSummaryMap } from '@/lib/booking/appointment-payment-context'
import type { AppointmentPaymentContext } from '@/lib/booking/appointment-payment-context'
import { isAppointmentPast } from '@/lib/booking/appointment-visibility'

export const metadata = {
  title: 'Meu Perfil — Leste Barbearia',
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAuthenticatedUser(user)) {
    redirect('/?next=/perfil')
  }

  const [
    { data: profile },
    { appointments },
    { data: config },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, email, phone')
      .eq('id', user.id)
      .single(),
    getMyAppointments(),
    supabase
      .from('business_config')
      .select('logo_url, cancellation_window_minutes')
      .single(),
  ])

  const paymentSummaryById = await getAppointmentPaymentSummaryMap(
    (appointments ?? []).map((appointment) => appointment.id)
  )

  const appointmentsWithPaymentContext = (appointments ?? [])
    .filter((appointment) => !isAppointmentPast(appointment.date, appointment.start_time))
    .map((appointment) => ({
      ...appointment,
      payment_context: appointment.status === 'confirmado'
        ? paymentSummaryById[appointment.id]?.paymentContext ?? 'pay_locally'
        : null,
    }))

  return (
    <PerfilClient
      userId={user.id}
      email={user.email ?? null}
      avatarUrl={(user.user_metadata?.avatar_url as string | null) ?? null}
      displayName={profile?.display_name ?? (user.user_metadata?.full_name as string | null) ?? null}
      phone={profile?.phone ?? null}
      appointments={appointmentsWithPaymentContext as {
        id: string
        date: string
        start_time: string
        status: string
        services: { name: string; price: number } | null
        payment_context: AppointmentPaymentContext | null
      }[]}
      cancellationWindowMinutes={config?.cancellation_window_minutes ?? 120}
      logoUrl={config?.logo_url ?? null}
    />
  )
}
