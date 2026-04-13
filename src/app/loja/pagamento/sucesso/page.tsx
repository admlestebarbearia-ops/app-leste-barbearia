import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  searchParams: Promise<{ reservation_id?: string }>
}

export default async function LojaPagamentoSucessoPage({ searchParams }: Props) {
  const { reservation_id } = await searchParams
  if (!reservation_id) redirect('/loja')

  const admin = createAdminClient()
  const { data: reservation } = await admin
    .from('product_reservations')
    .select('product_name_snapshot, quantity, status')
    .eq('id', reservation_id)
    .single()

  if (!reservation) redirect('/loja')

  const isPending = reservation.status === 'aguardando_pagamento'

  return (
    <main className="min-h-screen bg-[#09090b] text-white px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-2xl">
          {isPending ? '⏳' : '✓'}
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-black text-white">
            {isPending ? 'Pagamento em processamento' : 'Pedido confirmado'}
          </h1>
          <p className="text-sm text-zinc-400">
            {isPending
              ? 'Estamos aguardando a confirmação final do Mercado Pago. Seu pedido aparecerá como reservado assim que o pagamento aprovar.'
              : 'Seu produto já está separado para retirada na barbearia.'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 px-5 py-4 text-left">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Produto</p>
          <p className="mt-1 text-lg font-bold text-white">{reservation.product_name_snapshot}</p>
          <p className="mt-2 text-sm text-zinc-400">Quantidade: {reservation.quantity}</p>
        </div>
        <Link
          href="/loja"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-white text-black text-sm font-extrabold uppercase tracking-widest"
        >
          Voltar para a loja
        </Link>
      </div>
    </main>
  )
}
