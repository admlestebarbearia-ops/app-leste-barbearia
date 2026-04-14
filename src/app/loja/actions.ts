'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { validateAtualizarQuantidadeReserva, validateCancelarReservaProduto, validateReservarProduto } from '@/lib/booking/product-reservation-guards'
import { isPaymentIntentExpired, shouldReuseMercadoPagoPayment } from '@/lib/mercadopago/payment-flow'
import { buildPaymentExpirationIso, normalizePaymentExpiryMinutes } from '@/lib/mercadopago/payment-policy'
import { createMpCheckoutPreference } from '@/lib/mercadopago/create-preference'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function restoreProductStock(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  quantity: number
) {
  const { data: product } = await admin
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single()

  if (product && product.stock_quantity >= 0) {
    await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity + quantity })
      .eq('id', productId)
  }
}

async function expirePendingProductPayment(
  admin: ReturnType<typeof createAdminClient>,
  reservationId: string
) {
  const nowIso = new Date().toISOString()

  const { data: reservation } = await admin
    .from('product_reservations')
    .select('product_id, quantity, status')
    .eq('id', reservationId)
    .single()

  await admin
    .from('product_payment_intents')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('reservation_id', reservationId)
    .eq('status', 'pending')

  if (reservation?.status === 'aguardando_pagamento') {
    await restoreProductStock(admin, reservation.product_id, reservation.quantity)

    await admin
      .from('product_reservations')
      .update({ status: 'cancelado', updated_at: nowIso })
      .eq('id', reservationId)
      .eq('status', 'aguardando_pagamento')
  }
}

