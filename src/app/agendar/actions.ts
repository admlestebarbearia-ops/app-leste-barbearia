'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import {
  buildBlockedDeviceLookup,
  getCreateAppointmentStateError,
  normalizeAppointmentWindows,
  shouldFallbackToLegacyAvailabilityQuery,
  shouldRetryLegacyAppointmentInsert,
} from '@/lib/booking/appointment-server-guards'
import { getCancellationPolicyError } from '@/lib/booking/cancellation-policy'
import {
  calculateAvailableSlots,
} from '@/lib/scheduling/availability-engine'
import { isAppointmentPast } from '@/lib/booking/appointment-visibility'
import {
  firePushToAdmins,
  firePushToUser,
} from '@/app/api/push/actions'
import {
  dedupeById,
  isAuthenticatedUser,
  normalizePhoneLookup,
  GUEST_BOOKING_PHONE_COOKIE,
} from '@/lib/auth/session-state'
import { revalidatePath } from 'next/cache'
import { format } from 'date-fns'
import type { WorkingHours, SpecialSchedule } from '@/lib/supabase/types'
import { isPaymentIntentExpired, shouldReuseMercadoPagoPayment } from '@/lib/mercadopago/payment-flow'
import { buildPaymentExpirationIso } from '@/lib/mercadopago/payment-policy'

function buildOwnershipFilter(userId: string | null, lookupPhones: string[]) {
  return [
    ...(userId ? [`client_id.eq.${userId}`] : []),
    ...lookupPhones.map((phone) => `client_phone.eq.${phone}`),
  ].join(',')
}

async function expirePendingAppointmentPayment(adminClient: ReturnType<typeof createAdminClient>, appointmentId: string) {
  const nowIso = new Date().toISOString()

  await adminClient
    .from('payment_intents')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')

  await adminClient
    .from('appointments')
    .update({ status: 'cancelado' })
    .eq('id', appointmentId)
    .eq('status', 'aguardando_pagamento')
}

async function getAppointmentLookupContext() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const { data: { user } } = await supabase.auth.getUser()
  const signedInWithGoogle = isAuthenticatedUser(user)
  const guestPhone = normalizePhoneLookup(cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value)

  let profilePhone: string | null = null
  if (signedInWithGoogle) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    profilePhone = normalizePhoneLookup(profile?.phone)
  }

  return {
    supabase,
    userId: user?.id ?? null,
    signedInWithGoogle,
    lookupPhones: [...new Set([guestPhone, profilePhone].filter((phone): phone is string => Boolean(phone)))],
  }
}

