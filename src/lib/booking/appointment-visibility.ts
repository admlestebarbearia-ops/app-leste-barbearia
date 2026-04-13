import type { AppointmentStatus } from '@/lib/supabase/types'

export type AppointmentOperationalStatus = AppointmentStatus | 'aguardando_acao_barbeiro'

function normalizeTime(time: string) {
  // Garante formato HH:mm:ss
  return time.length === 5 ? `${time}:00` : time
}

function parseAppointmentDateTime(date: string, startTime: string) {
  // Horários armazenados no DB são BRT (UTC-3, fixo — Brasil aboliu o horário
  // de verão em 2019). O offset explícito garante comparação correta no
  // servidor Vercel (UTC) e também em máquinas locais.
  return new Date(`${date}T${normalizeTime(startTime)}-03:00`)
}

export function isAppointmentPast(date: string, startTime: string, now = new Date()) {
  const appointmentDateTime = parseAppointmentDateTime(date, startTime)
  if (Number.isNaN(appointmentDateTime.getTime())) return false
  return appointmentDateTime.getTime() < now.getTime()
}

export function getAppointmentOperationalStatus(
  status: AppointmentStatus,
  date: string,
  startTime: string,
  now = new Date()
): AppointmentOperationalStatus {
  if (status === 'confirmado' && isAppointmentPast(date, startTime, now)) {
    return 'aguardando_acao_barbeiro'
  }

  return status
}