'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Package, X, Minus, Plus, CheckCircle2, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { reservarProduto, cancelarReservaProduto, atualizarQuantidadeReserva } from './actions'
import type { Product, ProductReservation } from '@/lib/supabase/types'

interface Props {
  products: Product[]
  myReservations: ProductReservation[]
  isLoggedIn: boolean
}

export function LojaClient({ products, myReservations: serverReservations, isLoggedIn }: Props) {
  const router = useRouter()

  // Sincroniza sempre que o servidor mandar dados novos (após router.refresh())
  const [reservations, setReservations] = useState<ProductReservation[]>(serverReservations)
  useEffect(() => { setReservations(serverReservations) }, [serverReservations])

  // Modal de produto
  const [modalProduct, setModalProduct] = useState<Product | null>(null)
  const [modalQty, setModalQty] = useState(1)
  const [loading, setLoading] = useState(false)

  // Mapa productId → reserva ativa standalone
  const activeByProduct = Object.fromEntries(
    reservations
      .filter((r) => r.status === 'reservado' && r.appointment_id === null)
      .map((r) => [r.product_id, r])
  )

  const openModal = (product: Product) => {
    if (!isLoggedIn) {
      toast.error('Faça login para reservar.')
      router.push('/?next=/loja')
      return
    }
    const existing = activeByProduct[product.id]
    setModalQty(existing?.quantity ?? 1)
    setModalProduct(product)
  }

  const closeModal = useCallback(() => {
    setModalProduct(null)
    setModalQty(1)
    setLoading(false)
  }, [])

  const getMaxQty = (product: Product) => {
    if (product.stock_quantity === -1) return 99
    const existing = activeByProduct[product.id]
    return product.stock_quantity + (existing?.quantity ?? 0)
  }

  const handleConfirmar = async () => {
    if (!modalProduct) return
    setLoading(true)
    const existing = activeByProduct[modalProduct.id]
    let result: { error?: string }
    if (existing) {
      result = await atualizarQuantidadeReserva(existing.id, modalQty)
      if (!result.error) toast.success(`Reserva atualizada para ${modalQty}x ${modalProduct.name}.`)
    } else {
      result = await reservarProduto(modalProduct.id, modalQty)
      if (!result.error) toast.success(`${modalQty}x ${modalProduct.name} reservado! Retire na barbearia.`)
    }
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    router.refresh()
    closeModal()
  }

  const handleCancelar = async (reservation: ProductReservation) => {
    setLoading(true)
    const result = await cancelarReservaProduto(reservation.id)
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    toast.success('Reserva cancelada.')
    router.refresh()
    closeModal()
  }

  const myActive = reservations.filter(
    (r) => r.status === 'reservado' && r.appointment_id === null
  )
  const modalExisting = modalProduct ? activeByProduct[modalProduct.id] : undefined

  return (
    <>
      <div className="flex flex-col gap-8">
        {/* Minhas reservas ativas */}
        {myActive.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
              Minhas reservas ativas
            </h2>
            {myActive.map((r) => {
              const prod = products.find((p) => p.id === r.product_id)
              return (
                <div
                  key={r.id}
                  className="bg-zinc-900 border border-white/6 rounded-2xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0">
                    {r.product_image_snapshot ? (
                      <img src={r.product_image_snapshot} alt={r.product_name_snapshot} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={14} className="text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{r.product_name_snapshot}</p>
                    <p className="text-[10px] text-zinc-500">
                      {r.quantity > 1 ? `${r.quantity}x · ` : ''}R$ {r.product_price_snapshot.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {prod && (
                      <button
                        onClick={() => prod && openModal(prod)}
                        className="text-[9px] font-black uppercase tracking-widest text-zinc-400 border border-white/10 px-2 py-1 rounded-full"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      disabled={loading}
                      onClick={() => handleCancelar(r)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40"
                      title="Cancelar reserva"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
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
                const inStock = product.stock_quantity === -1 || product.stock_quantity > 0 || isReserved

                return (
                  <button
                    key={product.id}
                    onClick={() => openModal(product)}
                    disabled={!inStock && !isReserved}
                    className="flex flex-col rounded-2xl border border-white/6 bg-zinc-900 overflow-hidden text-left disabled:opacity-60"
                  >
                    <div className="w-full aspect-square bg-white/5 overflow-hidden relative">
                      {product.cover_image_url ? (
                        <img src={product.cover_image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={28} className="text-zinc-700" />
                        </div>
                      )}
                      {isReserved && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                          <CheckCircle2 size={32} className="text-emerald-400 drop-shadow-lg" />
                          {myReservation.quantity > 1 && (
                            <span className="text-[10px] font-black text-emerald-400">{myReservation.quantity}x</span>
                          )}
                        </div>
                      )}
                      {!inStock && !isReserved && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Esgotado</span>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-3 flex flex-col gap-1.5">
                      <p className="text-xs font-bold text-white/90 leading-tight line-clamp-2">{product.name}</p>
                      {product.short_description && (
                        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{product.short_description}</p>
                      )}
                      <p className="text-sm font-black text-white">R$ {product.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </button>
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

      {/* Modal de produto (bottom sheet) */}
      {modalProduct && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-zinc-950 border-t border-white/10 rounded-t-3xl max-h-[90dvh] overflow-y-auto flex flex-col">
            {/* Imagem */}
            {modalProduct.cover_image_url && (
              <div className="w-full aspect-video overflow-hidden shrink-0">
                <img src={modalProduct.cover_image_url} alt={modalProduct.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="px-5 pt-5 pb-8 flex flex-col gap-4">
              {/* Cabeçalho */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h2 className="text-lg font-black text-white leading-tight">{modalProduct.name}</h2>
                  {modalProduct.size_info && (
                    <p className="text-xs text-zinc-500 mt-0.5">{modalProduct.size_info}</p>
                  )}
                </div>
                <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 shrink-0">
                  <X size={15} />
                </button>
              </div>

              {/* Preço */}
              <p className="text-2xl font-black text-white">R$ {modalProduct.price.toFixed(2).replace('.', ',')}</p>

              {/* Descrições */}
              {modalProduct.short_description && (
                <p className="text-sm text-zinc-400 leading-relaxed">{modalProduct.short_description}</p>
              )}
              {modalProduct.full_description && (
                <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-line">{modalProduct.full_description}</p>
              )}

              {/* Seletor de quantidade */}
              {(modalProduct.stock_quantity !== 0 || modalExisting) && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">Quantidade</span>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                      disabled={modalQty <= 1}
                      className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white disabled:opacity-30"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-xl font-black text-white w-8 text-center">{modalQty}</span>
                    <button
                      onClick={() => setModalQty((q) => Math.min(getMaxQty(modalProduct), q + 1))}
                      disabled={modalQty >= getMaxQty(modalProduct)}
                      className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white disabled:opacity-30"
                    >
                      <Plus size={16} />
                    </button>
                    {modalProduct.stock_quantity !== -1 && (
                      <span className="text-[10px] text-zinc-600">
                        {modalProduct.stock_quantity} em estoque
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex flex-col gap-2 pt-1">
                {modalProduct.stock_quantity === 0 && !modalExisting ? (
                  <p className="text-center text-sm text-zinc-500 py-2">Produto esgotado</p>
                ) : (
                  <button
                    onClick={handleConfirmar}
                    disabled={loading}
                    className="h-12 rounded-2xl bg-white text-black text-sm font-extrabold uppercase tracking-widest disabled:opacity-50"
                  >
                    {loading ? 'Aguarde...' : modalExisting
                      ? `Atualizar para ${modalQty}x`
                      : `Reservar ${modalQty}x`}
                  </button>
                )}
                {modalExisting && (
                  <button
                    onClick={() => handleCancelar(modalExisting)}
                    disabled={loading}
                    className="h-11 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    {loading ? '...' : 'Cancelar reserva'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
