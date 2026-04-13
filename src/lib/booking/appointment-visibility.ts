import type { AppointmentStatus } from '@/lib/supabase/types'

export type AppointmentOperationalStatus = AppointmentStatus | 'aguardando_acao_barbeiro'

function parseAppointmentDateTime(date: string, startTime: string) {
  return new Date(`${date}T${startTime}`)
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