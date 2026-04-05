import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BusinessConfig, WorkingHours } from '@/lib/supabase/types'
import {
  normalizeTimeValue,
  validateBusinessConfigPatch,
  validateSpecialSchedulePayload,
  validateWorkingHoursRow,
} from './admin-validation'

function makeWorkingHours(overrides: Partial<Omit<WorkingHours, 'id'>> = {}): Omit<WorkingHours, 'id'> {
  return {
    day_of_week: 1,
    is_open: true,
    open_time: '09:00:00',
    close_time: '18:00:00',
    lunch_start: null,
    lunch_end: null,
    ...overrides,
  }
}

describe('admin validation helpers', () => {
  it('normaliza horário HH:mm para HH:mm:ss', () => {
    assert.equal(normalizeTimeValue('09:30'), '09:30:00')
    assert.equal(normalizeTimeValue('09:30:00'), '09:30:00')
  })

  it('valida regras críticas do working_hours', () => {
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ is_open: false })), null)
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ open_time: null })), 'Dia aberto exige horário de abertura e fechamento.')
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ close_time: '08:00:00' })), 'O horário de fechamento precisa ser maior que o de abertura.')
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ lunch_start: '12:00:00', lunch_end: null })), 'Preencha início e fim do almoço, ou deixe ambos vazios.')
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ lunch_start: '13:00:00', lunch_end: '12:00:00' })), 'O horário final do almoço precisa ser maior que o inicial.')
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ lunch_start: '08:00:00', lunch_end: '09:30:00' })), 'O almoço precisa estar dentro do horário de funcionamento.')
    assert.equal(validateWorkingHoursRow(makeWorkingHours({ lunch_start: '12:00:00', lunch_end: '13:00:00' })), null)
  })

  it('valida agenda especial aberta', () => {
    assert.equal(validateSpecialSchedulePayload({ is_closed: true }), null)
    assert.equal(validateSpecialSchedulePayload({ is_closed: false, open_time: null, close_time: '12:00:00' }), 'Data especial aberta exige horário de abertura e fechamento.')
    assert.equal(validateSpecialSchedulePayload({ is_closed: false, open_time: '13:00:00', close_time: '12:00:00' }), 'O horário de fechamento precisa ser maior que o de abertura.')
    assert.equal(validateSpecialSchedulePayload({ is_closed: false, open_time: '10:00:00', close_time: '12:00:00' }), null)
  })

  it('valida patch de business_config', () => {
    const invalidWindow: Partial<BusinessConfig> = { cancellation_window_minutes: -1 }
    const invalidInterval: Partial<BusinessConfig> = { slot_interval_minutes: 25 }
    const validPatch: Partial<BusinessConfig> = { cancellation_window_minutes: 120, slot_interval_minutes: 15 }

    assert.equal(validateBusinessConfigPatch(invalidWindow), 'A janela de cancelamento não pode ser negativa.')
    assert.equal(validateBusinessConfigPatch(invalidInterval), 'Intervalo de grade inválido. Use 5, 10, 15, 20, 30 ou 60 minutos.')
    assert.equal(validateBusinessConfigPatch(validPatch), null)
  })
})