// ─── Calcular slots disponíveis ────────────────────────────────────────────
export async function getAvailableSlots(
  date: string,
  serviceId: string
): Promise<{ slots: string[]; error?: string }> {
  const supabase = await createClient()

  // Busca duração do serviço
  const { data: service } = await supabase
    .from('services')
    .select('duration_minutes, is_active')
    .eq('id', serviceId)
    .single()

  if (!service) return { slots: [], error: 'Servico nao encontrado.' }
  if (!service.is_active) return { slots: [], error: 'Servico indisponivel no momento.' }
  if (!Number.isFinite(service.duration_minutes) || service.duration_minutes <= 0) {
    return { slots: [], error: 'Servico indisponivel no momento.' }
  }

  // Busca configurações da barbearia (pausa + intervalo de slots)
  const { data: configData } = await supabase
    .from('business_config')
    .select('is_paused, slot_interval_minutes')
    .single()

  const isPaused = configData?.is_paused ?? false
  const slotInterval = configData?.slot_interval_minutes ?? 30

  const duration = service.duration_minutes

  // Verifica se há agenda especial para o dia
  const { data: special } = await supabase
    .from('special_schedules')
    .select('*')
    .eq('date', date)
    .single()

  const typedSpecial = special as SpecialSchedule | null

  // Se dia fechado por agenda especial
  if (typedSpecial?.is_closed) {
    return { slots: [], error: 'Barbearia fechada neste dia (data especial).' }
  }

  // Horários do dia da semana
  const dayOfWeek = new Date(date + 'T12:00:00').getDay()

  const { data: workingHours } = await supabase
    .from('working_hours')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .single()

  const typedWH = workingHours as WorkingHours | null

  const openTime = typedSpecial?.open_time ?? typedWH?.open_time
  const closeTime = typedSpecial?.close_time ?? typedWH?.close_time
  const isOpen = typedSpecial ? !typedSpecial.is_closed : (typedWH?.is_open ?? false)

  if (!isOpen) {
    return { slots: [], error: 'Barbearia não abre neste dia da semana.' }
  }

  if (!openTime || !closeTime) {
    return { slots: [], error: 'Horário de funcionamento não configurado para este dia. Por favor, contate a barbearia.' }
  }

  // Verifica se está pausado temporariamente HOJE e se o dia da pesquisa é hoje
  const isToday = format(new Date(), 'yyyy-MM-dd') === date
  if (isPaused && isToday) {
    return { slots: [], error: 'A barbearia está em pausa (horário de almoço). Tente novamente em instantes ou escolha outro dia.' }
  }

  const lunchStart = typedWH?.lunch_start ?? null
  const lunchEnd = typedWH?.lunch_end ?? null

  // Busca agendamentos que ocupam slot (confirmado ou aguardando pagamento MP)
  const { data: existingAppointmentsWithSnapshots, error: existingAppointmentsError } = await supabase
    .from('appointments')
    .select('start_time, status, deleted_at, service_duration_minutes_snapshot, services(duration_minutes)')
    .eq('date', date)
    .in('status', ['confirmado', 'aguardando_pagamento'])
    .is('deleted_at', null)

  let normalizedExistingAppointments = normalizeAppointmentWindows(
    existingAppointmentsWithSnapshots
  )

  if (existingAppointmentsError) {
    const shouldFallbackToLegacyQuery = shouldFallbackToLegacyAvailabilityQuery(existingAppointmentsError)

    if (!shouldFallbackToLegacyQuery) {
      return { slots: [], error: `Erro ao consultar disponibilidade: ${existingAppointmentsError.message}` }
    }

    const { data: legacyExistingAppointments, error: legacyExistingAppointmentsError } = await supabase
      .from('appointments')
      .select('start_time, services(duration_minutes)')
      .eq('date', date)
      .in('status', ['confirmado', 'aguardando_pagamento'])

    if (legacyExistingAppointmentsError) {
      return { slots: [], error: `Erro ao consultar disponibilidade: ${legacyExistingAppointmentsError.message}` }
    }

    normalizedExistingAppointments = normalizeAppointmentWindows(
      legacyExistingAppointments
    )
  }

  // BRT = UTC-3, fixo (Brasil não usa horário de verão desde 2019).
  // Os horários armazenados no DB são horários de relógio BRT. O servidor Vercel
  // roda em UTC, então new Date() retorna UTC. Subtraímos 3h para que a comparação
  // "passou essa hora hoje?" ocorra no mesmo referencial dos horários armazenados.
  const nowInBRT = new Date(Date.now() - 3 * 60 * 60 * 1_000)

  return calculateAvailableSlots({
    date,
    serviceDurationMinutes: duration,
    slotIntervalMinutes: slotInterval,
    isPaused,
    workingHours: typedWH,
    specialSchedule: typedSpecial,
    existingAppointments: normalizedExistingAppointments,
    now: nowInBRT,
  })
}

