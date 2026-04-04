'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { format, addMinutes, parse, isAfter, isBefore, parseISO } from 'date-fns'
import type { WorkingHours, SpecialSchedule } from '@/lib/supabase/types'

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
  const { data: existingAppointments } = await supabase
    .from('appointments')
    .select('start_time, services(duration_minutes)')
    .eq('date', date)
    .eq('status', 'confirmado')

  // Gera todos os slots possíveis
  const slots: string[] = []
  const baseDate = date + 'T'

  let current = parse(openTime, 'HH:mm:ss', new Date(date + 'T00:00:00'))
  const end = parse(closeTime, 'HH:mm:ss', new Date(date + 'T00:00:00'))
  const now = new Date()

  while (true) {
    const slotEnd = addMinutes(current, duration)

    // Não ultrapassa o horário de fechamento
    if (isAfter(slotEnd, end) || slotEnd.getTime() === end.getTime()) {
      // Só não ultrapassa se for exatamente no limite
      if (isAfter(slotEnd, end)) break
    }

    const slotStr = format(current, 'HH:mm')
    const slotDateTime = parseISO(`${date}T${format(current, 'HH:mm:ss')}`)

    // Não exibe slots no passado
    if (isBefore(slotDateTime, now)) {
      current = addMinutes(current, slotInterval)
      continue
    }

    // Verifica conflito com horário de almoço
    let lunchConflict = false
    if (lunchStart && lunchEnd) {
      const lunchStartTime = parse(lunchStart, 'HH:mm:ss', new Date(date + 'T00:00:00'))
      const lunchEndTime = parse(lunchEnd, 'HH:mm:ss', new Date(date + 'T00:00:00'))
      // Conflito se o slot começa antes do fim do almoço e termina depois do início
      if (isBefore(current, lunchEndTime) && isAfter(slotEnd, lunchStartTime)) {
        lunchConflict = true
      }
    }

    if (!lunchConflict) {
      // Verifica conflito com agendamentos existentes
      let hasConflict = false
      for (const appt of existingAppointments ?? []) {
        const apptStart = parse(appt.start_time, 'HH:mm:ss', new Date(date + 'T00:00:00'))
        const apptDuration = (appt.services as unknown as { duration_minutes?: number } | null)?.duration_minutes ?? 30
        const apptEnd = addMinutes(apptStart, apptDuration)

        if (isBefore(current, apptEnd) && isAfter(slotEnd, apptStart)) {
          hasConflict = true
          break
        }
      }

      if (!hasConflict) {
        slots.push(slotStr)
      }
    }

    current = addMinutes(current, slotInterval)
  }

  return { slots }
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
        date: data.date,
        start_time: data.startTime,
        status: 'confirmado' as const,
      }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(appointmentData)
    .select('id')
    .single()

  if (error) {
    console.error('Erro ao criar agendamento:', error)
    return { success: false, error: `Erro ao confirmar agendamento: ${error.message}` }
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
