export interface MercadoPagoAppointmentNotificationPayload {
  title: string
  body: string
  url: string
  tag: string
}

export interface MercadoPagoAppointmentNotificationRecord {
  client_id: string | null
  client_name: string | null
  service_name_snapshot: string | null
  date: string | null
  start_time: string | null
  current_status: string | null
  expected_payment_date: string | null
}

interface NotifyMercadoPagoAppointmentStatusChangeInput {
  appointmentId: string
  nextStatus: 'confirmado' | 'cancelado'
  appointment: MercadoPagoAppointmentNotificationRecord | null
}

interface NotifyMercadoPagoAppointmentStatusChangeDeps {
  notifyUser(userId: string, payload: MercadoPagoAppointmentNotificationPayload): Promise<void>
  notifyAdmins(payload: MercadoPagoAppointmentNotificationPayload): Promise<void>
}

type MercadoPagoAppointmentNotificationResult = 'none' | 'fiado-quitado' | 'pagamento-confirmado'

function formatAppointmentDate(date: string | null) {
  return date ? date.split('-').reverse().join('/') : '?'
}

function formatAppointmentTime(startTime: string | null) {
  return startTime?.slice(0, 5) ?? '?'
}

export async function notifyMercadoPagoAppointmentStatusChange(
  input: NotifyMercadoPagoAppointmentStatusChangeInput,
  deps: NotifyMercadoPagoAppointmentStatusChangeDeps
): Promise<{ kind: MercadoPagoAppointmentNotificationResult }> {
  const appointment = input.appointment

  if (!appointment || input.nextStatus !== 'confirmado') {
    return { kind: 'none' }
  }

  const formattedDate = formatAppointmentDate(appointment.date)
  const formattedTime = formatAppointmentTime(appointment.start_time)

  if (appointment.current_status === 'concluido' && appointment.expected_payment_date != null) {
    await deps.notifyAdmins({
      title: '💰 Fiado quitado via Mercado Pago',
      body: `${appointment.client_name ?? 'Cliente'} pagou o agendamento de ${formattedDate} às ${formattedTime}`,
      url: '/admin',
      tag: `admin-fiado-quitado-${input.appointmentId}`,
    })

    return { kind: 'fiado-quitado' }
  }

  await Promise.allSettled([
    appointment.client_id
      ? deps.notifyUser(appointment.client_id, {
          title: '💳 Pagamento confirmado!',
          body: `${appointment.service_name_snapshot ?? 'Serviço'} em ${formattedDate} às ${formattedTime} está confirmado.`,
          url: '/reservas',
          tag: `pagamento-confirmado-${input.appointmentId}`,
        })
      : Promise.resolve(),
    deps.notifyAdmins({
      title: '💳 Pagamento recebido',
      body: `${appointment.client_name ?? 'Cliente'} — ${appointment.service_name_snapshot ?? 'Serviço'} em ${formattedDate} às ${formattedTime}`,
      url: '/admin',
      tag: `admin-pagamento-${input.appointmentId}`,
    }),
  ])

  return { kind: 'pagamento-confirmado' }
}