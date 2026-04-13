import assert from 'node:assert/strict'
import test from 'node:test'
import { getAppointmentOperationalStatus, isAppointmentPast } from '@/lib/booking/appointment-visibility'

test('isAppointmentPast considera horário passado no mesmo dia', () => {
  assert.equal(
    isAppointmentPast('2026-04-13', '13:00:00', new Date('2026-04-13T13:01:00')),
    true
  )

  assert.equal(
    isAppointmentPast('2026-04-13', '13:00:00', new Date('2026-04-13T12:59:00')),
    false
  )
})

test('getAppointmentOperationalStatus vira aguardando_acao_barbeiro quando confirmado já passou do horário', () => {
  assert.equal(
    getAppointmentOperationalStatus('confirmado', '2026-04-13', '13:00:00', new Date('2026-04-13T13:30:00')),
    'aguardando_acao_barbeiro'
  )

  assert.equal(
    getAppointmentOperationalStatus('concluido', '2026-04-13', '13:00:00', new Date('2026-04-13T13:30:00')),
    'concluido'
  )
})