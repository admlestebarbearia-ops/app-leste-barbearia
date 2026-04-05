import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCancellationDeadline, getCancellationPolicyError } from './cancellation-policy'

describe('cancellation policy', () => {
  it('calcula o deadline de cancelamento com base na antecedência configurada', () => {
    const deadline = getCancellationDeadline('2026-04-10', '15:00:00', 120)
    assert.equal(deadline.getFullYear(), 2026)
    assert.equal(deadline.getMonth(), 3)
    assert.equal(deadline.getDate(), 10)
    assert.equal(deadline.getHours(), 13)
    assert.equal(deadline.getMinutes(), 0)
  })

  it('bloqueia cancelamento quando o agendamento já não está confirmado', () => {
    assert.equal(
      getCancellationPolicyError({
        status: 'cancelado',
        appointmentDate: '2026-04-10',
        appointmentStartTime: '15:00:00',
        cancellationWindowMinutes: 120,
        now: new Date('2026-04-10T10:00:00'),
      }),
      'Agendamento ja cancelado.'
    )
  })

  it('permite cancelar antes ou exatamente no deadline e bloqueia depois', () => {
    assert.equal(
      getCancellationPolicyError({
        status: 'confirmado',
        appointmentDate: '2026-04-10',
        appointmentStartTime: '15:00:00',
        cancellationWindowMinutes: 120,
        now: new Date('2026-04-10T12:59:59'),
      }),
      null
    )

    assert.equal(
      getCancellationPolicyError({
        status: 'confirmado',
        appointmentDate: '2026-04-10',
        appointmentStartTime: '15:00:00',
        cancellationWindowMinutes: 120,
        now: new Date('2026-04-10T13:00:00'),
      }),
      null
    )

    assert.equal(
      getCancellationPolicyError({
        status: 'confirmado',
        appointmentDate: '2026-04-10',
        appointmentStartTime: '15:00:00',
        cancellationWindowMinutes: 120,
        now: new Date('2026-04-10T13:00:01'),
      }),
      'Cancelamento nao permitido com menos de 120 minuto(s) de antecedencia.'
    )
  })
})