// ─── Criar agendamento ──────────────────────────────────────────────────────
export async function createAppointment(data: {
  serviceId: string
  barberId: string
  date: string
  startTime: string
  clientName?: string
  clientPhone?: string
  loggedUserPhone?: string
  payCash?: boolean
}): Promise<{ success: boolean; appointmentId?: string; error?: string; preferenceId?: string; amount?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedInWithGoogle = isAuthenticatedUser(user)
  const effectivePhone = normalizePhoneLookup(data.loggedUserPhone ?? data.clientPhone)

  // Busca configs de agenda (limite diário + controles) em uma única query
  const { data: agendaConfig } = await supabase
    .from('business_config')
    .select('max_appointments_per_day, block_multi_day_booking, calendar_max_days_ahead, calendar_open_until_date, payment_mode, aceita_dinheiro, mp_access_token, payment_expiry_minutes')
    .single()
  const dailyLimit = agendaConfig?.max_appointments_per_day ?? 3

  if (signedInWithGoogle) {
    const { count } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('date', data.date)
      .in('status', ['confirmado', 'aguardando_pagamento'])

    if (count !== null && count >= dailyLimit) {
      return { success: false, error: `Limite de ${dailyLimit} agendamento${dailyLimit !== 1 ? 's' : ''} por dia atingido.` }
    }

    // Verifica se cliente está bloqueado
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked')
      .eq('id', user.id)
      .single()

    if (profile?.is_blocked) {
      return { success: false, error: 'Seu acesso esta suspenso. Entre em contato com a barbearia.' }
    }
  } else if (effectivePhone) {
    const { count } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('client_phone', effectivePhone)
      .eq('date', data.date)
      .in('status', ['confirmado', 'aguardando_pagamento'])

    if (count !== null && count >= dailyLimit) {
      return { success: false, error: `Limite de ${dailyLimit} agendamento${dailyLimit !== 1 ? 's' : ''} por dia atingido.` }
    }
  }

  // ─── Regras de agenda (Fase 2) ────────────────────────────────────────────

  if (agendaConfig) {
    // 2. Bloquear agendamento multi-dia (cliente com confirmado em outra data)
    if (agendaConfig.block_multi_day_booking && signedInWithGoogle) {
      const { data: otherDayAppt } = await supabase
        .from('appointments')
        .select('id')
        .eq('client_id', user.id)
        .in('status', ['confirmado', 'aguardando_pagamento'])
        .neq('date', data.date)
        .limit(1)

      if (otherDayAppt && otherDayAppt.length > 0) {
        return { success: false, error: 'Você já possui um agendamento confirmado em outro dia. Cancele primeiro para agendar em outra data.' }
      }
    }

    // 3. Validar data dentro da janela permitida
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const requestedDate = new Date(data.date + 'T00:00:00')

    if (agendaConfig.calendar_open_until_date) {
      const limitDate = new Date(agendaConfig.calendar_open_until_date + 'T00:00:00')
      if (requestedDate > limitDate) {
        return { success: false, error: 'Esta data está fora do período de agendamento disponível.' }
      }
    } else {
      const maxDate = new Date(today)
      maxDate.setDate(maxDate.getDate() + (agendaConfig.calendar_max_days_ahead ?? 30))
      if (requestedDate > maxDate) {
        return { success: false, error: 'Esta data está fora do período de agendamento disponível.' }
      }
    }
  }

  // Verifica na tabela blocked_devices por session_id ou telefone
  const blockedLookup = buildBlockedDeviceLookup({
    userId: signedInWithGoogle ? user.id : null,
    phone: effectivePhone,
  })

  let blockedMatch: { id: string } | null = null
  if (blockedLookup.kind !== 'none') {
    const blockedQuery = supabase
      .from('blocked_devices')
      .select('id')
      .limit(1)

    if (blockedLookup.kind === 'or') {
      blockedQuery.or(blockedLookup.filter)
    } else {
      blockedQuery.eq(blockedLookup.field, blockedLookup.value)
    }

    const blockedResult = await blockedQuery.maybeSingle()
    blockedMatch = blockedResult.data
  }

  if (blockedMatch) {
    return { success: false, error: 'Dispositivo bloqueado temporariamente por spam. Tente mais tarde.' }
  }

  const { data: serviceSnapshot, error: serviceSnapshotError } = await supabase
    .from('services')
    .select('name, price, duration_minutes, is_active')
    .eq('id', data.serviceId)
    .single()

  if (serviceSnapshotError || !serviceSnapshot) {
    return { success: false, error: 'Servico nao encontrado ou indisponivel.' }
  }

  if (!serviceSnapshot.is_active) {
    return { success: false, error: 'Servico indisponivel. Foi desativado recentemente.' }
  }

  if (!Number.isFinite(serviceSnapshot.duration_minutes) || serviceSnapshot.duration_minutes <= 0) {
    return { success: false, error: 'Servico indisponivel no momento. Atualize a pagina e tente novamente.' }
  }

  const { data: barberSnapshot, error: barberSnapshotError } = await supabase
    .from('barbers')
    .select('is_active')
    .eq('id', data.barberId)
    .single()

  if (barberSnapshotError || !barberSnapshot?.is_active) {
    return { success: false, error: 'Barbeiro indisponivel no momento. Atualize a pagina e tente novamente.' }
  }

  // Verifica disponibilidade do slot (dupla checagem no servidor)
  const { slots } = await getAvailableSlots(data.date, data.serviceId)
  const requested = data.startTime.slice(0, 5)
  const createAppointmentStateError = getCreateAppointmentStateError({
    serviceIsActive: serviceSnapshot.is_active,
    barberIsActive: !!barberSnapshot?.is_active,
    availableSlots: slots,
    requestedTime: requested,
  })
  if (createAppointmentStateError) {
    return { success: false, error: createAppointmentStateError }
  }

  // ─── Determinar status inicial baseado no modo de pagamento ──────────────
  const paymentMode = agendaConfig?.payment_mode ?? 'presencial'
  const mpToken = agendaConfig?.mp_access_token ?? null
  const aceitaDinheiroConfig = agendaConfig?.aceita_dinheiro ?? true

  // Guarda: se o admin configurou pagamento online obrigatório mas não vinculou
  // o Mercado Pago, o agendamento NÃO deve ser confirmado silenciosamente.
  // O cliente deve receber uma mensagem clara em vez de passar sem pagar.
  if (paymentMode === 'online_obrigatorio' && !mpToken && !(data.payCash && aceitaDinheiroConfig)) {
    return { success: false, error: 'Sistema de pagamento online indisponível no momento. Entre em contato com a barbearia.' }
  }

  // Cliente escolheu pagar em dinheiro E a barbearia permite → não exige MP
  const isOnlinePayment = paymentMode === 'online_obrigatorio' && !!mpToken && !(data.payCash && aceitaDinheiroConfig)
  const appointmentStatus = isOnlinePayment ? 'aguardando_pagamento' as const : 'confirmado' as const

  const appointmentData = signedInWithGoogle
    ? {
        client_id: user.id,
        client_name: (user.user_metadata?.full_name as string | undefined) ?? data.clientName ?? user.email ?? null,
        client_email: user.email ?? null,
        client_phone: effectivePhone,
        barber_id: data.barberId,
        service_id: data.serviceId,
        service_name_snapshot: serviceSnapshot.name,
        service_price_snapshot: serviceSnapshot.price,
        service_duration_minutes_snapshot: serviceSnapshot.duration_minutes,
        date: data.date,
        start_time: data.startTime,
        status: appointmentStatus,
      }
    : {
        client_name: data.clientName,
        client_email: null,
        client_phone: effectivePhone,
        barber_id: data.barberId,
        service_id: data.serviceId,
        service_name_snapshot: serviceSnapshot.name,
        service_price_snapshot: serviceSnapshot.price,
        service_duration_minutes_snapshot: serviceSnapshot.duration_minutes,
        date: data.date,
        start_time: data.startTime,
        status: appointmentStatus,
      }

  let { data: appointment, error } = await supabase
    .from('appointments')
    .insert(appointmentData)
    .select('id')
    .single()

  if (shouldRetryLegacyAppointmentInsert(error)) {
    const legacyAppointmentData = {
      ...appointmentData,
      service_name_snapshot: undefined,
      service_price_snapshot: undefined,
      service_duration_minutes_snapshot: undefined,
    }

    const legacyInsert = await supabase
      .from('appointments')
      .insert(legacyAppointmentData)
      .select('id')
      .single()

    appointment = legacyInsert.data
    error = legacyInsert.error
  }

  if (error) {
    console.error('Erro ao criar agendamento:', error)
    return { success: false, error: `Erro ao confirmar agendamento: ${error.message}` }
  }

  if (!appointment?.id) {
    return { success: false, error: 'Erro ao confirmar agendamento: resposta invalida do banco.' }
  }

  if (!signedInWithGoogle && effectivePhone) {
    const cookieStore = await cookies()
    cookieStore.set(GUEST_BOOKING_PHONE_COOKIE, effectivePhone, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 120,
    })
  }

  // ─── Bifurcar por payment_mode ────────────────────────────────────────────
  if (isOnlinePayment) {
    const adminForMp = createAdminClient()
    await adminForMp.from('payment_intents').insert({
      appointment_id: appointment.id,
      mp_preference_id: null,
      status: 'pending',
      amount: Number(serviceSnapshot.price),
      expires_at: buildPaymentExpirationIso(new Date(), agendaConfig?.payment_expiry_minutes),
    })

    // Notifica admins: novo agendamento aguardando pagamento
    const clientDisplayName = signedInWithGoogle
      ? ((user.user_metadata?.full_name as string | undefined) ?? data.clientName ?? user.email ?? 'Cliente')
      : (data.clientName ?? 'Visitante')
    void firePushToAdmins({
      title: '📅 Novo agendamento (aguardando pagamento)',
      body: `${clientDisplayName} — ${serviceSnapshot.name} em ${data.date.split('-').reverse().join('/')} às ${data.startTime.slice(0, 5)}`,
      url: '/admin',
      tag: `admin-novo-agend-${appointment.id}`,
    })

    revalidatePath('/agendar')
    return { success: true, appointmentId: appointment.id, amount: Number(serviceSnapshot.price) }
  }

  // Notifica cliente: agendamento confirmado (apenas usuários logados têm push subscription)
  if (signedInWithGoogle) {
    void firePushToUser(user.id, {
      title: '✅ Agendamento confirmado!',
      body: `${serviceSnapshot.name} em ${data.date.split('-').reverse().join('/')} às ${data.startTime.slice(0, 5)}.`,
      url: '/reservas',
      tag: `cliente-confirma-${appointment.id}`,
    })
  }

  // Notifica admins: novo agendamento (presencial/dinheiro)
  const clientName = signedInWithGoogle
    ? ((user.user_metadata?.full_name as string | undefined) ?? data.clientName ?? user.email ?? 'Cliente')
    : (data.clientName ?? 'Visitante')
  void firePushToAdmins({
    title: '📅 Novo agendamento!',
    body: `${clientName} — ${serviceSnapshot.name} em ${data.date.split('-').reverse().join('/')} às ${data.startTime.slice(0, 5)}`,
    url: '/admin',
    tag: `admin-novo-agend-${appointment.id}`,
  })

  revalidatePath('/agendar')
  return { success: true, appointmentId: appointment.id }
}

