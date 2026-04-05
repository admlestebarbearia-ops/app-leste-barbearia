import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBlockedDeviceLookup,
  getCreateAppointmentStateError,
  getRelatedServiceDuration,
  normalizeAppointmentWindows,
  shouldFallbackToLegacyAvailabilityQuery,
  shouldRetryLegacyAppointmentInsert,
} from './appointment-server-guards'

describe('appointment server guards', () => {
  it('resolve a duração do serviço a partir de objeto, array ou null', () => {
    assert.equal(getRelatedServiceDuration({ duration_minutes: 45 }), 45)
    assert.equal(getRelatedServiceDuration([{ duration_minutes: 35 }]), 35)
    assert.equal(getRelatedServiceDuration(null), null)
  })

  it('normaliza janelas de agendamento com snapshot, relação ou fallback de 30 minutos', () => {
    const normalized = normalizeAppointmentWindows([
      {
        start_time: '09:00:00',
        service_duration_minutes_snapshot: 50,
        services: { duration_minutes: 30 },
        status: 'confirmado',
        deleted_at: null,
      },
      {
        start_time: '10:00:00',
        services: [{ duration_minutes: 40 }],
      },
      {
        start_time: '11:00:00',
        services: null,
      },
    ])

    assert.deepEqual(normalized, [
      { start_time: '09:00:00', duration_minutes: 50, status: 'confirmado', deleted_at: null },
      { start_time: '10:00:00', duration_minutes: 40, status: 'confirmado', deleted_at: null },
      { start_time: '11:00:00', duration_minutes: 30, status: 'confirmado', deleted_at: null },
    ])
  })

  it('detecta quando deve cair no fallback legado da query de disponibilidade', () => {
    assert.equal(shouldFallbackToLegacyAvailabilityQuery({ code: 'PGRST204', message: 'missing column' }), true)
    assert.equal(shouldFallbackToLegacyAvailabilityQuery({ message: 'column service_duration_minutes_snapshot does not exist' }), true)
    assert.equal(shouldFallbackToLegacyAvailabilityQuery({ message: 'column deleted_at does not exist' }), true)
    assert.equal(shouldFallbackToLegacyAvailabilityQuery({ message: 'permission denied' }), false)
  })

  it('detecta quando deve repetir o insert sem colunas snapshot', () => {
    assert.equal(shouldRetryLegacyAppointmentInsert({ code: 'PGRST204', message: 'missing column' }), true)
    assert.equal(shouldRetryLegacyAppointmentInsert({ message: 'column service_name_snapshot does not exist' }), true)
    assert.equal(shouldRetryLegacyAppointmentInsert({ message: 'column service_price_snapshot does not exist' }), true)
    assert.equal(shouldRetryLegacyAppointmentInsert({ message: 'column service_duration_minutes_snapshot does not exist' }), true)
    assert.equal(shouldRetryLegacyAppointmentInsert({ message: 'duplicate key value violates unique constraint' }), false)
  })

  it('monta corretamente o lookup de blocked_devices para sessão, telefone ou ambos', () => {
    assert.deepEqual(
      buildBlockedDeviceLookup({ userId: 'user-1', phone: '(11) 99999-0000' }),
      { kind: 'or', filter: 'session_id.eq.user-1,phone.eq.11999990000' }
    )

    assert.deepEqual(
      buildBlockedDeviceLookup({ userId: 'user-1', phone: null }),
      { kind: 'eq', field: 'session_id', value: 'user-1' }
    )

    assert.deepEqual(
      buildBlockedDeviceLookup({ userId: null, phone: '(11) 99999-0000' }),
      { kind: 'eq', field: 'phone', value: '11999990000' }
    )

    assert.deepEqual(buildBlockedDeviceLookup({ userId: null, phone: null }), { kind: 'none' })
  })

  it('retorna a mensagem correta para os guardrails finais do createAppointment', () => {
    assert.equal(
      getCreateAppointmentStateError({
        serviceIsActive: false,
        barberIsActive: true,
        availableSlots: ['09:00'],
        requestedTime: '09:00',
      }),
      'Servico indisponivel. Foi desativado recentemente.'
    )

    assert.equal(
      getCreateAppointmentStateError({
        serviceIsActive: true,
        barberIsActive: false,
        availableSlots: ['09:00'],
        requestedTime: '09:00',
      }),
      'Barbeiro indisponivel no momento. Atualize a pagina e tente novamente.'
    )

    assert.equal(
      getCreateAppointmentStateError({
        serviceIsActive: true,
        barberIsActive: true,
        availableSlots: ['09:00'],
        requestedTime: '09:30',
      }),
      'Horario nao disponivel. Por favor, escolha outro horario.'
    )

    assert.equal(
      getCreateAppointmentStateError({
        serviceIsActive: true,
        barberIsActive: true,
        availableSlots: ['09:00'],
        requestedTime: '09:00',
      }),
      null
    )
  })
})