'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, X, CheckCircle2, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { reservarProduto, cancelarReservaProduto } from './actions'
import type { Product, ProductReservation } from '@/lib/supabase/types'

interface Props {
  products: Product[]
  myReservations: ProductReservation[]
  isLoggedIn: boolean
}

export function LojaClient({ products, myReservations: initialReservations, isLoggedIn }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [localReservations, setLocalReservations] = useState<ProductReservation[]>(initialReservations)

  // Mapa produto_id → reserva ativa standalone
  const activeByProduct = Object.fromEntries(
    localReservations
      .filter((r) => r.status === 'reservado' && r.appointment_id === null)
      .map((r) => [r.product_id, r])
  )

  const handleReservar = async (product: Product) => {
    if (!isLoggedIn) {
      toast.error('Faça login para reservar.')
      router.push('/?next=/loja')
      return
    }
    setLoadingId(product.id)
    const result = await reservarProduto(product.id, 1)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`🛍 ${product.name} reservado! Retire na barbearia.`)
      // Optimistic local update (ID temporário; router.refresh vai sincronizar)
      setLocalReservations((prev) => [
        ...prev,
        {
          id: `opt-${Date.now()}`,
          product_id: product.id,
          appointment_id: null,
          client_id: null,
          client_phone: null,
          quantity: 1,
          status: 'reservado',
          product_name_snapshot: product.name,
          product_price_snapshot: product.price,
          product_image_snapshot: product.cover_image_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      router.refresh()
    }
    setLoadingId(null)
  }

  const handleCancelar = async (reservation: ProductReservation) => {
    setLoadingId(reservation.id)
    const result = await cancelarReservaProduto(reservation.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Reserva cancelada.')
      setLocalReservations((prev) => prev.filter((r) => r.id !== reservation.id))
      router.refresh()
    }
    setLoadingId(null)
  }

  const myActive = localReservations.filter(
    (r) => r.status === 'reservado' && r.appointment_id === null
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Minhas reservas ativas */}
      {myActive.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Minhas reservas ativas
          </h2>
          {myActive.map((r) => (
            <div
              key={r.id}
              className="bg-zinc-900 border border-white/6 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0">
                {r.product_image_snapshot ? (
                  <img
                    src={r.product_image_snapshot}
                    alt={r.product_name_snapshot}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={14} className="text-zinc-700" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {r.product_name_snapshot}
                </p>
                <p className="text-[10px] text-zinc-500">
                  R$ {r.product_price_snapshot.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Reservado
                </span>
                <button
                  disabled={loadingId === r.id}
                  onClick={() => handleCancelar(r)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40"
                  title="Cancelar reserva"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid de produtos */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Package size={32} className="text-zinc-700" />
          <p className="text-sm text-zinc-500">Nenhum produto disponível no momento.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Produtos disponíveis
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => {
              const myReservation = activeByProduct[product.id]
              const isReserved = !!myReservation
              const inStock = product.stock_quantity === -1 || product.stock_quantity > 0
              const isLoading =
                loadingId === product.id || loadingId === (myReservation?.id ?? '')

              return (
                <div
                  key={product.id}
                  className="flex flex-col rounded-2xl border border-white/6 bg-zinc-900 overflow-hidden"
                >
                  {/* Imagem */}
                  <div className="w-full aspect-square bg-white/5 overflow-hidden relative">
                    {product.cover_image_url ? (
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={28} className="text-zinc-700" />
                      </div>
                    )}
                    {isReserved && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <CheckCircle2 size={36} className="text-emerald-400 drop-shadow-lg" />
                      </div>
                    )}
                    {!inStock && !isReserved && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          Esgotado
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-3 py-3 flex flex-col gap-2">
                    <p className="text-xs font-bold text-white/90 leading-tight line-clamp-2">
                      {product.name}
                    </p>
                    {product.short_description && (
                      <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
                        {product.short_description}
                      </p>
                    )}
                    <p className="text-sm font-black text-white">
                      R$ {product.price.toFixed(2).replace('.', ',')}
                    </p>

                    {/* Botão principal */}
                    {isReserved ? (
                      <button
                        disabled={isLoading}
                        onClick={() => handleCancelar(myReservation)}
                        className="w-full h-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-colors disabled:opacity-40"
                      >
                        {isLoading ? '...' : 'Cancelar'}
                      </button>
                    ) : (
                      <button
                        disabled={!inStock || !!loadingId}
                        onClick={() => handleReservar(product)}
                        className="w-full h-8 rounded-xl bg-white text-black text-[10px] font-extrabold uppercase tracking-widest hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isLoading
                          ? '...'
                          : !isLoggedIn
                          ? 'Entrar para reservar'
                          : !inStock
                          ? 'Esgotado'
                          : 'Reservar'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CTA login */}
      {!isLoggedIn && products.length > 0 && (
        <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-5 flex flex-col gap-3 text-center">
          <ShoppingBag size={20} className="text-zinc-600 mx-auto" />
          <p className="text-xs font-bold text-white/70">Faça login para reservar produtos</p>
          <Link
            href="/?next=/loja"
            className="inline-flex items-center justify-center h-11 rounded-xl bg-white text-black text-xs font-extrabold uppercase tracking-widest hover:bg-white/90 transition-colors"
          >
            Entrar com Google
          </Link>
        </div>
      )}
    </div>
  )
}
