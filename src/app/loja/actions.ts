'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function reservarProduto(
  productId: string,
  quantity: number = 1
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Faça login para reservar.' }

  const admin = createAdminClient()

  // Busca produto
  const { data: product } = await admin
    .from('products')
    .select('id, name, price, cover_image_url, stock_quantity, is_active, reserve_enabled')
    .eq('id', productId)
    .single()

  if (!product || !product.is_active || !product.reserve_enabled) {
    return { error: 'Produto indisponível.' }
  }

  // Verifica estoque
  if (product.stock_quantity !== -1 && product.stock_quantity < quantity) {
    return { error: 'Estoque insuficiente.' }
  }

  // Verifica se já tem reserva ativa standalone para este produto
  const { data: existing } = await admin
    .from('product_reservations')
    .select('id')
    .eq('product_id', productId)
    .eq('client_id', user.id)
    .eq('status', 'reservado')
    .is('appointment_id', null)
    .maybeSingle()

  if (existing) {
    return { error: 'Você já tem uma reserva ativa para este produto.' }
  }

  // Busca telefone do perfil para snapshot
  const { data: profile } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', user.id)
    .single()

  // Decrementa estoque (se não for ilimitado)
  if (product.stock_quantity !== -1) {
    const { error: stockErr } = await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity - quantity })
      .eq('id', productId)
    if (stockErr) return { error: 'Erro ao reservar. Tente novamente.' }
  }

  const { error } = await admin.from('product_reservations').insert({
    product_id: productId,
    appointment_id: null,
    client_id: user.id,
    client_phone: profile?.phone ?? null,
    quantity,
    status: 'reservado',
    product_name_snapshot: product.name,
    product_price_snapshot: product.price,
    product_image_snapshot: product.cover_image_url,
  })

  if (error) {
    // Rollback estoque
    if (product.stock_quantity !== -1) {
      await admin
        .from('products')
        .update({ stock_quantity: product.stock_quantity })
        .eq('id', productId)
    }
    return { error: 'Erro ao criar reserva.' }
  }

  revalidatePath('/loja')
  return { success: true }
}

export async function cancelarReservaProduto(
  reservationId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const admin = createAdminClient()

  const { data: reservation } = await admin
    .from('product_reservations')
    .select('id, client_id, product_id, quantity, status')
    .eq('id', reservationId)
    .single()

  if (!reservation) return { error: 'Reserva não encontrada.' }
  if (reservation.client_id !== user.id) return { error: 'Não autorizado.' }
  if (reservation.status !== 'reservado') return { error: 'Esta reserva não pode ser cancelada.' }

  // Restaura estoque
  const { data: product } = await admin
    .from('products')
    .select('stock_quantity')
    .eq('id', reservation.product_id)
    .single()

  if (product && product.stock_quantity >= 0) {
    await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity + reservation.quantity })
      .eq('id', reservation.product_id)
  }

  const { error } = await admin
    .from('product_reservations')
    .update({ status: 'cancelado' })
    .eq('id', reservationId)

  if (error) return { error: 'Erro ao cancelar reserva.' }

  revalidatePath('/loja')
  return { success: true }
}