// ─── Cancelar agendamento (cliente) ────────────────────────────────────────
export async function cancelMyAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) return { success: false, error: 'Identificacao da reserva nao encontrada neste aparelho.' }

  // Busca o agendamento e valida a janela de cancelamento
  const { data: appt } = await supabase
    .from('appointments')
    .select('date, start_time, status, client_name, service_name_snapshot')
    .eq('id', appointmentId)
    .or(ownershipFilter)
    .single()

  if (!appt) return { success: false, error: 'Agendamento nao encontrado.' }
  if (appt.status !== 'confirmado') return { success: false, error: 'Agendamento ja cancelado.' }

  const { data: config } = await supabase
    .from('business_config')
    .select('cancellation_window_minutes')
    .single()

  const windowMinutes = config?.cancellation_window_minutes ?? 120
  // Bug fix: Vercel roda em UTC. Horários armazenados são São Paulo (UTC-3).
  // parseISO("09:00") no servidor = 09:00 UTC (deveria ser 12:00 UTC).
  // Ajustamos 'now' -3h para o mesmo espaço temporal naive dos horários armazenados.
  const SP_OFFSET_MS = 3 * 60 * 60 * 1000
  const cancellationError = getCancellationPolicyError({
    status: appt.status,
    appointmentDate: appt.date,
    appointmentStartTime: appt.start_time,
    cancellationWindowMinutes: windowMinutes,
    now: new Date(Date.now() - SP_OFFSET_MS),
  })

  if (cancellationError) {
    return {
      success: false,
      error: cancellationError,
    }
  }

  // Usa adminClient para o UPDATE porque a RLS exige auth.uid() = client_id,
  // o que bloquearia agendamentos de visitante (client_id = NULL).
  // A posse já foi validada pela query acima com o client normal.
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('appointments')
    .update({ status: 'cancelado' })
    .eq('id', appointmentId)

  if (error) return { success: false, error: 'Erro ao cancelar. Tente novamente.' }

  // Notifica admins: cliente cancelou
  void firePushToAdmins({
    title: '❌ Agendamento cancelado pelo cliente',
    body: `${appt.client_name ?? 'Cliente'} — ${appt.service_name_snapshot ?? 'Serviço'} em ${appt.date.split('-').reverse().join('/')} às ${appt.start_time.slice(0, 5)}`,
    url: '/admin',
    tag: `admin-cancel-cliente-${appointmentId}`,
  })

  revalidatePath('/agendar')
  revalidatePath('/reservas')
  revalidatePath('/perfil')
  revalidatePath('/admin')
  return { success: true }
}

