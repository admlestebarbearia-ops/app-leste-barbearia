'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createProductReservation } from '@/app/agendar/actions'
import type { Product } from '@/lib/supabase/types'

interface Props {
  products: Product[]
  appointmentId: string
  guestPhone?: string | null
}

export function ProductVitrine({ products, appointmentId, guestPhone }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [reserving, setReserving] = useState(false)
  const [reservedIds, setReservedIds] = useState<Set<string>>(new Set())

  if (products.length === 0) return null

  const handleReserve = async (product: Product) => {
    setReserving(true)
    const result = await createProductReservation({
      productId: product.id,
      appointmentId,
      clientPhone: guestPhone ?? undefined,
    })
    setReserving(false)
    if (result.success) {
      setReservedIds((prev) => new Set([...prev, product.id]))
      setSelectedProduct(null)
      toast.success(`${product.name} reservado com sucesso!`)
    } else {
      toast.error(result.error ?? 'Erro ao reservar produto.')
    }
  }

  return (
    <>
      {/* Vitrine */}
      <div className="w-full flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-foreground">
            Produtos em destaque
          </h2>
          <p className="text-xs text-muted-foreground">
            Reserve agora e retire na sua consulta.
          </p>
        </div>

        {/* Carrossel horizontal com snap */}
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none">
          {products.map((product) => {
            const isReserved = reservedIds.has(product.id)
            return (
              <button
                key={product.id}
                onClick={() => !isReserved && setSelectedProduct(product)}
                disabled={isReserved}
                className={[
                  'snap-start shrink-0 w-40 flex flex-col rounded-2xl border overflow-hidden text-left transition-all duration-200',
                  isReserved
                    ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70'
                    : 'border-border bg-card hover:border-primary/40 active:scale-95',
                ].join(' ')}
              >
                {/* Imagem do produto */}
                <div className="w-full h-32 bg-white/5 overflow-hidden">
                  {product.cover_image_url ? (
                    <img
                      src={product.cover_image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl text-muted-foreground/30">P</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-1 px-3 py-2.5">
                  <span className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
                    {product.name}
                  </span>
                  {product.short_description && (
                    <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                      {product.short_description}
                    </span>
                  )}
                  <span className="text-sm font-extrabold text-primary mt-0.5">
                    R$ {product.price.toFixed(2).replace('.', ',')}
                  </span>
                  {isReserved ? (
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      Reservado
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Toque para reservar
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom sheet de confirmacao */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setSelectedProduct(null)}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative z-10 w-full max-w-lg mx-auto bg-neutral-900 border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />

            {/* Produto info */}
            <div className="flex items-start gap-4">
              {selectedProduct.cover_image_url && (
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                  <img
                    src={selectedProduct.cover_image_url}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-base font-extrabold text-white">{selectedProduct.name}</span>
                {selectedProduct.short_description && (
                  <span className="text-xs text-zinc-400 leading-snug">
                    {selectedProduct.short_description}
                  </span>
                )}
                <span className="text-xl font-black text-primary mt-1">
                  R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* Estoque info */}
            {selectedProduct.stock_quantity !== -1 && (
              <p className="text-xs text-muted-foreground">
                {selectedProduct.stock_quantity} unidade{selectedProduct.stock_quantity !== 1 ? 's' : ''} disponivel{selectedProduct.stock_quantity !== 1 ? 'is' : ''}.
              </p>
            )}

            {/* Info de retirada */}
            <div className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">
              <p className="text-xs text-zinc-400 leading-snug">
                Ao reservar, o produto sera separado para voce. Retire na barbearia no dia do seu agendamento.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleReserve(selectedProduct)}
                disabled={reserving}
                className="w-full h-12 flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-extrabold uppercase tracking-wide disabled:opacity-50 transition-opacity"
              >
                {reserving ? 'Reservando...' : 'Confirmar reserva'}
              </button>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-full h-10 flex items-center justify-center rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
