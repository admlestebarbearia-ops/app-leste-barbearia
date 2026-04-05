import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Service, SpecialSchedule, WorkingHours } from '@/lib/supabase/types'
import {
  buildAvailabilitySyncKey,
  getBarberAvailabilityChangeMessage,
  isBookingDateDisabled,
  resolveSelectedService,
} from './public-booking-sync'

function makeWorkingHours(overrides: Partial<WorkingHours> = {}): WorkingHours {
  return {
    id: 'wh-1',
    day_of_week: 1,
    is_open: true,
    open_time: '09:00:00',
    close_time: '18:00:00',
    lunch_start: null,
    lunch_end: null,
    ...overrides,
  }
}

function makeSpecialSchedule(overrides: Partial<SpecialSchedule> = {}): SpecialSchedule {
  return {
    id: 'sp-1',
    date: '2026-04-07',
    is_closed: true,
    open_time: null,
    close_time: null,
    reason: 'Feriado',
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'Corte',
    price: 40,
    duration_minutes: 30,
    icon_name: 'scissors',
    is_active: true,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('public booking sync helpers', () => {
  it('desabilita datas no passado, dias fechados e datas especiais fechadas', () => {
    const workingHours = [
      makeWorkingHours({ day_of_week: 1, is_open: false }),
      makeWorkingHours({ id: 'wh-2', day_of_week: 2, is_open: true }),
    ]
    const specialSchedules = [makeSpecialSchedule({ date: '2026-04-07', is_closed: true })]
    const now = new Date('2026-04-06T10:00:00')

    assert.equal(isBookingDateDisabled(new Date('2026-04-05T12:00:00'), workingHours, specialSchedules, now), true)
    assert.equal(isBookingDateDisabled(new Date('2026-04-06T12:00:00'), workingHours, specialSchedules, now), true)
    assert.equal(isBookingDateDisabled(new Date('2026-04-07T12:00:00'), workingHours, specialSchedules, now), true)
    assert.equal(isBookingDateDisabled(new Date('2026-04-08T12:00:00'), workingHours, specialSchedules, now), false)
  })

  it('resolve o servico selecionado com a referencia mais nova da lista publica', () => {
    const selectedService = makeService({ id: 'svc-1', name: 'Corte antigo' })
    const freshService = makeService({ id: 'svc-1', name: 'Corte atualizado' })

    assert.equal(resolveSelectedService([freshService], selectedService), freshService)
    assert.equal(resolveSelectedService([], selectedService), null)
    assert.equal(resolveSelectedService([freshService], null), null)
  })

  it('gera a mensagem correta quando a disponibilidade do barbeiro muda', () => {
    assert.equal(getBarberAvailabilityChangeMessage(null, 'barber-1'), null)
    assert.equal(getBarberAvailabilityChangeMessage('barber-1', 'barber-1'), null)
    assert.equal(
      getBarberAvailabilityChangeMessage('barber-1', 'barber-2'),
      'O barbeiro disponivel mudou. Escolha a data e o horario novamente.'
    )
    assert.equal(
      getBarberAvailabilityChangeMessage('barber-1', null),
      'Nenhum barbeiro esta disponivel no momento. Tente novamente em instantes.'
    )
  })

  it('muda a chave de sincronizacao quando horario, agenda especial, config ou barbeiro mudam', () => {
    const baseKey = buildAvailabilitySyncKey({
      workingHours: [makeWorkingHours()],
      specialSchedules: [makeSpecialSchedule({ is_closed: false, open_time: '10:00:00', close_time: '15:00:00' })],
      isPaused: false,
      slotIntervalMinutes: 30,
      barberId: 'barber-1',
    })

    const changedWorkingHoursKey = buildAvailabilitySyncKey({
      workingHours: [makeWorkingHours({ lunch_start: '12:00:00', lunch_end: '13:00:00' })],
      specialSchedules: [makeSpecialSchedule({ is_closed: false, open_time: '10:00:00', close_time: '15:00:00' })],
      isPaused: false,
      slotIntervalMinutes: 30,
      barberId: 'barber-1',
    })

    const changedConfigKey = buildAvailabilitySyncKey({
      workingHours: [makeWorkingHours()],
      specialSchedules: [makeSpecialSchedule({ is_closed: false, open_time: '10:00:00', close_time: '15:00:00' })],
      isPaused: true,
      slotIntervalMinutes: 15,
      barberId: 'barber-2',
    })

    assert.notEqual(baseKey, changedWorkingHoursKey)
    assert.notEqual(baseKey, changedConfigKey)
  })
})