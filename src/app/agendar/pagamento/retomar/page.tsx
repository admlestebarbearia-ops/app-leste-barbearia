import { redirect } from 'next/navigation'
import { getPendingPaymentDetails } from '@/app/agendar/actions'
import { ResumePaymentCheckout } from '@/components/payment/ResumePaymentCheckout'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  searchParams: Promise<{ appt_id?: string }>
}

export default async function RetomarPagamentoPage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  if (!appt_id) redirect('/reservas')

  const { appointment } = await getPendingPaymentDetails(appt_id)

  if (!appointment) redirect('/reservas')

  return (
    <ResumePaymentCheckout
      checkoutKind="appointment"
      checkout={{
        id: appointment.id,
        amount: appointment.amount,
        title: appointment.serviceName,
        subtitle: `${format(parseISO(appointment.serviceDate), "dd 'de' MMMM", { locale: ptBR })} às ${appointment.serviceTime}`,
        existingPaymentId: appointment.existingPaymentId,
      }}
      publicKey={process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''}
      backHref={`/reservas?notice=pending-payment&appt_id=${appointment.id}`}
      successHref={`/agendar/pagamento/sucesso?appt_id=${appointment.id}`}
      failureHref={`/agendar/pagamento/falha?appt_id=${appointment.id}`}
    />
  )
}