// ─── Buscar meus agendamentos futuros ──────────────────────────────────────
export async function getMyAppointments() {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) return { appointments: [] }

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('appointments')
    .select('*, services(name, price, duration_minutes)')
    .in('status', ['confirmado', 'aguardando_pagamento'])
    .gte('date', today)
    .or(ownershipFilter)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  return {
    appointments: dedupeById(data ?? []).filter(
      (appointment) => !isAppointmentPast(appointment.date, appointment.start_time)
    ),
  }
}

export async function getPendingPaymentDetails(appointmentId: string): Promise<{
  appointment?: {
    id: string
    amount: number
    serviceName: string
    serviceDate: string
    serviceTime: string
    existingPaymentId?: string
  }
  error?: string
}> {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) return { error: 'Identificacao da reserva nao encontrada neste aparelho.' }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, date, start_time, status, service_name_snapshot, service_price_snapshot, services(name, price)')
    .eq('id', appointmentId)
    .eq('status', 'aguardando_pagamento')
    .or(ownershipFilter)
    .single()

  if (!appt) return { error: 'Pagamento pendente nao encontrado.' }

  const service = (Array.isArray(appt.services) ? appt.services[0] : appt.services) as { name?: string; price?: number } | null
  const amount = Number(appt.service_price_snapshot ?? service?.price ?? 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valor do pagamento indisponivel.' }
  }

  const adminClient = createAdminClient()
  const { data: paymentIntent } = await adminClient
    .from('payment_intents')
    .select('status, mp_payment_id, expires_at')
    .eq('appointment_id', appointmentId)
    .single()

  if (!paymentIntent) {
    return { error: 'Controle de pagamento nao encontrado.' }
  }

  if (paymentIntent.status === 'expired' || isPaymentIntentExpired(paymentIntent.expires_at)) {
    await expirePendingAppointmentPayment(adminClient, appointmentId)

    return { error: 'Prazo de pagamento expirado. Faca um novo agendamento.' }
  }

  const existingPaymentId = paymentIntent.mp_payment_id && shouldReuseMercadoPagoPayment(paymentIntent.status)
    ? paymentIntent.mp_payment_id
    : undefined

  return {
    appointment: {
      id: appt.id,
      amount,
      serviceName: appt.service_name_snapshot ?? service?.name ?? 'Serviço',
      serviceDate: appt.date,
      serviceTime: appt.start_time.slice(0, 5),
      existingPaymentId,
    },
  }
}

