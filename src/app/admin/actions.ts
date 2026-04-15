'use server'

import {
  validateServicePayload,
  validateBusinessConfigPatch,
  validateSpecialSchedulePayload,
  validateWorkingHoursRow,
} from '@/lib/admin/admin-validation'
import { normalizePhoneLookup } from '@/lib/auth/session-state'
import { getAppointmentPaymentSummaryMap } from '@/lib/booking/appointment-payment-context'
import { getAppointmentOperationalStatus, isAppointmentPast } from '@/lib/booking/appointment-visibility'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { firePushToUser, firePushToAdmins } from '@/app/api/push/actions'
import { revalidatePath } from 'next/cache'
import { MAX_PAYMENT_EXPIRY_MINUTES, normalizePaymentExpiryMinutes } from '@/lib/mercadopago/payment-policy'
import type { BusinessConfig, PaymentMethod, WorkingHours } from '@/lib/supabase/types'

// ─── Guard: verifica se o usuário atual é admin ──────────────────────────
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nao autenticado.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) throw new Error('Sem permissao.')
  return { supabase, user }
}

type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdmin>>['supabase']

function getCardRateByPaymentMethod(
  configData: {
    debit_rate_pct?: number | null
    credit_rate_pct?: number | null
    default_card_rate_pct?: number | null
  } | null,
  paymentMethod: PaymentMethod | null | undefined
) {
  if (paymentMethod === 'debito') {
    return configData?.debit_rate_pct ?? configData?.default_card_rate_pct ?? 0
  }

  if (paymentMethod === 'credito') {
    return configData?.credit_rate_pct ?? configData?.default_card_rate_pct ?? 0
  }

  return 0
}

function buildRegisteredClientKey(clientId: string) {
  return `user:${clientId}`
}

function buildVisitorClientKey(phone: string) {
  return `visitor:${phone}`
}

// Usuário deletado do auth.users → client_id virou NULL, mas client_email ainda existe
function buildEmailClientKey(email: string) {
  return `email:${email.toLowerCase()}`
}

// Agendamento anônimo sem client_id, sem phone, sem email — chave pelo próprio id
function buildApptClientKey(apptId: string) {
  return `appt:${apptId}`
}

function getDaysSinceDate(date: string, now = new Date()) {
  const base = new Date(`${date}T12:00:00`)
  if (Number.isNaN(base.getTime())) return 0
  return Math.floor((now.getTime() - base.getTime()) / (24 * 60 * 60 * 1000))
}

async function ensureAppointmentReversalEntry(
  supabase: AdminSupabaseClient,
  appointmentId: string,
  createdBy: string | null,
  descriptionPrefix = 'Estorno automático'
) {
  const { data: existingReversal } = await supabase
    .from('financial_entries')
    .select('id')
    .eq('source', 'estorno')
    .eq('reference_id', appointmentId)
    .limit(1)
    .maybeSingle()

  if (existingReversal) {
    return { created: false, alreadyExists: true, hasRevenue: true }
  }

  const { data: revenueEntry } = await supabase
    .from('financial_entries')
    .select('amount, description, payment_method, net_amount')
    .eq('source', 'agendamento')
    .eq('reference_id', appointmentId)
    .limit(1)
    .maybeSingle()

  if (!revenueEntry) {
    return { created: false, alreadyExists: false, hasRevenue: false }
  }

  const { error } = await supabase.from('financial_entries').insert({
    type: 'despesa',
    source: 'estorno',
    amount: revenueEntry.amount,
    description: `${descriptionPrefix}: ${revenueEntry.description}`,
    payment_method: revenueEntry.payment_method ?? null,
    card_rate_pct: 0,
    net_amount: -Math.abs(revenueEntry.net_amount ?? revenueEntry.amount),
    reference_id: appointmentId,
    date: new Date().toISOString().split('T')[0],
    created_by: createdBy,
  })

  if (error) throw error

  return { created: true, alreadyExists: false, hasRevenue: true }
}

export async function togglePauseStatus(
  isPaused: boolean,
  message: string | null = null,
  returnTime: string | null = null
) {
  try {
    const { supabase } = await requireAdmin()
    
    const { error } = await supabase
      .from('business_config')
      .update({ 
        is_paused: isPaused,
        pause_message: message,
        pause_return_time: returnTime 
      })
      .eq('id', 1)

    if (error) throw error
    revalidatePath('/admin')
    revalidatePath('/agendar')
    return { success: true }
  } catch (error: any) {
    console.error('Erro ao alternar pausa:', error)
    return { success: false, error: error.message }
  }
}


// ─── Atualizar status de agendamento ────────────────────────────────────
export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'cancelado' | 'faltou'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // Busca detalhes antes de atualizar (para push notification)
    const { data: appt } = await supabase
      .from('appointments')
      .select('client_id, client_name, service_name_snapshot, date, start_time')
      .eq('id', appointmentId)
      .single()

    const { error } = await supabase
      .from('appointments')
      .update({ status, ...(status === 'cancelado' ? { cancelled_by_admin: true } : {}) })
      .eq('id', appointmentId)
    if (error) throw error

    // Notifica cliente: admin cancelou o agendamento
    if (status === 'cancelado' && appt?.client_id) {
      await firePushToUser(appt.client_id, {
        title: '❌ Seu agendamento foi cancelado',
        body: `${appt.service_name_snapshot ?? 'Serviço'} em ${appt.date.split('-').reverse().join('/')} às ${appt.start_time.slice(0, 5)} foi cancelado pela barbearia.`,
        url: '/reservas',
        tag: `cancelado-admin-${appointmentId}`,
      })
    }

    revalidatePath('/admin')
    revalidatePath('/reservas')
    revalidatePath('/perfil')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Excluir agendamento (oculta do painel admin, mas cliente ainda vê) ──────
