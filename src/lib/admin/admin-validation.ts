import type { BusinessConfig, WorkingHours } from '@/lib/supabase/types'

export const ALLOWED_SLOT_INTERVALS = new Set([5, 10, 15, 20, 30, 60])

export function normalizeTimeValue(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

export function validateWorkingHoursRow(h: Omit<WorkingHours, 'id'>): string | null {
  if (!h.is_open) return null

  if (!h.open_time || !h.close_time) {
    return 'Dia aberto exige horário de abertura e fechamento.'
  }

  const openTime = normalizeTimeValue(h.open_time)
  const closeTime = normalizeTimeValue(h.close_time)
  if (openTime >= closeTime) {
    return 'O horário de fechamento precisa ser maior que o de abertura.'
  }

  const hasLunchStart = !!h.lunch_start
  const hasLunchEnd = !!h.lunch_end
  if (hasLunchStart !== hasLunchEnd) {
    return 'Preencha início e fim do almoço, ou deixe ambos vazios.'
  }

  if (h.lunch_start && h.lunch_end) {
    const lunchStart = normalizeTimeValue(h.lunch_start)
    const lunchEnd = normalizeTimeValue(h.lunch_end)
    if (lunchStart >= lunchEnd) {
      return 'O horário final do almoço precisa ser maior que o inicial.'
    }
    if (lunchStart < openTime || lunchEnd > closeTime) {
      return 'O almoço precisa estar dentro do horário de funcionamento.'
    }
  }

  return null
}

export function validateSpecialSchedulePayload(data: {
  is_closed: boolean
  open_time?: string | null
  close_time?: string | null
}) {
  if (data.is_closed) return null

  if (!data.open_time || !data.close_time) {
    return 'Data especial aberta exige horário de abertura e fechamento.'
  }

  const openTime = normalizeTimeValue(data.open_time)
  const closeTime = normalizeTimeValue(data.close_time)
  if (openTime >= closeTime) {
    return 'O horário de fechamento precisa ser maior que o de abertura.'
  }

  return null
}

export function validateBusinessConfigPatch(data: Partial<BusinessConfig>) {
  if (data.cancellation_window_minutes != null && data.cancellation_window_minutes < 0) {
    return 'A janela de cancelamento não pode ser negativa.'
  }

  if (
    data.slot_interval_minutes != null &&
    !ALLOWED_SLOT_INTERVALS.has(data.slot_interval_minutes)
  ) {
    return 'Intervalo de grade inválido. Use 5, 10, 15, 20, 30 ou 60 minutos.'
  }

  if (data.max_appointments_per_day != null && data.max_appointments_per_day < 1) {
    return 'Limite de agendamentos por dia deve ser pelo menos 1.'
  }

  if (data.calendar_max_days_ahead != null && (data.calendar_max_days_ahead < 1 || data.calendar_max_days_ahead > 365)) {
    return 'Dias de antecedência deve ser entre 1 e 365.'
  }

  if (data.calendar_open_until_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(data.calendar_open_until_date)) {
    return 'Data limite inválida. Use o formato AAAA-MM-DD.'
  }

  return null
}

export function validateServicePayload(data: {
  name: string
  price: number
  duration_minutes: number
}) {
  if (!data.name.trim()) {
    return 'O nome do serviço é obrigatório.'
  }

  if (!Number.isFinite(data.price) || data.price < 0) {
    return 'O preço do serviço deve ser zero ou maior.'
  }

  if (!Number.isInteger(data.duration_minutes) || data.duration_minutes <= 0) {
    return 'A duração do serviço deve ser um número inteiro maior que zero.'
  }

  return null
}