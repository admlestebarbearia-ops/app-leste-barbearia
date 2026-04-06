import { createAdminClient } from '@/lib/supabase/admin'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingBag, ChevronLeft, Package } from 'lucide-react'
import type { Product } from '@/lib/supabase/types'

export const metadata = {
  title: 'Loja — Leste Barbearia',
}

export default async function LojaPage() {
  const admin = createAdminClient()

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
  const available = storeOpen
    ? ((products ?? []) as Product[]).filter(
        (p) => p.stock_quantity === -1 || p.stock_quantity > 0
      )
    : []

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

        {/* Loja aberta mas vazia */}
        {storeOpen && available.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <p className="text-sm text-zinc-500">Nenhum produto disponível no momento.</p>
            <Link
              href="/agendar"
              className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white transition-colors"
            >
              Ver agendamentos →
            </Link>
          </div>
        )}

        {/* Grid de produtos */}
        {storeOpen && available.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-600">Produtos em destaque</h2>
              <p className="text-[11px] text-zinc-700">Reserve ao confirmar seu agendamento.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {available.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col rounded-2xl border border-white/6 bg-zinc-900 overflow-hidden"
                >
                  {/* Imagem */}
                  <div className="w-full aspect-square bg-white/5 overflow-hidden">
                    {product.cover_image_url ? (
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={32} className="text-zinc-700" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-3 py-3 flex flex-col gap-1.5">
                    <p className="text-xs font-bold text-white/90 leading-tight line-clamp-2">
                      {product.name}
                    </p>
                    {product.short_description && (
                      <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
                        {product.short_description}
                      </p>
                    )}
                    <p className="text-sm font-black text-white mt-0.5">
                      R$ {product.price.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA agendar */}
            <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-5 flex flex-col gap-3 text-center mt-2">
              <p className="text-xs font-bold text-white/70">Reserve produtos ao agendar seu horário</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Após confirmar seu serviço, os produtos estarão disponíveis para reserva. Retire na consulta!
              </p>
              <Link
                href="/agendar"
                className="inline-flex items-center justify-center h-11 rounded-xl bg-white text-black text-xs font-extrabold uppercase tracking-widest hover:bg-white/90 transition-colors"
              >
                Agendar agora
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