export async function deleteAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // Busca detalhes antes de atualizar (para push notification)
    const { data: appt } = await supabase
      .from('appointments')
      .select('client_id, client_name, service_name_snapshot, date, start_time')
      .eq('id', appointmentId)
      .single()

    // admin_hidden_at oculta apenas do painel do admin.
    // O status fica 'cancelado' para o cliente saber que foi cancelado,
    // mas o agendamento NÃO desaparece do painel do cliente (deleted_at não é tocado).
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado', admin_hidden_at: new Date().toISOString() })
      .eq('id', appointmentId)
    if (error) throw error

    // Notifica cliente: agendamento cancelado (mesmo fluxo do updateAppointmentStatus)
    if (appt?.client_id) {
      await firePushToUser(appt.client_id, {
        title: '❌ Seu agendamento foi cancelado',
        body: `${appt.service_name_snapshot ?? 'Serviço'} em ${appt.date.split('-').reverse().join('/')} às ${appt.start_time.slice(0, 5)} foi cancelado pela barbearia.`,
        url: '/reservas',
        tag: `cancelado-admin-${appointmentId}`,
      })
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Bloquear / desbloquear cliente ─────────────────────────────────────
export async function toggleBlockClient(
  clientId: string,
  block: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('profiles')
      .update({ is_blocked: block })
      .eq('id', clientId)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Salvar configurações de negócio ────────────────────────────────────
export async function saveBusinessConfig(
  data: Partial<BusinessConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const validationError = validateBusinessConfigPatch(data)
    if (validationError) {
      return { success: false, error: validationError }
    }
    const { error } = await supabase
      .from('business_config')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) throw error
    revalidatePath('/admin')
    revalidatePath('/agendar')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Salvar horários de funcionamento ───────────────────────────────────
export async function saveWorkingHours(
  hours: Omit<WorkingHours, 'id'>[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    for (const h of hours) {
      const validationError = validateWorkingHoursRow(h)
      if (validationError) {
        return { success: false, error: `${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][h.day_of_week]}: ${validationError}` }
      }
      const { error } = await supabase
        .from('working_hours')
        .update({
          is_open: h.is_open,
          open_time: h.open_time,
          close_time: h.close_time,
          lunch_start: h.lunch_start,
          lunch_end: h.lunch_end,
        })
        .eq('day_of_week', h.day_of_week)
      if (error) throw error
    }
    revalidatePath('/agendar')
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Adicionar data especial ─────────────────────────────────────────────
export async function addSpecialSchedule(data: {
  date: string
  is_closed: boolean
  open_time?: string | null
  close_time?: string | null
  reason?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const validationError = validateSpecialSchedulePayload(data)
    if (validationError) {
      return { success: false, error: validationError }
    }
    const { error } = await supabase
      .from('special_schedules')
      .upsert({
        ...data,
        open_time: data.is_closed ? null : data.open_time ?? null,
        close_time: data.is_closed ? null : data.close_time ?? null,
      }, { onConflict: 'date' })
    if (error) throw error
    revalidatePath('/agendar')
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Remover data especial ────────────────────────────────────────────────
export async function removeSpecialSchedule(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase.from('special_schedules').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/agendar')
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Gerenciar serviços ───────────────────────────────────────────────────
export async function upsertService(data: {
  id?: string
  name: string
  price: number
  duration_minutes: number
  icon_name?: string | null
  is_active?: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const validationError = validateServicePayload(data)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (data.id) {
      const { error } = await supabase.from('services').update(data).eq('id', data.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('services').insert(data)
      if (error) throw error
    }
    revalidatePath('/agendar')
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function toggleServiceActive(
  id: string,
  is_active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase.from('services').update({ is_active }).eq('id', id)
    if (error) throw error
    revalidatePath('/agendar')
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Upload de imagem para Storage ──────────────────────────────────────
export async function uploadImage(
  bucket: 'logo' | 'barbeiro-foto' | 'galeria',
  base64: string,
  mimeType: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const filename = `${bucket}-${Date.now()}.${mimeType.split('/')[1]}`
    const buffer = Buffer.from(base64.split(',')[1], 'base64')

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, { contentType: mimeType, upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(bucket).getPublicUrl(filename)
    return { url: data.publicUrl }
  } catch (e) {
    return { url: null, error: (e as Error).message }
  }
}

// ─── Listar usuários (para gerenciar admins) ─────────────────────────────
export async function listUsers(): Promise<{
  users: { id: string; email: string | null; is_admin: boolean; is_blocked: boolean; created_at: string }[]
  error?: string
}> {
  try {
    const { supabase } = await requireAdmin()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, is_admin, is_blocked, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return { users: data ?? [] }
  } catch (e) {
    return { users: [], error: (e as Error).message }
  }
}

// ─── Promover / remover admin ──────────────────────────────────────────────
export async function setAdminRole(
  userId: string,
  isAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await requireAdmin()
    if (userId === user.id) throw new Error('Voce nao pode alterar sua propria permissao de admin.')
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: isAdmin })
      .eq('id', userId)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Completar onboarding ────────────────────────────────────────────────
export async function completeOnboarding(data: {
  barber_name: string
  barber_nickname: string
  display_name_preference: 'name' | 'nickname'
  barber_photo_url?: string | null
  logo_url?: string | null
  require_google_login: boolean
  cancellation_window_minutes: number
  workingHours: Omit<WorkingHours, 'id'>[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    const { workingHours, ...configData } = data

    const configValidationError = validateBusinessConfigPatch(configData)
    if (configValidationError) {
      return { success: false, error: configValidationError }
    }

    const { error: configError } = await supabase
      .from('business_config')
      .update({
        ...configData,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    if (configError) throw configError

    for (const h of workingHours) {
      const validationError = validateWorkingHoursRow(h)
      if (validationError) {
        return { success: false, error: `${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][h.day_of_week]}: ${validationError}` }
      }
      const { error } = await supabase
        .from('working_hours')
        .update({
          is_open: h.is_open,
          open_time: h.open_time,
          close_time: h.close_time,
          lunch_start: h.lunch_start,
          lunch_end: h.lunch_end,
        })
        .eq('day_of_week', h.day_of_week)
      if (error) throw error
    }

    revalidatePath('/admin')
    revalidatePath('/agendar')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}



// ─── ADMIN GALERIA ──────────────────────────────────────────────────
export async function fetchAdminGalleryPhotos() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.from('gallery_photos').select('*').order('created_at', { ascending: false })
  return { success: !error, data: data || [], error: error?.message }
}

export async function deleteGalleryPhoto(id: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('gallery_photos').delete().eq('id', id)
  if (!error) revalidatePath('/admin')
  return { success: !error, error: error?.message }
}

export async function approveGalleryPhoto(id: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('gallery_photos').update({ status: 'approved' }).eq('id', id)
  if (!error) revalidatePath('/admin')
  return { success: !error, error: error?.message }
}

export async function uploadAdminGalleryPhoto(base64: string, mimeType: string) {
  const { supabase } = await requireAdmin()
  const { url, error } = await uploadImage('galeria', base64, mimeType)
  if (error || !url) return { success: false, error: error || 'Failed to upload' }
  const { error: dbError } = await supabase.from('gallery_photos').insert({ url, status: 'approved' })
  if (!dbError) revalidatePath('/admin')
  return { success: !dbError, error: dbError?.message }
}

// ─── BARBEIROS ────────────────────────────────────────────────────────────
export async function listBarbers() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('barbers')
    .select('*')
    .order('created_at', { ascending: true })
  return { success: !error, data: data ?? [], error: error?.message }
}

export async function upsertBarber(data: {
  id?: string
  name: string
  nickname?: string | null
  photo_url?: string | null
  is_active?: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    if (data.id) {
      const { error } = await supabase
        .from('barbers')
        .update({ name: data.name, nickname: data.nickname ?? null, photo_url: data.photo_url ?? null })
        .eq('id', data.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('barbers')
        .insert({ name: data.name, nickname: data.nickname ?? null, photo_url: data.photo_url ?? null, is_active: true })
      if (error) throw error
    }
    revalidatePath('/admin')
    revalidatePath('/agendar')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function toggleBarberActive(id: string, is_active: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase.from('barbers').update({ is_active }).eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    revalidatePath('/agendar')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── PRODUTOS ───────────────────────────────────────────────────────────────

export async function listProducts() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return { success: !error, data: data ?? [], error: error?.message }
}

export async function upsertProduct(data: {
  id?: string
  name: string
  short_description?: string | null
  full_description?: string | null
  size_info?: string | null
  price: number
  stock_quantity: number
  is_active: boolean
  reserve_enabled: boolean
  cover_image_url?: string | null
  sort_order?: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // RN: nome obrigatorio e preco >= 0
    if (!data.name.trim()) return { success: false, error: 'Nome do produto e obrigatorio.' }
    if (data.price < 0) return { success: false, error: 'Preco nao pode ser negativo.' }
    if (data.stock_quantity < -1) return { success: false, error: 'Estoque invalido. Use -1 para ilimitado.' }

    const payload = {
      name: data.name.trim(),
      short_description: data.short_description?.trim() || null,
      full_description: data.full_description?.trim() || null,
      size_info: data.size_info?.trim() || null,
      price: data.price,
      stock_quantity: data.stock_quantity,
      is_active: data.is_active,
      reserve_enabled: data.reserve_enabled,
      cover_image_url: data.cover_image_url ?? null,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    }

    if (data.id) {
      const { error } = await supabase.from('products').update(payload).eq('id', data.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) throw error
    }
    revalidatePath('/admin')
    revalidatePath('/agendar/sucesso')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function toggleProductActive(
  id: string,
  is_active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('products')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    revalidatePath('/agendar/sucesso')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // RN: nao permite excluir se ha reservas ativas (reservado)
    const { count } = await supabase
      .from('product_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)
      .eq('status', 'reservado')

    if (count && count > 0) {
      return { success: false, error: 'Nao e possivel excluir: ha reservas ativas para este produto. Cancele-as primeiro.' }
    }

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function uploadProductImage(
  base64: string,
  mimeType: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const ext = mimeType.split('/')[1] || 'webp'
    const filename = `produto-${Date.now()}.${ext}`
    const buffer = Buffer.from(base64.split(',')[1], 'base64')

    const { error: uploadError } = await supabase.storage
      .from('produtos')
      .upload(filename, buffer, { contentType: mimeType, upsert: true })

    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('produtos').getPublicUrl(filename)
    return { url: data.publicUrl }
  } catch (e) {
    return { url: null, error: (e as Error).message }
  }
}

export async function listProductReservations() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('product_reservations')
    .select('*, products(name, cover_image_url, price)')
    .order('created_at', { ascending: false })
    .limit(200)
  return { success: !error, data: data ?? [], error: error?.message }
}

export async function updateProductReservationStatus(
  id: string,
  status: 'reservado' | 'cancelado' | 'retirado',
  payment_method?: PaymentMethod
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    let resolvedPaymentMethod: PaymentMethod | undefined

    // RN: ao cancelar, devolve estoque se a reserva ainda estava aberta para pagamento/retirada.
    if (status === 'cancelado') {
      const { data: reservation } = await supabase
        .from('product_reservations')
        .select('product_id, quantity, status')
        .eq('id', id)
        .single()

      if (reservation && (reservation.status === 'reservado' || reservation.status === 'aguardando_pagamento')) {
        const { data: product } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', reservation.product_id)
          .single()

        if (product && product.stock_quantity >= 0) {
          await supabase
            .from('products')
            .update({ stock_quantity: product.stock_quantity + reservation.quantity })
            .eq('id', reservation.product_id)
        }
      }
    }

    if (status === 'retirado') {
      const { data: paymentIntent } = await supabase
        .from('product_payment_intents')
        .select('status, payment_method, refunded_at')
        .eq('reservation_id', id)
        .maybeSingle()

      const { data: existingRevenue } = await supabase
        .from('financial_entries')
        .select('id')
        .eq('source', 'produto')
        .eq('reference_id', id)
        .limit(1)
        .maybeSingle()

      resolvedPaymentMethod = paymentIntent?.status === 'approved' && !paymentIntent.refunded_at
        ? paymentIntent.payment_method ?? payment_method ?? 'mercado_pago'
        : payment_method

      if (!existingRevenue && !resolvedPaymentMethod) {
        return { success: false, error: 'Informe a forma de pagamento para registrar a receita do produto.' }
      }
    }

    const { error } = await supabase
      .from('product_reservations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    // Ao marcar como retirado → cria entrada financeira automática somente se ainda não houve pré-pagamento.
    if (status === 'retirado') {
      const { data: existingRevenue } = await supabase
        .from('financial_entries')
        .select('id')
        .eq('source', 'produto')
        .eq('reference_id', id)
        .limit(1)
        .maybeSingle()

      if (existingRevenue) {
        revalidatePath('/admin')
        return { success: true }
      }

      const { data: res } = await supabase
        .from('product_reservations')
        .select('product_name_snapshot, product_price_snapshot, quantity')
        .eq('id', id)
        .single()
      if (res && res.product_price_snapshot != null) {
        const { data: configData } = await supabase
          .from('business_config')
          .select('debit_rate_pct, credit_rate_pct, default_card_rate_pct')
          .single()
        const cardRate = getCardRateByPaymentMethod(configData, resolvedPaymentMethod)
        const amount = res.product_price_snapshot * (res.quantity ?? 1)
        const netAmount = amount * (1 - cardRate / 100)
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('financial_entries').insert({
          type: 'receita',
          source: 'produto',
          amount,
          description: res.product_name_snapshot ?? 'Produto',
          payment_method: resolvedPaymentMethod,
          card_rate_pct: cardRate,
          net_amount: netAmount,
          reference_id: id,
          date: new Date().toISOString().split('T')[0],
          created_by: user?.id ?? null,
        })
      }
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function deleteProductReservation(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: reservation } = await supabase
      .from('product_reservations')
      .select('product_id, quantity, status')
      .eq('id', id)
      .single()

    if (!reservation) return { success: false, error: 'Reserva não encontrada.' }

    if (reservation.status === 'reservado' || reservation.status === 'aguardando_pagamento') {
      const { data: product } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', reservation.product_id)
        .single()

      if (product && product.stock_quantity >= 0) {
        await supabase
          .from('products')
          .update({ stock_quantity: product.stock_quantity + reservation.quantity })
          .eq('id', reservation.product_id)
      }
    }

    const { error } = await supabase.from('product_reservations').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Excluir usuário ───────────────────────────────────────────────────────
// Regra: só permite excluir usuários SEM histórico de serviços (nenhum
// agendamento com status diferente de 'cancelado' que tenha preço registrado).
// Isso preserva integridade do financeiro e do histórico da barbearia.
export async function deleteUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user: adminUser } = await requireAdmin()

    if (userId === adminUser.id) {
      return { success: false, error: 'Você não pode excluir sua própria conta pelo painel.' }
    }

    // Verifica se o usuário tem agendamentos com histórico (confirmado ou faltou)
    const { data: history, error: histError } = await supabase
      .from('appointments')
      .select('id')
      .eq('client_id', userId)
      .in('status', ['confirmado', 'faltou'])
      .limit(1)

    if (histError) throw histError

    if (history && history.length > 0) {
      return {
        success: false,
        error: 'Este usuário possui histórico de serviços e não pode ser excluído. Utilize o bloqueio para impedir novos agendamentos.',
      }
    }

    // Cria client com service role para poder deletar da auth.users
    const adminSupabase = createAdminClient()
    const { data: profileSnapshot } = await adminSupabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()

    const fallbackClientName = profileSnapshot?.email ?? 'Cliente excluido'

    // Evita violação da CHECK constraint client_identifier: ao excluir o usuário,
    // o PostgreSQL faz SET NULL em appointments.client_id. Nesse caso, a constraint
    // exige client_name e client_phone preenchidos. Em contas antigas/teste, um ou
    // ambos podem estar nulos, então garantimos os snapshots antes da exclusão.
    await adminSupabase
      .from('appointments')
      .update({ client_name: fallbackClientName })
      .eq('client_id', userId)
      .is('client_name', null)

    await adminSupabase
      .from('appointments')
      .update({ client_phone: 'excluido' })
      .eq('client_id', userId)
      .is('client_phone', null)

    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Excluir cliente do diretório (admin override, sem guard de histórico) ──
// Visitantes: apaga todos os agendamentos com aquele telefone.
// Cadastrados: apaga todas as appointments, depois remove da auth.users
//   (cascade apaga profiles). Os agendamentos já deletados viram SET NULL no client_id,
//   mas como os excluímos antes isso não ocorre.
export async function deleteClientFromDirectory(
  clientKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user: adminUser } = await requireAdmin()
    const adminSupabase = createAdminClient()

    const isRegistered = clientKey.startsWith('user:')
    const isVisitor = clientKey.startsWith('visitor:')
    const isEmailOrphan = clientKey.startsWith('email:')
    const isApptOrphan = clientKey.startsWith('appt:')
    const targetId = clientKey.replace(/^user:|^visitor:|^email:|^appt:/, '')

    if (!targetId) return { success: false, error: 'Cliente inválido.' }

    if (isRegistered) {
      // Bloqueia auto-exclusão
      if (targetId === adminUser.id) {
        return { success: false, error: 'Você não pode excluir sua própria conta.' }
      }

      // Busca o telefone do perfil para limpar também agendamentos em modo visitante
      // (agendamentos criados antes do usuário se cadastrar com Google Login)
      const { data: profileData } = await adminSupabase
        .from('profiles')
        .select('phone')
        .eq('id', targetId)
        .maybeSingle()

      // Apaga agendamentos vinculados à conta (client_id = targetId)
      const { error: apptDeleteError } = await adminSupabase
        .from('appointments')
        .delete()
        .eq('client_id', targetId)
      if (apptDeleteError) throw apptDeleteError

      // Apaga também agendamentos em modo visitante com o mesmo telefone
      // (para evitar que o cliente reapareça no diretório como "visitante" após a exclusão)
      if (profileData?.phone) {
        const normalizedPhone = normalizePhoneLookup(profileData.phone)
        if (normalizedPhone) {
          const { data: visitorAppts } = await adminSupabase
            .from('appointments')
            .select('id, client_phone')
            .is('client_id', null)
          const visitorIds = (visitorAppts ?? [])
            .filter((a) => normalizePhoneLookup(a.client_phone) === normalizedPhone)
            .map((a) => a.id)
          if (visitorIds.length > 0) {
            await adminSupabase.from('appointments').delete().in('id', visitorIds)
          }
        }
      }

      // Remove da auth (cascade: profiles, push_subscriptions, client_ratings etc.)
      const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(targetId)
      if (deleteError) throw deleteError
    } else if (isVisitor) {
      // Visitante: limpa agendamentos pelo telefone normalizado
      const { data: appts } = await adminSupabase
        .from('appointments')
        .select('id, client_phone')
        .is('client_id', null)

      const matchIds = (appts ?? [])
        .filter((a) => normalizePhoneLookup(a.client_phone) === normalizePhoneLookup(targetId))
        .map((a) => a.id)

      if (matchIds.length > 0) {
        await adminSupabase.from('appointments').delete().in('id', matchIds)
      }
    } else if (isEmailOrphan) {
      // Usuário deletado do auth: appointments órfãos agrupados por e-mail
      await adminSupabase
        .from('appointments')
        .delete()
        .is('client_id', null)
        .ilike('client_email', targetId)
    } else if (isApptOrphan) {
      // Agendamento completamente anônimo: deleta pelo ID
      await adminSupabase.from('appointments').delete().eq('id', targetId)
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Detalhes de um usuário (perfil + histórico de agendamentos) ───────────
export async function getUserDetails(userId: string): Promise<{
  success: boolean
  data?: {
    profile: { email: string | null; is_admin: boolean; is_blocked: boolean; created_at: string }
    appointments: {
      id: string
      date: string
      start_time: string
      status: string
      service_name_snapshot: string | null
      service_price_snapshot: number | null
    }[]
    totalAppointments: number
  }
  error?: string
}> {
  try {
    const { supabase } = await requireAdmin()

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, is_admin, is_blocked, created_at')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError

    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('id, date, start_time, status, service_name_snapshot, service_price_snapshot')
      .eq('client_id', userId)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(50)

    if (apptError) throw apptError

    return {
      success: true,
      data: {
        profile,
        appointments: appointments ?? [],
        totalAppointments: appointments?.length ?? 0,
      },
    }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── FASE 3: Concluir agendamento ────────────────────────────────────────────
// CA: Só agendamentos confirmados do dia atual podem ser concluídos.
// CA: Ao concluir → cria financial_entry automaticamente.
export async function concludeAppointment(
  appointmentId: string,
  paymentMethod?: PaymentMethod,
  rating?: { score: number; note?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const today = new Date().toISOString().split('T')[0]

    const { data: appt, error: fetchError } = await supabase
      .from('appointments')
      .select('id, date, status, client_id, service_name_snapshot, service_price_snapshot')
      .eq('id', appointmentId)
      .single()

    if (fetchError) throw fetchError
    if (!appt) return { success: false, error: 'Agendamento não encontrado.' }
    if (appt.status !== 'confirmado') return { success: false, error: 'Só é possível concluir agendamentos confirmados.' }
    if (appt.date !== today) return { success: false, error: 'Só é possível concluir agendamentos do dia atual.' }

    const { data: existingRevenue } = await supabase
      .from('financial_entries')
      .select('id')
      .eq('source', 'agendamento')
      .eq('reference_id', appointmentId)
      .limit(1)
      .maybeSingle()

    const { data: paymentIntent } = await supabase
      .from('payment_intents')
      .select('status, payment_method, refunded_at')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    const resolvedPaymentMethod = paymentIntent?.status === 'approved' && !paymentIntent.refunded_at
      ? paymentIntent.payment_method ?? paymentMethod ?? 'mercado_pago'
      : paymentMethod

    // Busca taxas por tipo de pagamento
    const { data: configData } = await supabase
      .from('business_config')
      .select('debit_rate_pct, credit_rate_pct, default_card_rate_pct')
      .single()
    const cardRate = getCardRateByPaymentMethod(configData, resolvedPaymentMethod)

    const amount = appt.service_price_snapshot ?? 0
    const netAmount = amount * (1 - cardRate / 100)

    if (amount > 0 && !existingRevenue && !resolvedPaymentMethod) {
      return { success: false, error: 'Informe a forma de pagamento para concluir este atendimento.' }
    }

    // Atualiza status do agendamento
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'concluido' })
      .eq('id', appointmentId)
    if (updateError) throw updateError

    // Cria entrada financeira apenas quando ainda não houver receita lançada pelo webhook/manual.
    if (amount > 0 && !existingRevenue) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('financial_entries').insert({
        type: 'receita',
        source: 'agendamento',
        amount,
        description: appt.service_name_snapshot ?? 'Serviço',
        payment_method: resolvedPaymentMethod,
        card_rate_pct: cardRate,
        net_amount: netAmount,
        reference_id: appointmentId,
        date: today,
        created_by: user?.id ?? null,
      })
    }

    // Salva rating se fornecido
    if (rating && rating.score >= 1 && rating.score <= 5) {
      await supabase.from('client_ratings').insert({
        appointment_id: appointmentId,
        client_id: appt.client_id ?? null,
        score: rating.score,
        note: rating.note?.trim() || null,
      })
    }

    revalidatePath('/admin')
    revalidatePath('/reservas')
    revalidatePath('/perfil')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function estornarAgendamento(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await requireAdmin()

    const { data: paymentIntent } = await supabase
      .from('payment_intents')
      .select('status, payment_method, refunded_at')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (paymentIntent?.refunded_at) {
      return { success: false, error: 'Estorno já registrado para este agendamento.' }
    }

    const reversalResult = await ensureAppointmentReversalEntry(
      supabase,
      appointmentId,
      user.id,
      'Estorno'
    )

    if (reversalResult.alreadyExists) {
      return { success: false, error: 'Estorno já registrado para este agendamento.' }
    }

    if (!reversalResult.hasRevenue && paymentIntent?.status !== 'approved') {
      return { success: false, error: 'Nenhum pagamento elegível para estorno foi encontrado.' }
    }

    if (paymentIntent) {
      const { error: paymentIntentError } = await supabase
        .from('payment_intents')
        .update({
          status: 'cancelled',
          payment_method: paymentIntent.payment_method ?? null,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)

      if (paymentIntentError) throw paymentIntentError
    }

    revalidatePath('/admin')
    revalidatePath('/reservas')
    revalidatePath('/perfil')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── FASE 3: Entradas financeiras ────────────────────────────────────────────
export async function listFinancialEntries(filters?: {
  dateFrom?: string
  dateTo?: string
}): Promise<{ entries: import('@/lib/supabase/types').FinancialEntry[]; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    let query = supabase
      .from('financial_entries')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters?.dateFrom) query = query.gte('date', filters.dateFrom)
    if (filters?.dateTo)   query = query.lte('date', filters.dateTo)

    const { data, error } = await query.limit(500)
    if (error) throw error
    return { entries: (data ?? []) as import('@/lib/supabase/types').FinancialEntry[] }
  } catch (e) {
    return { entries: [], error: (e as Error).message }
  }
}

export async function addManualFinancialEntry(data: {
  type: 'receita' | 'despesa'
  amount: number
  description: string
  payment_method?: import('@/lib/supabase/types').PaymentMethod
  card_rate_pct?: number
  date: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    if (!data.description.trim()) return { success: false, error: 'Descrição obrigatória.' }
    if (data.amount <= 0) return { success: false, error: 'Valor deve ser maior que zero.' }

    const cardRate = data.card_rate_pct ?? 0
    const netAmount = data.amount * (1 - cardRate / 100)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('financial_entries').insert({
      type: data.type,
      source: 'manual',
      amount: data.amount,
      description: data.description.trim(),
      payment_method: data.payment_method ?? null,
      card_rate_pct: cardRate,
      net_amount: netAmount,
      reference_id: null,
      date: data.date,
      created_by: user?.id ?? null,
    })
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function updateManualFinancialEntry(
  id: string,
  data: {
    amount: number
    description: string
    payment_method?: string
    card_rate_pct?: number
    date: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // CA: Receitas automáticas (agendamento/produto) não podem ser editadas manualmente
    const { data: entry } = await supabase
      .from('financial_entries')
      .select('source')
      .eq('id', id)
      .single()
    if (!entry) return { success: false, error: 'Entrada não encontrada.' }
    if (entry.source === 'agendamento' || entry.source === 'produto') {
      return { success: false, error: 'Entradas automáticas não podem ser editadas.' }
    }

    const cardRate = data.card_rate_pct ?? 0
    const netAmount = data.amount * (1 - cardRate / 100)

    const { error } = await supabase
      .from('financial_entries')
      .update({
        amount: data.amount,
        description: data.description.trim(),
        payment_method: data.payment_method?.trim() || null,
        card_rate_pct: cardRate,
        net_amount: netAmount,
        date: data.date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function deleteManualFinancialEntry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // CA: Receitas automáticas não podem ser excluídas
    const { data: entry } = await supabase
      .from('financial_entries')
      .select('source')
      .eq('id', id)
      .single()
    if (!entry) return { success: false, error: 'Entrada não encontrada.' }
    if (entry.source === 'agendamento' || entry.source === 'produto') {
      return { success: false, error: 'Entradas automáticas não podem ser excluídas.' }
    }

    const { error } = await supabase.from('financial_entries').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── FASE 3: Taxas da maquininha ─────────────────────────────────────────────
export async function saveCardRates(
  debitPct: number,
  creditPct: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    if (debitPct < 0 || debitPct > 50) return { success: false, error: 'Taxa débito inválida (0–50%).' }
    if (creditPct < 0 || creditPct > 50) return { success: false, error: 'Taxa crédito inválida (0–50%).' }
    const { error } = await supabase
      .from('business_config')
      .update({
        debit_rate_pct: debitPct,
        credit_rate_pct: creditPct,
        default_card_rate_pct: debitPct, // compat legado
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── FASE 3: Ranking e dados de clientes ─────────────────────────────────────
export async function listClientStats(dormantDays = 30): Promise<{
  clients: {
    client_id: string
    email: string | null
    display_name: string | null
    phone: string | null
    total_services: number
    total_spent: number
    avg_rating: number | null
    last_service_date: string | null
    is_blocked: boolean
  }[]
  error?: string
}> {
  try {
    const { supabase } = await requireAdmin()

    // Busca todos os agendamentos concluídos
    const { data: appts, error: apptError } = await supabase
      .from('appointments')
      .select('client_id, date, service_price_snapshot')
      .eq('status', 'concluido')
      .not('client_id', 'is', null)

    if (apptError) throw apptError

    // Agrega por client_id
    const statsMap = new Map<string, {
      total_services: number
      total_spent: number
      last_service_date: string | null
    }>()

    for (const a of appts ?? []) {
      if (!a.client_id) continue
      const existing = statsMap.get(a.client_id) ?? { total_services: 0, total_spent: 0, last_service_date: null }
      existing.total_services += 1
      existing.total_spent += a.service_price_snapshot ?? 0
      if (!existing.last_service_date || a.date > existing.last_service_date) {
        existing.last_service_date = a.date
      }
      statsMap.set(a.client_id, existing)
    }

    if (statsMap.size === 0) return { clients: [] }

    const clientIds = Array.from(statsMap.keys())

    // Busca perfis
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name, phone, is_blocked')
      .in('id', clientIds)
    if (profileError) throw profileError

    // Busca médias de rating
    const { data: ratings } = await supabase
      .from('client_ratings')
      .select('client_id, score')
      .in('client_id', clientIds)

    const ratingMap = new Map<string, number[]>()
    for (const r of ratings ?? []) {
      if (!r.client_id) continue
      const arr = ratingMap.get(r.client_id) ?? []
      arr.push(r.score)
      ratingMap.set(r.client_id, arr)
    }

    const clients = (profiles ?? []).map((p) => {
      const stats = statsMap.get(p.id)!
      const scores = ratingMap.get(p.id)
      const avg_rating = scores && scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null

      return {
        client_id: p.id,
        email: p.email,
        display_name: p.display_name,
        phone: p.phone,
        total_services: stats.total_services,
        total_spent: stats.total_spent,
        avg_rating,
        last_service_date: stats.last_service_date,
        is_blocked: p.is_blocked,
      }
    }).sort((a, b) => b.total_services - a.total_services)

    return { clients }
  } catch (e) {
    return { clients: [], error: (e as Error).message }
  }
}

type ClientDirectoryItem = {
  client_key: string
  client_id: string | null
  name: string
  email: string | null
  phone: string | null
  is_registered: boolean
  is_blocked: boolean
  total_bookings: number
  total_services: number
  total_spent: number
  avg_rating: number | null
  last_service_date: string | null
  next_service_date: string | null
  next_service_time: string | null
  created_at: string | null
}

function sortClientDirectory(a: ClientDirectoryItem, b: ClientDirectoryItem) {
  return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
}

export async function listClientDirectory(dormantDays = 30): Promise<{
  directory: ClientDirectoryItem[]
  ranking: ClientDirectoryItem[]
  dormant: ClientDirectoryItem[]
  totals: { total_clients: number; registered_clients: number; visitor_clients: number }
  error?: string
}> {
  try {
    await requireAdmin()
    // Usa service role para bypassar RLS e ver agendamentos de todos os clientes
    const supabase = createAdminClient()
    const now = new Date()

    // Sem filtros de soft-delete: o diretório precisa do histórico COMPLETO
    // de cada cliente, incluindo agendamentos que o admin ocultou do painel "hoje"
    // (admin_hidden_at) ou que o cliente dispensou (deleted_at). Ambos os campos
    // podem não existir em instâncias onde as migrations antigas não foram aplicadas,
    // portanto não devemos filtrar por eles aqui.
    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_price_snapshot')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })

    if (appointmentError) throw appointmentError

    // Busca TODOS os perfis de uma vez (Bug 1: is_admin para filtrar admins;
    // Bug 3: normalização de telefone correta; Melhoria 1: created_at na ficha).
    // Feito antes de processar appointments para que profileByPhone use telefone
    // normalizado de TODOS os perfis, garantindo o merge visitante→cadastrado.
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, email, display_name, phone, is_blocked, is_admin, created_at')

    // Bug 1: admins são excluídos do diretório de clientes
    const adminIds = new Set((allProfiles ?? []).filter((p) => p.is_admin).map((p) => p.id))
    const nonAdminProfiles = (allProfiles ?? []).filter((p) => !p.is_admin)

    // profileByPhone usa chave normalizada (apenas dígitos) para garantir merge
    // mesmo quando profiles.phone está armazenado com hífen/espaço (Bug 3)
    const profileById = new Map(nonAdminProfiles.map((p) => [p.id, p]))
    const profileByPhone = new Map(
      nonAdminProfiles
        .map((p) => [normalizePhoneLookup(p.phone), p] as const)
        .filter((entry): entry is [string, NonNullable<typeof nonAdminProfiles>[number]] => Boolean(entry[0]))
    )

    const appointmentIds = (appointments ?? []).map((a) => a.id)
    const { data: ratings } = appointmentIds.length > 0
      ? await supabase.from('client_ratings').select('appointment_id, score').in('appointment_id', appointmentIds)
      : { data: [] }

    const appointmentClientKey = new Map<string, string>()
    const ratingBuckets = new Map<string, number[]>()
    const directoryMap = new Map<string, ClientDirectoryItem>()

    for (const appointment of appointments ?? []) {
      // Bug 1: pula agendamentos de contas admin
      if (appointment.client_id && adminIds.has(appointment.client_id)) continue

      const normalizedPhone = normalizePhoneLookup(appointment.client_phone)
      const matchedProfile = appointment.client_id
        ? profileById.get(appointment.client_id)
        : normalizedPhone
        ? profileByPhone.get(normalizedPhone)
        : null

      const resolvedClientId = appointment.client_id ?? matchedProfile?.id ?? null
      // Hierarquia de chaves:
      // 1. user:uuid   → usuário cadastrado ativo
      // 2. visitor:phone → visitante com telefone
      // 3. email:addr  → usuário deletado do auth (client_id=null, phone=null, email ainda existe)
      // 4. appt:id     → agendamento completamente anônimo sem identificador
      const clientKey = resolvedClientId
        ? buildRegisteredClientKey(resolvedClientId)
        : normalizedPhone
        ? buildVisitorClientKey(normalizedPhone)
        : appointment.client_email
        ? buildEmailClientKey(appointment.client_email)
        : buildApptClientKey(appointment.id)
      appointmentClientKey.set(appointment.id, clientKey)

      const current = directoryMap.get(clientKey) ?? {
        client_key: clientKey,
        client_id: resolvedClientId,
        name: matchedProfile?.display_name ?? appointment.client_name ?? appointment.client_email ?? matchedProfile?.email ?? 'Visitante',
        email: matchedProfile?.email ?? appointment.client_email ?? null,
        phone: matchedProfile?.phone ? normalizePhoneLookup(matchedProfile.phone) ?? matchedProfile.phone : normalizedPhone ?? appointment.client_phone ?? null,
        is_registered: Boolean(resolvedClientId),
        is_blocked: matchedProfile?.is_blocked ?? false,
        total_bookings: 0,
        total_services: 0,
        total_spent: 0,
        avg_rating: null,
        last_service_date: null,
        next_service_date: null,
        next_service_time: null,
        created_at: matchedProfile?.created_at ?? null,
      }

      current.total_bookings += 1

      if (appointment.status === 'concluido') {
        current.total_services += 1
        current.total_spent += appointment.service_price_snapshot ?? 0
        if (!current.last_service_date || appointment.date > current.last_service_date) {
          current.last_service_date = appointment.date
        }
      }

      if (
        (appointment.status === 'confirmado' || appointment.status === 'aguardando_pagamento') &&
        !isAppointmentPast(appointment.date, appointment.start_time, now)
      ) {
        const isEarlier = !current.next_service_date
          || appointment.date < current.next_service_date
          || (appointment.date === current.next_service_date && appointment.start_time < (current.next_service_time ?? '23:59:59'))

        if (isEarlier) {
          current.next_service_date = appointment.date
          current.next_service_time = appointment.start_time
        }
      }

      directoryMap.set(clientKey, current)
    }

    for (const rating of ratings ?? []) {
      const clientKey = appointmentClientKey.get(rating.appointment_id)
      if (!clientKey) continue
      const bucket = ratingBuckets.get(clientKey) ?? []
      bucket.push(rating.score)
      ratingBuckets.set(clientKey, bucket)
    }

    // Inclui perfis não-admin que não possuem nenhum agendamento (ex: usuários que
    // fizeram login mas ainda não agendaram). Bug 1.2 fix + Bug 1: admins excluídos.
    for (const profile of nonAdminProfiles) {
      const key = buildRegisteredClientKey(profile.id)
      if (!directoryMap.has(key)) {
        directoryMap.set(key, {
          client_key: key,
          client_id: profile.id,
          name: profile.display_name ?? profile.email ?? 'Usuário cadastrado',
          email: profile.email ?? null,
          phone: profile.phone ? normalizePhoneLookup(profile.phone) ?? profile.phone : null,
          is_registered: true,
          is_blocked: profile.is_blocked ?? false,
          total_bookings: 0,
          total_services: 0,
          total_spent: 0,
          avg_rating: null,
          last_service_date: null,
          next_service_date: null,
          next_service_time: null,
          created_at: profile.created_at ?? null,
        })
      }
    }

    const directory = Array.from(directoryMap.values()).map((client) => {
      const scores = ratingBuckets.get(client.client_key)
      return {
        ...client,
        avg_rating: scores && scores.length > 0
          ? Math.round((scores.reduce((acc, score) => acc + score, 0) / scores.length) * 10) / 10
          : null,
      }
    }).sort(sortClientDirectory)

    const ranking = [...directory]
      .filter((client) => client.total_services > 0)
      .sort((a, b) => {
        if (b.total_services !== a.total_services) return b.total_services - a.total_services
        if (b.total_spent !== a.total_spent) return b.total_spent - a.total_spent
        return sortClientDirectory(a, b)
      })
      .slice(0, 10)

    const dormant = directory.filter(
      (client) => client.last_service_date && !client.next_service_date && getDaysSinceDate(client.last_service_date, now) >= dormantDays
    )

    return {
      directory,
      ranking,
      dormant,
      totals: {
        total_clients: directory.length,
        registered_clients: directory.filter((client) => client.is_registered).length,
        visitor_clients: directory.filter((client) => !client.is_registered).length,
      },
    }
  } catch (e) {
    return {
      directory: [],
      ranking: [],
      dormant: [],
      totals: { total_clients: 0, registered_clients: 0, visitor_clients: 0 },
      error: (e as Error).message,
    }
  }
}

export async function getClientDirectoryDetails(clientKey: string): Promise<{
  success: boolean
  data?: {
    client: ClientDirectoryItem
    appointments: {
      id: string
      date: string
      start_time: string
      status: string
      service_name_snapshot: string | null
      service_price_snapshot: number | null
      payment_context: 'paid_online' | 'pay_locally' | 'paid' | 'refunded' | null
      rating_score: number | null
      rating_note: string | null
    }[]
  }
  error?: string
}> {
  try {
    await requireAdmin()
    // Usa service role para bypassar RLS e ver agendamentos de todos os clientes
    const supabase = createAdminClient()

    const isRegistered  = clientKey.startsWith('user:')
    const isVisitor     = clientKey.startsWith('visitor:')
    const isEmailOrphan = clientKey.startsWith('email:')
    const isApptOrphan  = clientKey.startsWith('appt:')
    const targetId = clientKey.replace(/^user:|^visitor:|^email:|^appt:/, '')

    if (!targetId) {
      return { success: false, error: 'Cliente inválido.' }
    }

    let profile: { id: string; email: string | null; display_name: string | null; phone: string | null; is_blocked: boolean } | null = null
    let appointments: Array<{
      id: string
      client_id: string | null
      client_name: string | null
      client_email: string | null
      client_phone: string | null
      date: string
      start_time: string
      status: 'confirmado' | 'concluido' | 'cancelado' | 'faltou' | 'aguardando_pagamento'
      service_name_snapshot: string | null
      service_price_snapshot: number | null
    }> = []

    if (isRegistered) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, display_name, phone, is_blocked')
        .eq('id', targetId)
        .single()

      profile = profileData

      const directAppointments = await supabase
        .from('appointments')
        .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_name_snapshot, service_price_snapshot')
        .eq('client_id', targetId)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })

      // Bug 3: busca visitante→cadastrado filtrando em JS com telefone normalizado,
      // para não depender de armazenamento exato do profiles.phone no DB.
      let phoneAppointments: { data: typeof appointments } = { data: [] }
      if (profile?.phone) {
        const normalizedProfilePhone = normalizePhoneLookup(profile.phone)
        if (normalizedProfilePhone) {
          const { data: allVisitorAppts } = await supabase
            .from('appointments')
            .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_name_snapshot, service_price_snapshot')
            .is('client_id', null)
            .order('date', { ascending: false })
            .order('start_time', { ascending: false })
          phoneAppointments = {
            data: (allVisitorAppts ?? []).filter(
              (a) => normalizePhoneLookup(a.client_phone) === normalizedProfilePhone
            ),
          }
        }
      }

      appointments = Array.from(
        new Map(
          [...(directAppointments.data ?? []), ...(phoneAppointments.data ?? [])].map((appointment) => [appointment.id, appointment])
        ).values()
      )
    } else if (isVisitor) {
      // Visitante identificado por telefone normalizado
      const normalizedPhone = normalizePhoneLookup(targetId)
      const { data } = await supabase
        .from('appointments')
        .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_name_snapshot, service_price_snapshot')
        .is('client_id', null)
        .eq('client_phone', normalizedPhone)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })

      appointments = data ?? []
    } else if (isEmailOrphan) {
      // Usuário removido do auth: client_id virou NULL mas client_email ainda existe
      const { data } = await supabase
        .from('appointments')
        .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_name_snapshot, service_price_snapshot')
        .is('client_id', null)
        .ilike('client_email', targetId)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })

      appointments = data ?? []
    } else if (isApptOrphan) {
      // Agendamento completamente anônimo — sem client_id, phone ou email
      const { data } = await supabase
        .from('appointments')
        .select('id, client_id, client_name, client_email, client_phone, date, start_time, status, service_name_snapshot, service_price_snapshot')
        .eq('id', targetId)

      appointments = data ?? []
    }

    if (appointments.length === 0 && !profile) {
      return { success: false, error: 'Cliente não encontrado.' }
    }

    const appointmentIds = appointments.map((appointment) => appointment.id)
    const [{ data: ratings }, paymentSummaryById] = await Promise.all([
      appointmentIds.length > 0
        ? supabase.from('client_ratings').select('appointment_id, score, note').in('appointment_id', appointmentIds)
        : Promise.resolve({ data: [] }),
      getAppointmentPaymentSummaryMap(appointmentIds),
    ])

    const ratingByAppointmentId = new Map((ratings ?? []).map((rating) => [rating.appointment_id, rating]))
    const now = new Date()

    const timeline = appointments.map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      start_time: appointment.start_time,
      status: getAppointmentOperationalStatus(appointment.status, appointment.date, appointment.start_time, now),
      service_name_snapshot: appointment.service_name_snapshot,
      service_price_snapshot: appointment.service_price_snapshot,
      payment_context: paymentSummaryById[appointment.id]?.paymentContext ?? null,
      rating_score: ratingByAppointmentId.get(appointment.id)?.score ?? null,
      rating_note: ratingByAppointmentId.get(appointment.id)?.note ?? null,
    }))

    const totalServices = timeline.filter((appointment) => appointment.status === 'concluido').length
    const totalSpent = timeline.reduce((total, appointment) => total + (appointment.status === 'concluido' ? appointment.service_price_snapshot ?? 0 : 0), 0)
    const completedAppointments = timeline.filter((appointment) => appointment.status === 'concluido')
    const upcomingAppointments = timeline.filter(
      (appointment) => (appointment.status === 'confirmado' || appointment.status === 'aguardando_pagamento') && !isAppointmentPast(appointment.date, appointment.start_time, now)
    )
    const scores = timeline.map((appointment) => appointment.rating_score).filter((score): score is number => typeof score === 'number')
    const nextAppointment = [...upcomingAppointments].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.start_time.localeCompare(b.start_time)
    })[0]

    const client: ClientDirectoryItem = {
      client_key: clientKey,
      client_id: profile?.id ?? null,
      name: profile?.display_name ?? appointments[0]?.client_name ?? profile?.email ?? appointments[0]?.client_email ?? 'Visitante',
      email: profile?.email ?? appointments[0]?.client_email ?? null,
      phone: profile?.phone ?? normalizePhoneLookup(appointments[0]?.client_phone) ?? appointments[0]?.client_phone ?? null,
      is_registered: Boolean(profile?.id),
      is_blocked: profile?.is_blocked ?? false,
      total_bookings: timeline.length,
      total_services: totalServices,
      total_spent: totalSpent,
      avg_rating: scores.length > 0
        ? Math.round((scores.reduce((acc, score) => acc + score, 0) / scores.length) * 10) / 10
        : null,
      last_service_date: completedAppointments[0]?.date ?? null,
      next_service_date: nextAppointment?.date ?? null,
      next_service_time: nextAppointment?.start_time ?? null,
      created_at: profile?.created_at ?? null,
    }

    return {
      success: true,
      data: {
        client,
        appointments: timeline,
      },
    }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Salvar configurações do Mercado Pago ───────────────────────────────────
export async function saveMercadoPagoConfig(data: {
  payment_mode: 'presencial' | 'online_obrigatorio'
  payment_expiry_minutes: number
  aceita_dinheiro: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    if (!Number.isFinite(data.payment_expiry_minutes) || data.payment_expiry_minutes < 1 || data.payment_expiry_minutes > MAX_PAYMENT_EXPIRY_MINUTES) {
      return { success: false, error: `Tempo de expiração deve ser entre 1 e ${MAX_PAYMENT_EXPIRY_MINUTES} minutos.` }
    }

    const normalizedExpiry = normalizePaymentExpiryMinutes(data.payment_expiry_minutes)

    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('business_config')
      .update({
        payment_mode: data.payment_mode,
        payment_expiry_minutes: normalizedExpiry,
        aceita_dinheiro: data.aceita_dinheiro,
      })
      .eq('id', 1)

    if (error) throw error

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function getPendingPaymentsCount(): Promise<{ count: number }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()
    const { count } = await adminClient
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_pagamento')
    return { count: count ?? 0 }
  } catch {
    return { count: 0 }
  }
}

export async function disconnectMercadoPago(): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('business_config')
      .update({ mp_access_token: null, mp_refresh_token: null, mp_public_key: null })
      .eq('id', 1)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