export async function iniciarCheckoutProduto(
  productId: string,
  quantity: number = 1
): Promise<{ success?: boolean; reservationId?: string; amount?: number; preferenceId?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Faça login para comprar.' }

  const admin = createAdminClient()

  const [{ data: product }, { data: config }, { data: profile }, { data: existingReservation }] = await Promise.all([
    admin
      .from('products')
      .select('id, name, price, cover_image_url, stock_quantity, is_active, reserve_enabled')
      .eq('id', productId)
      .single(),
    admin
      .from('business_config')
      .select('enable_products, mp_access_token, payment_expiry_minutes')
      .eq('id', 1)
      .single(),
    admin
      .from('profiles')
      .select('phone, email')
      .eq('id', user.id)
      .single(),
    admin
      .from('product_reservations')
      .select('id, status')
      .eq('product_id', productId)
      .eq('client_id', user.id)
      .is('appointment_id', null)
      .in('status', ['aguardando_pagamento', 'reservado'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!(config?.enable_products ?? false)) {
    return { error: 'Loja indisponível no momento.' }
  }

  const validationError = product
    ? validateReservarProduto(product, quantity, existingReservation?.status === 'reservado')
    : 'Produto indisponível.'
  if (validationError) return { error: validationError }

  if (!config?.mp_access_token) {
    return { error: 'Pagamento online indisponível no momento. Tente novamente mais tarde.' }
  }

  if (existingReservation?.status === 'aguardando_pagamento') {
    return retomarPagamentoProduto(existingReservation.id)
  }

  if (!product) return { error: 'Produto indisponível.' }

  const paymentExpiryMinutes = normalizePaymentExpiryMinutes(config.payment_expiry_minutes)

  if (product.stock_quantity !== -1) {
    const { error: stockErr } = await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity - quantity })
      .eq('id', productId)
    if (stockErr) return { error: 'Erro ao iniciar checkout. Tente novamente.' }
  }

  const { data: reservation, error: reservationError } = await admin
    .from('product_reservations')
    .insert({
      product_id: productId,
      appointment_id: null,
      client_id: user.id,
      client_phone: profile?.phone ?? null,
      quantity,
      status: 'aguardando_pagamento',
      product_name_snapshot: product.name,
      product_price_snapshot: product.price,
      product_image_snapshot: product.cover_image_url,
    })
    .select('id')
    .single()

  if (reservationError || !reservation) {
    if (product.stock_quantity !== -1) {
      await admin
        .from('products')
        .update({ stock_quantity: product.stock_quantity })
        .eq('id', productId)
    }
    return { error: 'Erro ao criar reserva de compra.' }
  }

  const expiresAt = buildPaymentExpirationIso(new Date(), paymentExpiryMinutes)
  const amount = Number(product.price) * quantity

  // Tenta criar uma Preference MP antes de inserir o payment_intent.
  // Isso preenche items.quantity, items.unit_price e back_urls no checker de qualidade MP.
  // Falha silenciosa: sem preference o Bricks ainda funciona.
  let mpPreferenceId: string | null = null
  try {
    const h = await headers()
    const host = h.get('host') ?? ''
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    const baseUrl = `${proto}://${host}`

    const prefResult = await createMpCheckoutPreference({
      accessToken: config.mp_access_token!,
      externalReference: reservation.id,
      itemId: `prd-${reservation.id.slice(0, 8)}`,
      title: product.name,
      unitPrice: Number(product.price),
      quantity,
      payerEmail: profile?.email ?? null,
      baseUrl,
      expiryMinutes: paymentExpiryMinutes,
      backUrls: {
        success: `${baseUrl}/loja/pagamento/sucesso`,
        failure: `${baseUrl}/loja`,
        pending: `${baseUrl}/loja/pagamento/pendente`,
      },
      statementDescriptor: 'BARBEARIA LESTE',
    })
    mpPreferenceId = prefResult.preferenceId
  } catch {
    // Preference é opcional — o checkout transparente (Bricks) funciona sem ela.
  }

  const { data: paymentIntent, error: paymentIntentError } = await admin
    .from('product_payment_intents')
    .insert({
      reservation_id: reservation.id,
      mp_preference_id: mpPreferenceId,
      status: 'pending',
      amount,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (paymentIntentError || !paymentIntent) {
    await restoreProductStock(admin, productId, quantity)
    await admin.from('product_reservations').delete().eq('id', reservation.id)
    return { error: 'Erro ao preparar pagamento do produto.' }
  }

  revalidatePath('/loja')
  return {
    success: true,
    reservationId: reservation.id,
    amount,
    ...(mpPreferenceId ? { preferenceId: mpPreferenceId } : {}),
  }
}

export async function retomarPagamentoProduto(
  reservationId: string
): Promise<{ success?: boolean; reservationId?: string; amount?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Faça login para continuar o pagamento.' }

  const admin = createAdminClient()
  const [{ data: reservation }, { data: config }] = await Promise.all([
    admin
      .from('product_reservations')
      .select('id, client_id, status, product_id, quantity, product_name_snapshot, product_price_snapshot')
      .eq('id', reservationId)
      .single(),
    admin
      .from('business_config')
      .select('mp_access_token, payment_expiry_minutes')
      .eq('id', 1)
      .single(),
  ])

  if (!reservation || reservation.client_id !== user.id) {
    return { error: 'Reserva não encontrada.' }
  }

  if (reservation.status !== 'aguardando_pagamento') {
    return { error: 'Este pedido não está aguardando pagamento.' }
  }

  if (!config?.mp_access_token) {
    return { error: 'Pagamento online indisponível no momento.' }
  }

  const { data: paymentIntent } = await admin
    .from('product_payment_intents')
    .select('id, status, expires_at')
    .eq('reservation_id', reservationId)
    .single()

  if (!paymentIntent) {
    return { error: 'Controle de pagamento do produto não encontrado.' }
  }

  if (paymentIntent.status === 'expired' || isPaymentIntentExpired(paymentIntent.expires_at)) {
    await expirePendingProductPayment(admin, reservationId)
    revalidatePath('/loja')
    return { error: 'Prazo de pagamento expirado. Inicie uma nova compra.' }
  }

  return {
    success: true,
    reservationId,
    amount: Number(reservation.product_price_snapshot) * reservation.quantity,
  }
}

export async function getPendingProductPaymentDetails(reservationId: string): Promise<{
  reservation?: {
    id: string
    amount: number
    productName: string
    quantity: number
    existingPaymentId?: string
  }
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Faça login para continuar o pagamento.' }

  const admin = createAdminClient()
  const { data: reservation } = await admin
    .from('product_reservations')
    .select('id, client_id, status, quantity, product_name_snapshot, product_price_snapshot')
    .eq('id', reservationId)
    .single()

  if (!reservation || reservation.client_id !== user.id || reservation.status !== 'aguardando_pagamento') {
    return { error: 'Pagamento pendente não encontrado.' }
  }

  const { data: paymentIntent } = await admin
    .from('product_payment_intents')
    .select('status, mp_payment_id, expires_at')
    .eq('reservation_id', reservationId)
    .single()

  if (!paymentIntent) {
    return { error: 'Controle de pagamento do produto não encontrado.' }
  }

  if (paymentIntent.status === 'expired' || isPaymentIntentExpired(paymentIntent.expires_at)) {
    await expirePendingProductPayment(admin, reservationId)
    revalidatePath('/loja')
    return { error: 'Prazo de pagamento expirado. Inicie uma nova compra.' }
  }

  const existingPaymentId = paymentIntent.mp_payment_id && shouldReuseMercadoPagoPayment(paymentIntent.status)
    ? paymentIntent.mp_payment_id
    : undefined

  return {
    reservation: {
      id: reservation.id,
      amount: Number(reservation.product_price_snapshot) * reservation.quantity,
      productName: reservation.product_name_snapshot,
      quantity: reservation.quantity,
      existingPaymentId,
    },
  }
}

export async function getPendingProductPaymentStatus(reservationId: string): Promise<{
  reservationStatus?: string
  paymentIntentStatus?: string | null
  paymentId?: string | null
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Faça login para continuar o pagamento.' }

  const admin = createAdminClient()
  const { data: reservation } = await admin
    .from('product_reservations')
    .select('id, client_id, status')
    .eq('id', reservationId)
    .single()

  if (!reservation || reservation.client_id !== user.id) {
    return { error: 'Reserva não encontrada.' }
  }

  const { data: paymentIntent } = await admin
    .from('product_payment_intents')
    .select('status, mp_payment_id, expires_at')
    .eq('reservation_id', reservationId)
    .single()

  if (!paymentIntent) {
    return { reservationStatus: reservation.status, paymentIntentStatus: null, paymentId: null }
  }

  let resolvedPaymentIntentStatus = paymentIntent.status
  if (paymentIntent.status === 'expired') {
    await expirePendingProductPayment(admin, reservationId)
  } else if (isPaymentIntentExpired(paymentIntent.expires_at) && paymentIntent.status === 'pending') {
    await expirePendingProductPayment(admin, reservationId)
    resolvedPaymentIntentStatus = 'expired'
  }

  const { data: refreshedReservation } = await admin
    .from('product_reservations')
    .select('status')
    .eq('id', reservationId)
    .single()

  return {
    reservationStatus: refreshedReservation?.status ?? reservation.status,
    paymentIntentStatus: resolvedPaymentIntentStatus,
    paymentId: paymentIntent.mp_payment_id,
  }
}

export async function reservarProduto(
  productId: string,
  quantity: number = 1
): Promise<{ success?: boolean; error?: string }> {
  const result = await iniciarCheckoutProduto(productId, quantity)
  return result.success ? { success: true } : { error: result.error }
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
  const cancelError = validateCancelarReservaProduto(reservation, user.id)
  if (cancelError) return { error: cancelError }

  await restoreProductStock(admin, reservation.product_id, reservation.quantity)

  await admin
    .from('product_payment_intents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('reservation_id', reservationId)
    .eq('status', 'pending')

  const { error } = await admin
    .from('product_reservations')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', reservationId)

  if (error) return { error: 'Erro ao cancelar reserva.' }

  revalidatePath('/loja')
  return { success: true }
}

// Atualiza a quantidade de uma reserva standalone ativa.
// Diferença positiva → debita estoque; negativa → devolve estoque.
export async function atualizarQuantidadeReserva(
  reservationId: string,
  newQuantity: number
): Promise<{ success?: boolean; error?: string }> {
  if (newQuantity < 1) return { error: 'Quantidade inválida.' }

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

  const { data: product } = await admin
    .from('products')
    .select('stock_quantity')
    .eq('id', reservation.product_id)
    .single()

  const updateError = validateAtualizarQuantidadeReserva(
    reservation,
    user.id,
    product?.stock_quantity ?? 0,
    newQuantity
  )
  if (updateError) return { error: updateError }

  const diff = newQuantity - reservation.quantity

  if (diff !== 0 && product && product.stock_quantity !== -1) {
    await admin
      .from('products')
      .update({ stock_quantity: product.stock_quantity - diff })
      .eq('id', reservation.product_id)
  }

  const { error } = await admin
    .from('product_reservations')
    .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
    .eq('id', reservationId)

  if (error) return { error: 'Erro ao atualizar reserva.' }

  revalidatePath('/loja')
  return { success: true }
}