export async function getPendingPaymentStatus(appointmentId: string): Promise<{
  appointmentStatus?: string
  paymentIntentStatus?: string | null
  paymentId?: string | null
  error?: string
}> {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) {
    return { error: 'Identificacao da reserva nao encontrada neste aparelho.' }
  }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', appointmentId)
    .or(ownershipFilter)
    .single()

  if (!appt) {
    return { error: 'Agendamento nao encontrado.' }
  }

  const adminClient = createAdminClient()
  const { data: paymentIntent } = await adminClient
    .from('payment_intents')
    .select('status, mp_payment_id, expires_at')
    .eq('appointment_id', appointmentId)
    .single()

  if (!paymentIntent) {
    return { appointmentStatus: appt.status, paymentIntentStatus: null, paymentId: null }
  }

  let resolvedPaymentIntentStatus = paymentIntent.status
  if (paymentIntent.status === 'expired') {
    await expirePendingAppointmentPayment(adminClient, appointmentId)
  } else if (isPaymentIntentExpired(paymentIntent.expires_at) && paymentIntent.status === 'pending') {
    await expirePendingAppointmentPayment(adminClient, appointmentId)

    resolvedPaymentIntentStatus = 'expired'
  }

  return {
    appointmentStatus: appt.status,
    paymentIntentStatus: resolvedPaymentIntentStatus,
    paymentId: paymentIntent.mp_payment_id,
  }
}

