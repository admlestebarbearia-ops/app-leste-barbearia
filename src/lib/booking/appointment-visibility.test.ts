import assert from 'node:assert/strict'
import test from 'node:test'
import { getAppointmentOperationalStatus, isAppointmentPast } from '@/lib/booking/appointment-visibility'

// Os horários no DB são BRT (UTC-3). Os 'now' nos testes usam sufixo Z
// para ser explicitamente UTC, independente da timezone da máquina de CI.
// 13:00 BRT = 16:00 UTC.
test('isAppointmentPast considera horário passado no mesmo dia', () => {
  assert.equal(
    isAppointmentPast('2026-04-13', '13:00:00', new Date('2026-04-13T16:01:00Z')),
    true
  )

  assert.equal(
    isAppointmentPast('2026-04-13', '13:00:00', new Date('2026-04-13T15:59:00Z')),
    false
  )
})

test('getAppointmentOperationalStatus vira aguardando_acao_barbeiro quando confirmado já passou do horário', () => {
  assert.equal(
    getAppointmentOperationalStatus('confirmado', '2026-04-13', '13:00:00', new Date('2026-04-13T16:30:00Z')),
    'aguardando_acao_barbeiro'
  )

  assert.equal(
    getAppointmentOperationalStatus('concluido', '2026-04-13', '13:00:00', new Date('2026-04-13T16:30:00Z')),
    'concluido'
  )
})