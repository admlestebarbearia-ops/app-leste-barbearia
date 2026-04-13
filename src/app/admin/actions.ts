'use server'

import {
  validateServicePayload,
  validateBusinessConfigPatch,
  validateSpecialSchedulePayload,
  validateWorkingHoursRow,
} from '@/lib/admin/admin-validation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { MAX_PAYMENT_EXPIRY_MINUTES, normalizePaymentExpiryMinutes } from '@/lib/mercadopago/payment-policy'
import type { BusinessConfig, WorkingHours } from '@/lib/supabase/types'

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
    const { error } = await supabase
      .from('appointments')
      .update({ status, ...(status === 'cancelado' ? { cancelled_by_admin: true } : {}) })
      .eq('id', appointmentId)
    if (error) throw error
    revalidatePath('/admin')
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
    // admin_hidden_at oculta apenas do painel do admin.
    // O status fica 'cancelado' para o cliente saber que foi cancelado,
    // mas o agendamento NÃO desaparece do painel do cliente (deleted_at não é tocado).
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado', admin_hidden_at: new Date().toISOString() })
      .eq('id', appointmentId)
    if (error) throw error
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
  payment_method?: import('@/lib/supabase/types').PaymentMethod
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // RN: ao cancelar, devolve 1 unidade ao estoque (stock_quantity !== -1)
    if (status === 'cancelado') {
      const { data: reservation } = await supabase
        .from('product_reservations')
        .select('product_id, quantity, status')
        .eq('id', id)
        .single()

      if (reservation && reservation.status === 'reservado') {
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

    const { error } = await supabase
      .from('product_reservations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    // Ao marcar como retirado → cria entrada financeira automática
    if (status === 'retirado') {
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
        const cardRate =
          payment_method === 'debito'  ? (configData?.debit_rate_pct  ?? configData?.default_card_rate_pct ?? 0) :
          payment_method === 'credito' ? (configData?.credit_rate_pct ?? configData?.default_card_rate_pct ?? 0) :
          0
        const amount = res.product_price_snapshot * (res.quantity ?? 1)
        const netAmount = amount * (1 - cardRate / 100)
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('financial_entries').insert({
          type: 'receita',
          source: 'produto',
          amount,
          description: res.product_name_snapshot ?? 'Produto',
          payment_method: payment_method ?? null,
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

    if (reservation.status === 'reservado') {
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
  paymentMethod: import('@/lib/supabase/types').PaymentMethod,
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

    // Busca taxas por tipo de pagamento
    const { data: configData } = await supabase
      .from('business_config')
      .select('debit_rate_pct, credit_rate_pct')
      .single()
    const cardRate =
      paymentMethod === 'debito'  ? (configData?.debit_rate_pct  ?? 0) :
      paymentMethod === 'credito' ? (configData?.credit_rate_pct ?? 0) : 0

    const amount = appt.service_price_snapshot ?? 0
    const netAmount = amount * (1 - cardRate / 100)

    // Atualiza status do agendamento
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'concluido' })
      .eq('id', appointmentId)
    if (updateError) throw updateError

    // Cria entrada financeira automaticamente (apenas se tem valor registrado)
    if (amount > 0) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('financial_entries').insert({
        type: 'receita',
        source: 'agendamento',
        amount,
        description: appt.service_name_snapshot ?? 'Serviço',
        payment_method: paymentMethod,
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
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function estornarAgendamento(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()

    // Busca a entrada financeira original do agendamento
    const { data: entry, error: entryError } = await supabase
      .from('financial_entries')
      .select('*')
      .eq('source', 'agendamento')
      .eq('reference_id', appointmentId)
      .single()

    if (entryError || !entry) return { success: false, error: 'Entrada financeira não encontrada.' }

    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().split('T')[0]

    // Cria entrada de estorno (tipo despesa, valor negativo)
    const { error: insertError } = await supabase.from('financial_entries').insert({
      type: 'despesa',
      source: 'estorno',
      amount: entry.amount,
      description: `Estorno: ${entry.description}`,
      payment_method: entry.payment_method ?? null,
      card_rate_pct: 0,
      net_amount: -(entry.net_amount ?? entry.amount),
      reference_id: appointmentId,
      date: today,
      created_by: user?.id ?? null,
    })
    if (insertError) throw insertError

    // Reverte status do agendamento para confirmado
    const { error: revertError } = await supabase
      .from('appointments')
      .update({ status: 'confirmado' })
      .eq('id', appointmentId)
    if (revertError) throw revertError

    revalidatePath('/admin')
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

export async function disconnectMercadoPago(): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('business_config')
      .update({ mp_access_token: null, mp_refresh_token: null })
      .eq('id', 1)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
