import type { ExistingAppointmentWindow } from '@/lib/scheduling/availability-engine'

export type AppointmentServiceDurationRelation =
  | { duration_minutes?: number | null }
  | Array<{ duration_minutes?: number | null }>
  | null

export type AppointmentAvailabilityRow = {
  start_time: string
  services: AppointmentServiceDurationRelation
  service_duration_minutes_snapshot?: number | null
  status?: string | null
  deleted_at?: string | null
}

export type SupabaseLikeError = {
  code?: string | null
  message?: string | null
}

export function getRelatedServiceDuration(services: AppointmentServiceDurationRelation) {
  if (Array.isArray(services)) {
    return services[0]?.duration_minutes ?? null
  }

  return services?.duration_minutes ?? null
}

export function normalizeAppointmentWindows(
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

export function shouldFallbackToLegacyAvailabilityQuery(error: SupabaseLikeError | null | undefined) {
  const message = error?.message ?? ''
  return (
    error?.code === 'PGRST204' ||
    message.includes('service_duration_minutes_snapshot') ||
    message.includes('deleted_at')
  )
}

export function shouldRetryLegacyAppointmentInsert(error: SupabaseLikeError | null | undefined) {
  const message = error?.message ?? ''
  return (
    error?.code === 'PGRST204' ||
    message.includes('service_name_snapshot') ||
    message.includes('service_price_snapshot') ||
    message.includes('service_duration_minutes_snapshot')
  )
}

export function getCreateAppointmentStateError(input: {
  serviceIsActive: boolean
  barberIsActive: boolean
  availableSlots: string[]
  requestedTime: string
}) {
  if (!input.serviceIsActive) {
    return 'Servico indisponivel. Foi desativado recentemente.'
  }

  if (!input.barberIsActive) {
    return 'Barbeiro indisponivel no momento. Atualize a pagina e tente novamente.'
  }

  if (!input.availableSlots.includes(input.requestedTime)) {
    return 'Horario nao disponivel. Por favor, escolha outro horario.'
  }

  return null
}