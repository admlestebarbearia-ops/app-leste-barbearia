import Link from 'next/link'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ reservation_id?: string }>
}

export default async function LojaPagamentoFalhaPage({ searchParams }: Props) {
  const { reservation_id } = await searchParams
  if (!reservation_id) redirect('/loja')

  return (
    <main className="min-h-screen bg-[#09090b] text-white px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-2xl">
          !
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-black text-white">Pagamento não concluído</h1>
          <p className="text-sm text-zinc-400">
            Seu pedido ficou pendente ou falhou. Você pode tentar novamente pela loja ou cancelar essa pendência.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href="/loja"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-white text-black text-sm font-extrabold uppercase tracking-widest"
          >
            Voltar para a loja
          </Link>
          <Link
            href="/reservas"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 text-sm font-bold text-zinc-300"
          >
            Ver minhas reservas
          </Link>
        </div>
      </div>
    </main>
  )
}
