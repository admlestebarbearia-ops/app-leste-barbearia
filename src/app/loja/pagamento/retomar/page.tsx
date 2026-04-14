import { redirect } from 'next/navigation'
import { getPendingProductPaymentDetails } from '@/app/loja/actions'
import { ResumePaymentCheckout } from '@/components/payment/ResumePaymentCheckout'
import { createClient } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ reservation_id?: string }>
}

export default async function RetomarPagamentoProdutoPage({ searchParams }: Props) {
  const { reservation_id } = await searchParams

  if (!reservation_id) redirect('/loja')

  const { reservation } = await getPendingProductPaymentDetails(reservation_id)

  if (!reservation) redirect('/loja')

  const supabase = await createClient()
  const { data: config } = await supabase
    .from('business_config')
    .select('mp_public_key')
    .single()

  const mpPublicKey = config?.mp_public_key ?? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

  return (
    <ResumePaymentCheckout
      checkoutKind="product_reservation"
      checkout={{
        id: reservation.id,
        amount: reservation.amount,
        title: reservation.productName,
        subtitle: reservation.quantity > 1 ? `${reservation.quantity} unidades` : '1 unidade',
        preferenceId: reservation.preferenceId,
        existingPaymentId: reservation.existingPaymentId,
      }}
      publicKey={mpPublicKey}
      backHref="/loja"
      successHref={`/loja/pagamento/sucesso?reservation_id=${reservation.id}`}
      failureHref={`/loja/pagamento/falha?reservation_id=${reservation.id}`}
    />
  )
}