import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ reservation_id?: string }>
}

export default async function LojaPagamentoPendentePage({ searchParams }: Props) {
  const { reservation_id } = await searchParams
  if (!reservation_id) redirect('/loja')
  redirect(`/loja/pagamento/sucesso?reservation_id=${reservation_id}`)
}
