import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingBag, ChevronLeft, Package } from 'lucide-react'
import type { Product, ProductReservation } from '@/lib/supabase/types'
import { LojaClient } from './LojaClient'

export const metadata = {
  title: 'Loja — Leste Barbearia',
}

export default async function LojaPage() {
  const admin = createAdminClient()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: config }, { data: products }] = await Promise.all([
    admin.from('business_config').select('enable_products, logo_url').single(),
    admin
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const storeOpen = config?.enable_products ?? false
  const allActive = storeOpen ? ((products ?? []) as Product[]) : []

  // Reservas ativas do cliente logado (apenas standalone, sem agendamento)
  let myReservations: ProductReservation[] = []
  if (user && storeOpen) {
    const { data: prData } = await admin
      .from('product_reservations')
      .select('*')
      .eq('client_id', user.id)
      .eq('status', 'reservado')
      .is('appointment_id', null)
    myReservations = (prData ?? []) as ProductReservation[]
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-lg mx-auto px-4 py-8 pb-24 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/agendar"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
            <ShoppingBag size={16} className="text-zinc-500" />
            Loja
          </h1>
          {config?.logo_url && (
            <Image
              src={config.logo_url}
              alt="Logo"
              width={28}
              height={28}
              className="ml-auto object-contain opacity-60"
              unoptimized
            />
          )}
        </div>

        {/* Loja fechada */}
        {!storeOpen && (
          <div className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/6 flex items-center justify-center">
              <Package size={28} className="text-zinc-600" />
            </div>
            <div className="text-center flex flex-col gap-2">
              <p className="text-sm font-bold text-white/60">Loja de produtos fechada</p>
              <p className="text-xs text-zinc-600">Em breve novidades. 🛍</p>
            </div>
            <Link
              href="/agendar"
              className="text-[10px] uppercase tracking-[0.15em] font-bold text-zinc-500 border border-white/10 px-4 py-2 rounded-full hover:text-white hover:border-white/20 transition-colors"
            >
              Voltar para agendamentos
            </Link>
          </div>
        )}

        {/* Loja aberta — grid interativo */}
        {storeOpen && (
          <LojaClient
            products={allActive}
            myReservations={myReservations}
            isLoggedIn={!!user}
          />
        )}
      </div>
    </main>
  )
}
