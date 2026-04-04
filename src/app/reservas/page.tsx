import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReservasClient } from './ReservasClient'
import type { BusinessConfig } from '@/lib/supabase/types'

export const metadata = {
  title: 'Minhas Reservas — Leste Barbearia',
}

export default async function ReservasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const today = new Date().toISOString().split('T')[0]

  const [{ data: appointments }, { data: configRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, services(name, price, duration_minutes)')
      .eq('client_id', user.id)
      .eq('status', 'confirmado')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase.from('business_config').select('cancellation_window_minutes').single(),
  ])

  const config = configRaw as Pick<BusinessConfig, 'cancellation_window_minutes'> | null

  return (
    <ReservasClient
      appointments={appointments ?? []}
      cancellationWindowMinutes={config?.cancellation_window_minutes ?? 60}
    />
  )
}
