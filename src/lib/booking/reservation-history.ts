import type { AppointmentStatus } from '@/lib/supabase/types'

export interface ReservationHistoryEntry {
  date: string
  status: AppointmentStatus | string
}

const FINALIZED_STATUSES = new Set<AppointmentStatus>(['cancelado', 'concluido', 'faltou'])
const ACTIVE_UPCOMING_STATUSES = new Set<AppointmentStatus>(['confirmado', 'aguardando_pagamento'])

function parseDateAtMidday(date: string) {
  return new Date(`${date}T12:00:00`)
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

export function isReservationHistoryEntry(entry: ReservationHistoryEntry, today: string) {
  const status = entry.status as AppointmentStatus

  if (FINALIZED_STATUSES.has(status)) return true
  if (entry.date < today) return true

  return !ACTIVE_UPCOMING_STATUSES.has(status)
}

export function getReservationHistoryCalendarMeta(
  entries: ReservationHistoryEntry[],
  fallbackDate = new Date()
) {
  const selectableDateKeys = Array.from(
    new Set(entries.map((entry) => entry.date).filter(Boolean))
  ).sort()

  const fallback = new Date(fallbackDate)
  fallback.setHours(12, 0, 0, 0)

  const earliestVisibleDate = selectableDateKeys[0]
    ? parseDateAtMidday(selectableDateKeys[0])
    : fallback

  const latestDate = selectableDateKeys[selectableDateKeys.length - 1]
    ? parseDateAtMidday(selectableDateKeys[selectableDateKeys.length - 1])
    : fallback

  // endMonth inclui datas futuras para que agendamentos futuros sejam navegáveis
  const latestVisibleDate = latestDate > fallback ? latestDate : fallback

  return {
    selectableDateKeys,
    // Sem seleção automática — usuário navega livremente
    selectedDate: undefined as Date | undefined,
    // Começa no mês atual, não no último agendamento
    initialMonth: fallback,
    startMonth: getMonthStart(earliestVisibleDate),
    endMonth: getMonthStart(latestVisibleDate),
  }
}