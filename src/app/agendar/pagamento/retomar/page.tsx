import { redirect } from 'next/navigation'
import { getPendingPaymentDetails } from '@/app/agendar/actions'
import { ResumePaymentCheckout } from '@/components/payment/ResumePaymentCheckout'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ appt_id?: string }>
}

export default async function RetomarPagamentoPage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  if (!appt_id) redirect('/reservas')

  const { appointment } = await getPendingPaymentDetails(appt_id)

  if (!appointment) redirect('/reservas')

  const supabase = await createClient()
  const { data: config } = await supabase
    .from('business_config')
    .select('mp_public_key')
    .single()

  const mpPublicKey = config?.mp_public_key ?? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

  return (
    <ResumePaymentCheckout
      checkoutKind="appointment"
      checkout={{
        id: appointment.id,
        amount: appointment.amount,
        title: appointment.serviceName,
        subtitle: `${format(parseISO(appointment.serviceDate), "dd 'de' MMMM", { locale: ptBR })} às ${appointment.serviceTime}`,
        preferenceId: appointment.preferenceId,
        existingPaymentId: appointment.existingPaymentId,
      }}
      publicKey={mpPublicKey}
      backHref={`/reservas?notice=pending-payment&appt_id=${appointment.id}`}
      successHref={`/agendar/pagamento/sucesso?appt_id=${appointment.id}`}
      failureHref={`/agendar/pagamento/falha?appt_id=${appointment.id}`}
    />
  )
}