// ─── Salvar WhatsApp do usuário no perfil ──────────────────────────────────
export async function saveUserPhone(phone: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Não autenticado.' }

  const { error } = await supabase
    .from('profiles')
    .update({ phone })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Salvar perfil do usuário (nome e/ou telefone) ─────────────────────────
export async function saveUserProfile(data: {
  displayName?: string
  phone?: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Não autenticado.' }

  const updates: Record<string, string | null> = {}
  if (data.displayName !== undefined) updates.display_name = data.displayName.trim() || null
  if (data.phone !== undefined) updates.phone = data.phone

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/perfil')
  return { success: true }
}

// ─── Buscar produtos ativos para vitrine pós-agendamento ───────────────────
export async function getActiveProducts(appointmentId: string): Promise<{
  products: import('@/lib/supabase/types').Product[]
  error?: string
}> {
  // Usa adminClient: visitantes (sem sessão) não podem ler via RLS normal
  const adminClient = createAdminClient()

  // Valida que a configuração permite produtos
  const { data: config } = await adminClient
    .from('business_config')
    .select('enable_products')
    .single()

  if (!config?.enable_products) return { products: [] }

  // Valida que o agendamento existe
  const { data: appt } = await adminClient
    .from('appointments')
    .select('id')
    .eq('id', appointmentId)
    .eq('status', 'confirmado')
    .single()

  if (!appt) return { products: [], error: 'Agendamento nao encontrado.' }

  const { data, error } = await adminClient
    .from('products')
    .select('*')
    .eq('is_active', true)
    .eq('reserve_enabled', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return { products: [], error: error.message }

  // Filtra produtos com estoque disponivel (stock_quantity -1 = ilimitado)
  const available = (data ?? []).filter(
    (p) => p.stock_quantity === -1 || p.stock_quantity > 0
  )

  return { products: available }
}

// ─── Criar reserva de produto (pós-agendamento) ────────────────────────────
export async function createProductReservation(data: {
  productId: string
  appointmentId: string
  clientPhone?: string
}): Promise<{ success: boolean; reservationId?: string; error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedInWithGoogle = isAuthenticatedUser(user)
  const cookieStore = await cookies()
  const guestPhone = normalizePhoneLookup(
    data.clientPhone ?? cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value
  )

  // RN: deve haver identidade (login ou telefone)
  if (!signedInWithGoogle && !guestPhone) {
    return { success: false, error: 'Identidade nao verificada. Informe seu telefone.' }
  }

  // RN: valida que o agendamento pertence ao solicitante
  const ownershipFilter = buildOwnershipFilter(
    signedInWithGoogle ? user.id : null,
    guestPhone ? [guestPhone] : []
  )
  if (!ownershipFilter) return { success: false, error: 'Acesso negado.' }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', data.appointmentId)
    .or(ownershipFilter)
    .single()

  if (!appt) return { success: false, error: 'Agendamento nao encontrado.' }
  if (appt.status !== 'confirmado') return { success: false, error: 'Agendamento nao esta confirmado.' }

  // RN: busca produto e valida disponibilidade (usa admin client para bypass RLS de leitura)
  const { data: product } = await adminClient
    .from('products')
    .select('id, name, price, cover_image_url, stock_quantity, is_active, reserve_enabled')
    .eq('id', data.productId)
    .single()

  if (!product) return { success: false, error: 'Produto nao encontrado.' }
  if (!product.is_active) return { success: false, error: 'Produto indisponivel no momento.' }
  if (!product.reserve_enabled) return { success: false, error: 'Reserva nao disponivel para este produto.' }

  // RN: verifica estoque em tempo real (evita race condition)
  if (product.stock_quantity >= 0) {
    const { count: reservedCount } = await adminClient
      .from('product_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', data.productId)
      .eq('status', 'reservado')

    if ((reservedCount ?? 0) >= product.stock_quantity) {
      return { success: false, error: 'Produto esgotado. Estoque indisponivel.' }
    }
  }

  // RN: nao permite reserva duplicada do mesmo produto no mesmo agendamento
  const { count: existingCount } = await adminClient
    .from('product_reservations')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', data.productId)
    .eq('appointment_id', data.appointmentId)
    .eq('status', 'reservado')

  if ((existingCount ?? 0) > 0) {
    return { success: false, error: 'Voce ja reservou este produto para este agendamento.' }
  }

  // Insere a reserva
  const reservationPayload = {
    product_id: data.productId,
    appointment_id: data.appointmentId,
    client_id: signedInWithGoogle ? user.id : null,
    client_phone: guestPhone,
    quantity: 1,
    status: 'reservado' as const,
    product_name_snapshot: product.name,
    product_price_snapshot: product.price,
    product_image_snapshot: product.cover_image_url,
  }

  const { data: reservation, error } = await adminClient
    .from('product_reservations')
    .insert(reservationPayload)
    .select('id')
    .single()

  if (error || !reservation) {
    return { success: false, error: 'Erro ao confirmar reserva do produto. Tente novamente.' }
  }

  // Decrementa estoque se finito
  if (product.stock_quantity >= 0) {
    await adminClient
      .from('products')
      .update({ stock_quantity: product.stock_quantity - 1 })
      .eq('id', data.productId)
  }

  revalidatePath('/reservas')
  return { success: true, reservationId: reservation.id }
}

// ─── Cancelar agendamento aguardando pagamento ──────────────────────────────
export async function cancelPendingPayment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) return { success: false, error: 'Identificacao nao encontrada.' }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', appointmentId)
    .eq('status', 'aguardando_pagamento')
    .or(ownershipFilter)
    .single()

  if (!appt) return { success: false, error: 'Agendamento nao encontrado.' }

  const adminClient = createAdminClient()
  await adminClient
    .from('appointments')
    .update({ status: 'cancelado' })
    .eq('id', appointmentId)

  await adminClient
    .from('payment_intents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')

  revalidatePath('/agendar')
  revalidatePath('/reservas')
  revalidatePath('/perfil')
  return { success: true }
}

// ─── Dispensar alerta de cancelamento pelo admin ───────────────────────────
// Oculta o card de aviso da página "Minhas Reservas" usando o soft-delete
// (deleted_at) — o agendamento já está cancelado, não afeta disponibilidade.
export async function dismissCancelledAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, userId, lookupPhones } = await getAppointmentLookupContext()
  const ownershipFilter = buildOwnershipFilter(userId, lookupPhones)

  if (!ownershipFilter) return { success: false, error: 'Identificacao nao encontrada.' }

  // Valida propriedade antes de usar admin client
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', appointmentId)
    .eq('status', 'cancelado')
    .or(ownershipFilter)
    .single()

  if (!appt) return { success: false, error: 'Agendamento nao encontrado.' }

  const adminClient = createAdminClient()
  await adminClient
    .from('appointments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', appointmentId)

  revalidatePath('/reservas')
  return { success: true }
}
