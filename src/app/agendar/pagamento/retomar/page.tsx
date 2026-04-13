import { redirect } from 'next/navigation'
import { getPendingPaymentDetails } from '@/app/agendar/actions'
import { ResumePaymentCheckout } from '@/components/payment/ResumePaymentCheckout'

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
      appointment={appointment}
      publicKey={process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''}
    />
  )
}