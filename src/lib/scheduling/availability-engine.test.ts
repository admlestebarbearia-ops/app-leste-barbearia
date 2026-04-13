import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SpecialSchedule, WorkingHours } from '@/lib/supabase/types'
import { calculateAvailableSlots } from './availability-engine'

function makeWorkingHours(overrides: Partial<WorkingHours> = {}): WorkingHours {
  return {
    id: 'wh-1',
    day_of_week: 1,
    is_open: true,
    open_time: '09:00:00',
    close_time: '21:00:00',
    lunch_start: null,
    lunch_end: null,
    ...overrides,
  }
}

function makeSpecialSchedule(overrides: Partial<SpecialSchedule> = {}): SpecialSchedule {
  return {
    id: 'sp-1',
    date: '2026-04-06',
    is_closed: false,
    open_time: '10:00:00',
    close_time: '18:00:00',
    reason: null,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('calculateAvailableSlots', () => {
  it('retorna erro quando o dia está fechado por agenda especial', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      workingHours: makeWorkingHours(),
      specialSchedule: makeSpecialSchedule({ is_closed: true, open_time: null, close_time: null }),
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result, {
      slots: [],
      error: 'Barbearia fechada neste dia (data especial).',
    })
  })

  it('usa a duração do serviço para calcular o último horário válido', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      workingHours: makeWorkingHours(),
      specialSchedule: null,
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.equal(result.slots.at(0), '09:00')
    assert.equal(result.slots.at(-1), '20:30')
    assert.ok(!result.slots.includes('20:45'))
  })

  it('permite último horário em 20:50 para serviço de 10 minutos com grade de 5', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 10,
      slotIntervalMinutes: 5,
      workingHours: makeWorkingHours(),
      specialSchedule: null,
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.equal(result.slots.at(-1), '20:50')
  })

  it('respeita abertura não redonda e segue a grade a partir dela', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 20,
      slotIntervalMinutes: 10,
      workingHours: makeWorkingHours({ open_time: '09:10:00', close_time: '10:00:00' }),
      specialSchedule: null,
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result.slots, ['09:10', '09:20', '09:30', '09:40'])
  })

  it('remove slots que cruzam o intervalo de almoço', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWorkingHours({ close_time: '13:00:00', lunch_start: '10:00:00', lunch_end: '11:00:00' }),
      specialSchedule: null,
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result.slots, ['09:00', '09:30', '11:00', '11:30', '12:00', '12:30'])
  })

  it('remove slots que entram em conflito com agendamento confirmado', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 15,
      slotIntervalMinutes: 15,
      workingHours: makeWorkingHours({ close_time: '11:00:00' }),
      specialSchedule: null,
      existingAppointments: [
        {
          start_time: '09:30:00',
          duration_minutes: 30,
          status: 'confirmado',
          deleted_at: null,
        },
      ],
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result.slots, ['09:00', '09:15', '10:00', '10:15', '10:30', '10:45'])
  })

  it('mantem slots adjacentes livres quando os conflitos estao apenas nos horarios intermediarios', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-14',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWorkingHours({ open_time: '13:00:00', close_time: '15:00:00' }),
      specialSchedule: null,
      existingAppointments: [
        {
          start_time: '13:30:00',
          duration_minutes: 30,
          status: 'confirmado',
          deleted_at: null,
        },
        {
          start_time: '14:30:00',
          duration_minutes: 30,
          status: 'confirmado',
          deleted_at: null,
        },
      ],
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result.slots, ['13:00', '14:00'])
  })

  it('remove slots no passado para o dia atual', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-04',
      serviceDurationMinutes: 15,
      slotIntervalMinutes: 15,
      workingHours: makeWorkingHours({ close_time: '10:00:00' }),
      specialSchedule: null,
      now: new Date('2026-04-04T09:20:00'),
    })

    assert.deepEqual(result.slots, ['09:30', '09:45'])
  })

  it('retorna erro de pausa temporária apenas para hoje', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-04',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      isPaused: true,
      workingHours: makeWorkingHours(),
      specialSchedule: null,
      now: new Date('2026-04-04T09:20:00'),
    })

    assert.equal(result.error, 'A barbearia está em pausa (horário de almoço). Tente novamente em instantes ou escolha outro dia.')
    assert.deepEqual(result.slots, [])
  })

  it('ignora agendamentos cancelados e soft-deleted ao calcular conflito', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWorkingHours({ close_time: '12:00:00' }),
      specialSchedule: null,
      existingAppointments: [
        { start_time: '09:30:00', duration_minutes: 30, status: 'cancelado', deleted_at: null },
        { start_time: '10:00:00', duration_minutes: 30, status: 'confirmado', deleted_at: '2026-04-01T00:00:00.000Z' },
      ],
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result.slots, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
  })

  it('retorna erro quando serviço não tem duração válida', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-06',
      serviceDurationMinutes: 0,
      slotIntervalMinutes: 15,
      workingHours: makeWorkingHours(),
      specialSchedule: null,
      now: new Date('2026-04-01T10:00:00'),
    })

    assert.deepEqual(result, {
      slots: [],
      error: 'Servico com duracao invalida.',
    })
  })
})