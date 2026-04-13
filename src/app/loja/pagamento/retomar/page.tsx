import { redirect } from 'next/navigation'
import { getPendingProductPaymentDetails } from '@/app/loja/actions'
import { ResumePaymentCheckout } from '@/components/payment/ResumePaymentCheckout'

interface Props {
  searchParams: Promise<{ reservation_id?: string }>
}

export default async function RetomarPagamentoProdutoPage({ searchParams }: Props) {
  const { reservation_id } = await searchParams

  if (!reservation_id) redirect('/loja')

  const { reservation } = await getPendingProductPaymentDetails(reservation_id)

  if (!reservation) redirect('/loja')

  return (
    <ResumePaymentCheckout
      checkoutKind="product_reservation"
      checkout={{
        id: reservation.id,
        amount: reservation.amount,
        title: reservation.productName,
        subtitle: reservation.quantity > 1 ? `${reservation.quantity} unidades` : '1 unidade',
        existingPaymentId: reservation.existingPaymentId,
      }}
      publicKey={process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''}
      backHref="/loja"
      successHref={`/loja/pagamento/sucesso?reservation_id=${reservation.id}`}
      failureHref={`/loja/pagamento/falha?reservation_id=${reservation.id}`}
    />
  )
}