'use server'

import { createClient } from '@/lib/supabase/server'
import {
  calculateAvailableSlots,
  type ExistingAppointmentWindow,
} from '@/lib/scheduling/availability-engine'
import { revalidatePath } from 'next/cache'
import { format, addMinutes, isAfter, parseISO } from 'date-fns'
import type { WorkingHours, SpecialSchedule } from '@/lib/supabase/types'

type AppointmentServiceDurationRelation =
  | { duration_minutes?: number | null }
  | Array<{ duration_minutes?: number | null }>
  | null

type AppointmentAvailabilityRow = {
  start_time: string
  services: AppointmentServiceDurationRelation
  service_duration_minutes_snapshot?: number | null
  status?: string | null
  deleted_at?: string | null
}

function getRelatedServiceDuration(services: AppointmentServiceDurationRelation) {
  if (Array.isArray(services)) {
    return services[0]?.duration_minutes ?? null
  }

  return services?.duration_minutes ?? null
}

function normalizeAppointmentWindows(
  appointments: AppointmentAvailabilityRow[] | null | undefined
): ExistingAppointmentWindow[] {
  return (appointments ?? []).map((appointment) => ({
    start_time: appointment.start_time,
    duration_minutes:
      appointment.service_duration_minutes_snapshot ??
      getRelatedServiceDuration(appointment.services) ??
      30,
    status: appointment.status ?? 'confirmado',
    deleted_at: appointment.deleted_at ?? null,
  }))
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
    .select('duration_minutes')
    .eq('id', serviceId)
    .single()

  if (!service) return { slots: [], error: 'Servico nao encontrado.' }

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

  // Busca agendamentos confirmados do dia para cruzamento
  const { data: existingAppointmentsWithSnapshots, error: existingAppointmentsError } = await supabase
    .from('appointments')
    .select('start_time, status, deleted_at, service_duration_minutes_snapshot, services(duration_minutes)')
    .eq('date', date)
    .eq('status', 'confirmado')
    .is('deleted_at', null)

  let normalizedExistingAppointments = normalizeAppointmentWindows(
    existingAppointmentsWithSnapshots as AppointmentAvailabilityRow[] | null | undefined
  )

  if (existingAppointmentsError) {
    const shouldFallbackToLegacyQuery =
      existingAppointmentsError.code === 'PGRST204' ||
      existingAppointmentsError.message.includes('service_duration_minutes_snapshot') ||
      existingAppointmentsError.message.includes('deleted_at')

    if (!shouldFallbackToLegacyQuery) {
      return { slots: [], error: `Erro ao consultar disponibilidade: ${existingAppointmentsError.message}` }
    }

    const { data: legacyExistingAppointments, error: legacyExistingAppointmentsError } = await supabase
      .from('appointments')
      .select('start_time, services(duration_minutes)')
      .eq('date', date)
      .eq('status', 'confirmado')

    if (legacyExistingAppointmentsError) {
      return { slots: [], error: `Erro ao consultar disponibilidade: ${legacyExistingAppointmentsError.message}` }
    }

    normalizedExistingAppointments = normalizeAppointmentWindows(
      legacyExistingAppointments as AppointmentAvailabilityRow[] | null | undefined
    )
  }

  return calculateAvailableSlots({
    date,
    serviceDurationMinutes: duration,
    slotIntervalMinutes: slotInterval,
    isPaused,
    workingHours: typedWH,
    specialSchedule: typedSpecial,
    existingAppointments: normalizedExistingAppointments,
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
}): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Rate limiting: max 3 agendamentos confirmados por user_id por dia
  if (user) {
    const { count } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('date', data.date)
      .eq('status', 'confirmado')

    if (count !== null && count >= 3) {
      return { success: false, error: 'Limite de 3 agendamentos por dia atingido.' }
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
  }

  // Verifica na tabela blocked_devices por session_id ou telefone
  const checkPhone = data.clientPhone ? data.clientPhone.replace(/\D/g, '') : null;
  const blockedQuery = supabase
    .from('blocked_devices')
    .select('id')
    .limit(1);

  if (user && checkPhone) {
    blockedQuery.or(`session_id.eq.${user.id},phone.eq.${checkPhone}`);
  } else if (user) {
    blockedQuery.eq('session_id', user.id);
  } else if (checkPhone) {
    // Modo anônimo forçado com telefone apenas (tecnicamente não acontece se signInAnonymously foi chamado)
    blockedQuery.eq('phone', checkPhone);
  }

  const { data: blockedMatch } = await blockedQuery.maybeSingle();
  if (blockedMatch) {
    return { success: false, error: 'Dispositivo bloqueado temporariamente por spam. Tente mais tarde.' }
  }

  const { data: serviceSnapshot, error: serviceSnapshotError } = await supabase
    .from('services')
    .select('name, price, duration_minutes')
    .eq('id', data.serviceId)
    .single()

  if (serviceSnapshotError || !serviceSnapshot) {
    return { success: false, error: 'Servico nao encontrado ou indisponivel.' }
  }

  // Verifica disponibilidade do slot (dupla checagem no servidor)
  const { slots } = await getAvailableSlots(data.date, data.serviceId)
  const requested = data.startTime.slice(0, 5)
  if (!slots.includes(requested)) {
    return { success: false, error: 'Horario nao disponivel. Por favor, escolha outro horario.' }
  }

  const appointmentData = user
    ? {
        client_id: user.id,
        client_name: (user.user_metadata?.full_name as string | undefined) ?? data.clientName ?? user.email ?? null,
        client_email: user.email ?? null,
        client_phone: data.loggedUserPhone ?? data.clientPhone ?? null,
        barber_id: data.barberId,
        service_id: data.serviceId,
        service_name_snapshot: serviceSnapshot.name,
        service_price_snapshot: serviceSnapshot.price,
        service_duration_minutes_snapshot: serviceSnapshot.duration_minutes,
        date: data.date,
        start_time: data.startTime,
        status: 'confirmado' as const,
      }
    : {
        client_name: data.clientName,
        client_email: null,
        client_phone: data.clientPhone,
        barber_id: data.barberId,
        service_id: data.serviceId,
        service_name_snapshot: serviceSnapshot.name,
        service_price_snapshot: serviceSnapshot.price,
        service_duration_minutes_snapshot: serviceSnapshot.duration_minutes,
        date: data.date,
        start_time: data.startTime,
        status: 'confirmado' as const,
      }

  let { data: appointment, error } = await supabase
    .from('appointments')
    .insert(appointmentData)
    .select('id')
    .single()

  if (
    error &&
    (
      error.code === 'PGRST204' ||
      error.message.includes('service_name_snapshot') ||
      error.message.includes('service_price_snapshot') ||
      error.message.includes('service_duration_minutes_snapshot')
    )
  ) {
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

  revalidatePath('/agendar')
  return { success: true, appointmentId: appointment.id }
}

// ─── Cancelar agendamento (cliente) ────────────────────────────────────────
export async function cancelMyAppointment(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Nao autenticado.' }

  // Busca o agendamento e valida a janela de cancelamento
  const { data: appt } = await supabase
    .from('appointments')
    .select('date, start_time, status')
    .eq('id', appointmentId)
    .eq('client_id', user.id)
    .single()

  if (!appt) return { success: false, error: 'Agendamento nao encontrado.' }
  if (appt.status !== 'confirmado') return { success: false, error: 'Agendamento ja cancelado.' }

  const { data: config } = await supabase
    .from('business_config')
    .select('cancellation_window_minutes')
    .single()

  const windowMinutes = config?.cancellation_window_minutes ?? 120
  const apptDateTime = parseISO(`${appt.date}T${appt.start_time}`)
  const cancelDeadline = addMinutes(apptDateTime, -windowMinutes)

  if (isAfter(new Date(), cancelDeadline)) {
    return {
      success: false,
      error: `Cancelamento nao permitido com menos de ${windowMinutes} minuto(s) de antecedencia.`,
    }
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelado' })
    .eq('id', appointmentId)
    .eq('client_id', user.id)

  if (error) return { success: false, error: 'Erro ao cancelar. Tente novamente.' }

  revalidatePath('/agendar')
  return { success: true }
}

// ─── Buscar meus agendamentos futuros ──────────────────────────────────────
export async function getMyAppointments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { appointments: [] }

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('appointments')
    .select('*, services(name, price, duration_minutes)')
    .eq('client_id', user.id)
    .eq('status', 'confirmado')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  return { appointments: data ?? [] }
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
