import { addMinutes, isAfter, parseISO } from 'date-fns'

export function getCancellationDeadline(
  appointmentDate: string,
  appointmentStartTime: string,
  cancellationWindowMinutes: number
) {
  return addMinutes(parseISO(`${appointmentDate}T${appointmentStartTime}`), -cancellationWindowMinutes)
}

export function getCancellationPolicyError(input: {
  status: string
  appointmentDate: string
  appointmentStartTime: string
  cancellationWindowMinutes: number
  now?: Date
}) {
  if (input.status !== 'confirmado') {
    return 'Agendamento ja cancelado.'
  }

  const cancelDeadline = getCancellationDeadline(
    input.appointmentDate,
    input.appointmentStartTime,
    input.cancellationWindowMinutes
  )

  if (isAfter(input.now ?? new Date(), cancelDeadline)) {
    return `Cancelamento nao permitido com menos de ${input.cancellationWindowMinutes} minuto(s) de antecedencia.`
  }

  return null
}