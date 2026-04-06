'use server'

import {
  validateServicePayload,
  validateBusinessConfigPatch,
  validateSpecialSchedulePayload,
  validateWorkingHoursRow,
} from '@/lib/admin/admin-validation'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
      .update({ status })
      .eq('id', appointmentId)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Excluir agendamento (soft delete — apenas admin) ───────────────────────
export async function deleteAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado', deleted_at: new Date().toISOString() })
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
  status: 'reservado' | 'cancelado' | 'retirado'
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
      .select('status')
      .eq('id', id)
      .single()

    if (!reservation) return { success: false, error: 'Reserva não encontrada.' }
    if (reservation.status !== 'cancelado') {
      return { success: false, error: 'Só é possível excluir reservas canceladas.' }
    }

    const { error } = await supabase.from('product_reservations').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
