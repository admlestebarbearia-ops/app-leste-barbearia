/**
 * Testes de Sistema — Verificação de Requisitos End-to-End
 *
 * Este arquivo testa os requisitos funcionais do sistema de ponta a ponta,
 * compondo múltiplas funções de negócio em fluxos realistas como um usuário
 * ou administrador faria ao usar o sistema.
 *
 * Cada bloco de `describe` mapeia um módulo funcional do sistema:
 *  - AGENDAMENTO    → fluxo completo de agendamento de horário
 *  - CANCELAMENTO   → política de cancelamento de agendamento
 *  - DISPONIBILIDADE → cálculo de horários disponíveis
 *  - ADMIN          → validação de configurações administrativas
 *  - PRODUTOS       → reservas de produtos da loja
 *  - BLOQUEIO       → bloqueio de dispositivos / contas
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calculateAvailableSlots,
  type ExistingAppointmentWindow,
} from '@/lib/scheduling/availability-engine'

import {
  getCancellationDeadline,
  getCancellationPolicyError,
} from '@/lib/booking/cancellation-policy'

import {
  buildBlockedDeviceLookup,
  getCreateAppointmentStateError,
  normalizeAppointmentWindows,
} from '@/lib/booking/appointment-server-guards'

import {
  buildAvailabilitySyncKey,
  isBookingDateDisabled,
  resolveSelectedService,
} from '@/lib/booking/public-booking-sync'

import {
  normalizeTimeValue,
  validateBusinessConfigPatch,
  validateServicePayload,
  validateSpecialSchedulePayload,
  validateWorkingHoursRow,
} from '@/lib/admin/admin-validation'

import {
  validateAtualizarQuantidadeReserva,
  validateCancelarReservaProduto,
  validateProductPayload,
  validateReservarProduto,
} from '@/lib/booking/product-reservation-guards'

import type { Service, SpecialSchedule, WorkingHours } from '@/lib/supabase/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWH(overrides: Partial<WorkingHours> = {}): WorkingHours {
  return {
    id: 'wh-test',
    day_of_week: 1, // segunda
    is_open: true,
    open_time: '09:00:00',
    close_time: '18:00:00',
    lunch_start: null,
    lunch_end: null,
    ...overrides,
  }
}

function makeSS(overrides: Partial<SpecialSchedule> = {}): SpecialSchedule {
  return {
    id: 'ss-test',
    date: '2026-04-13',
    is_closed: true,
    open_time: null,
    close_time: null,
    reason: 'Feriado',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'Corte',
    price: 40,
    duration_minutes: 30,
    icon_name: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── MÓDULO: AGENDAMENTO ─────────────────────────────────────────────────────

describe('AGENDAMENTO — fluxo completo de criação de horário', () => {
  it('[REQ-A1] data no passado é desabilitada para seleção', () => {
    const wh = [makeWH({ day_of_week: 1, is_open: true })]
    const now = new Date('2026-04-08T10:00:00') // quarta
    const pastDate = new Date('2026-04-07T12:00:00') // terça (passado)
    assert.equal(isBookingDateDisabled(pastDate, wh, [], now), true)
  })

  it('[REQ-A2] dia da semana fechado é desabilitado', () => {
    const wh = [makeWH({ day_of_week: 1, is_open: false })] // seg fechada
    const now = new Date('2026-04-06T10:00:00') // domingo
    const monday = new Date('2026-04-13T12:00:00') // segunda (dia 13)
    assert.equal(isBookingDateDisabled(monday, wh, [], now), true)
  })

  it('[REQ-A3] data especial fechada desabilita a data mesmo que o dia esteja aberto', () => {
    const wh = [makeWH({ day_of_week: 1, is_open: true })]
    const ss = [makeSS({ date: '2026-04-13', is_closed: true })]
    const now = new Date('2026-04-06T10:00:00')
    const holiday = new Date('2026-04-13T12:00:00')
    assert.equal(isBookingDateDisabled(holiday, wh, ss, now), true)
  })

  it('[REQ-A4] isBookingDateDisabled: dia com agenda especial FECHADA é desabilitado mesmo com default aberto', () => {
    // Nota: isBookingDateDisabled verifica agendas FECHADAS no calendário.
    // O override de calendário para datas especiais ABERTAS ocorre no calculateAvailableSlots.
    const wh = [makeWH({ day_of_week: 1, is_open: true })] // segunda aberta
    const ss = [makeSS({ date: '2026-04-13', is_closed: true })] // segunda com agenda fechada
    const now = new Date('2026-04-06T10:00:00')
    const monday = new Date('2026-04-13T12:00:00')
    assert.equal(isBookingDateDisabled(monday, wh, ss, now), true)
  })

  it('[REQ-A5] hoje não é desabilitado se ainda houver horários disponíveis', () => {
    const wh = [makeWH({ day_of_week: 1, is_open: true })] // seg
    const now = new Date('2026-04-13T08:00:00') // seg de manhã cedo
    const today = new Date('2026-04-13T08:00:00')
    assert.equal(isBookingDateDisabled(today, wh, [], now), false)
  })

  it('[REQ-A6] serviço correto é resolvido do catálogo atual', () => {
    const services = [makeService({ id: 'svc-1' }), makeService({ id: 'svc-2', name: 'Barba' })]
    const selected = makeService({ id: 'svc-1' })
    const resolved = resolveSelectedService(services, selected)
    assert.equal(resolved?.id, 'svc-1')
    assert.equal(resolved?.name, 'Corte')
  })

  it('[REQ-A7] serviço removido do catálogo retorna null', () => {
    const services = [makeService({ id: 'svc-2', name: 'Barba' })]
    const selected = makeService({ id: 'svc-1' })
    assert.equal(resolveSelectedService(services, selected), null)
  })

  it('[REQ-A8] slot válido + serviço + barbeiro ativos = sem erro de criação', () => {
    const slots = ['09:00', '09:30', '10:00']
    const error = getCreateAppointmentStateError({
      serviceIsActive: true,
      barberIsActive: true,
      availableSlots: slots,
      requestedTime: '09:30',
    })
    assert.equal(error, null)
  })

  it('[REQ-A9] serviço inativo bloqueia a criação do agendamento', () => {
    const error = getCreateAppointmentStateError({
      serviceIsActive: false,
      barberIsActive: true,
      availableSlots: ['09:00'],
      requestedTime: '09:00',
    })
    assert.equal(error, 'Servico indisponivel. Foi desativado recentemente.')
  })

  it('[REQ-A10] barbeiro inativo bloqueia a criação do agendamento', () => {
    const error = getCreateAppointmentStateError({
      serviceIsActive: true,
      barberIsActive: false,
      availableSlots: ['09:00'],
      requestedTime: '09:00',
    })
    assert.equal(error, 'Barbeiro indisponivel no momento. Atualize a pagina e tente novamente.')
  })

  it('[REQ-A11] horário que não está na lista de disponíveis bloqueia a criação', () => {
    const error = getCreateAppointmentStateError({
      serviceIsActive: true,
      barberIsActive: true,
      availableSlots: ['09:00', '09:30'],
      requestedTime: '10:00',
    })
    assert.equal(error, 'Horario nao disponivel. Por favor, escolha outro horario.')
  })
})

// ─── MÓDULO: DISPONIBILIDADE ─────────────────────────────────────────────────

describe('DISPONIBILIDADE — cálculo de horários livres', () => {
  const DATE = '2026-04-13'
  const PAST = new Date('2026-01-01T10:00:00')

  it('[REQ-D1] retorna slots corretos para um dia normal (09:00–18:00, 30 min, grade 30)', () => {
    const result = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH({ open_time: '09:00:00', close_time: '11:00:00' }),
      specialSchedule: null,
      now: PAST,
    })
    assert.deepEqual(result.slots, ['09:00', '09:30', '10:00', '10:30'])
  })

  it('[REQ-D2] agendamento existente bloqueia slots sobrepostos (sem afetar slot imediatamente anterior)', () => {
    // Overlap usa comparação estrita: slot que TERMINA exatamente quando o agendamento COMEÇA não conflita.
    // Com grade de 15min e serviço de 30min: 09:15→09:45 conflita com 09:30→10:00; 09:00→09:30 não conflita.
    const existing: ExistingAppointmentWindow[] = [
      { start_time: '09:30:00', duration_minutes: 30, status: 'confirmado', deleted_at: null },
    ]
    const result = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      workingHours: makeWH({ open_time: '09:00:00', close_time: '11:00:00' }),
      specialSchedule: null,
      existingAppointments: existing,
      now: PAST,
    })
    assert.ok(result.slots.includes('09:00'), '09:00 está disponível — termina exatamente no início do bloco ocupado')
    assert.ok(!result.slots.includes('09:15'), '09:15 bloqueado — 09:15→09:45 conflita com 09:30→10:00')
    assert.ok(!result.slots.includes('09:30'), '09:30 bloqueado — idêntico ao início do bloco ocupado')
    assert.ok(result.slots.includes('10:00'), '10:00 disponível — depois do bloco ocupado')
  })

  it('[REQ-D3] agendamentos cancelados e soft-deleted não bloqueiam slots', () => {
    const existing: ExistingAppointmentWindow[] = [
      { start_time: '09:00:00', duration_minutes: 30, status: 'cancelado', deleted_at: null },
      { start_time: '09:30:00', duration_minutes: 30, status: 'confirmado', deleted_at: '2026-04-01T00:00:00Z' },
    ]
    const result = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH({ open_time: '09:00:00', close_time: '11:00:00' }),
      specialSchedule: null,
      existingAppointments: existing,
      now: PAST,
    })
    assert.ok(result.slots.includes('09:00'))
    assert.ok(result.slots.includes('09:30'))
  })

  it('[REQ-D4] intervalo de almoço remove slots que se sobrepõem a ele (boundary estrita)', () => {
    // Slot que TERMINA exatamente no início do almoço não conflita.
    // Slot que COMEÇA no início ou dentro do almoço é bloqueado.
    const result = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH({
        open_time: '09:00:00',
        close_time: '13:00:00',
        lunch_start: '12:00:00',
        lunch_end: '13:00:00',
      }),
      specialSchedule: null,
      now: PAST,
    })
    // 11:30→12:00: termina exatamente no início do almoço → disponível
    assert.ok(result.slots.includes('11:30'), '11:30 disponível — termina exatamente no início do almoço')
    // 12:00→12:30: começa no horário de almoço → bloqueado
    assert.ok(!result.slots.includes('12:00'), '12:00 bloqueado — sobrepõe o horário de almoço')
    assert.ok(result.slots.includes('11:00'))
  })

  it('[REQ-D5] data especial aberta usa seu próprio horário de funcionamento', () => {
    const result = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH({ open_time: '09:00:00', close_time: '18:00:00' }),
      specialSchedule: makeSS({
        date: DATE,
        is_closed: false,
        open_time: '10:00:00',
        close_time: '11:00:00',
      }),
      now: PAST,
    })
    assert.ok(!result.slots.includes('09:00'), 'horário especial sobrescreve o padrão')
    assert.ok(result.slots.includes('10:00'))
    assert.deepEqual(result.slots, ['10:00', '10:30'])
  })

  it('[REQ-D6] pausa bloqueia todos os slots do dia atual', () => {
    const today = '2026-04-13'
    const result = calculateAvailableSlots({
      date: today,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      isPaused: true,
      workingHours: makeWH(),
      specialSchedule: null,
      now: new Date(`${today}T09:00:00`),
    })
    assert.equal(result.slots.length, 0)
    assert.ok(result.error!.includes('pausa'))
  })

  it('[REQ-D7] pausa NÃO bloqueia datas futuras', () => {
    const result = calculateAvailableSlots({
      date: '2026-04-14', // amanhã
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      isPaused: true,
      workingHours: makeWH({ day_of_week: 2, is_open: true }), // terça
      specialSchedule: null,
      now: new Date('2026-04-13T09:00:00'),
    })
    assert.ok(result.slots.length > 0)
    assert.equal(result.error, undefined)
  })

  it('[REQ-D8] snapshot de agendamento tem precedência sobre duração do serviço relacionado', () => {
    const windows = normalizeAppointmentWindows([
      {
        start_time: '09:00:00',
        service_duration_minutes_snapshot: 60,
        services: { duration_minutes: 30 },
      },
      {
        start_time: '10:00:00',
        services: [{ duration_minutes: 45 }],
      },
      {
        start_time: '11:00:00',
        services: null,
      },
    ])
    assert.equal(windows[0].duration_minutes, 60, 'snapshot >  serviço relacionado')
    assert.equal(windows[1].duration_minutes, 45, 'array de serviços')
    assert.equal(windows[2].duration_minutes, 30, 'fallback de 30 min quando null')
  })
})

// ─── MÓDULO: CANCELAMENTO ────────────────────────────────────────────────────

describe('CANCELAMENTO — política e prazo de cancelamento', () => {
  it('[REQ-C1] deadline é calculado subtraindo a janela da hora do agendamento', () => {
    // Agendamento às 14:00 com janela de 120min → deadline às 12:00
    const deadline = getCancellationDeadline('2026-05-01', '14:00:00', 120)
    // Verificar apenas horas e minutos para evitar problemas de fuso horário
    const deadlineISO = deadline.toISOString()
    const deadlineDate = new Date('2026-05-01T12:00:00Z')
    // deadline deve ser 2h antes do horário do agendamento
    const appointmentTime = new Date('2026-05-01T14:00:00')
    const expectedDeadline = new Date(appointmentTime.getTime() - 120 * 60 * 1000)
    assert.equal(deadline.getTime(), expectedDeadline.getTime())
  })

  it('[REQ-C2] cancelamento bem antes do deadline é permitido', () => {
    const error = getCancellationPolicyError({
      status: 'confirmado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 60,
      now: new Date('2026-05-10T13:00:00'),
    })
    assert.equal(error, null)
  })

  it('[REQ-C3] cancelamento exatamente no deadline (00:00:00 de atraso) é permitido', () => {
    const error = getCancellationPolicyError({
      status: 'confirmado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 60,
      now: new Date('2026-05-10T14:00:00'), // exatamente no deadline
    })
    assert.equal(error, null)
  })

  it('[REQ-C4] cancelamento 1 segundo após o deadline é rejeitado', () => {
    const error = getCancellationPolicyError({
      status: 'confirmado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 60,
      now: new Date('2026-05-10T14:00:01'), // 1s tarde demais
    })
    assert.ok(error?.includes('Cancelamento nao permitido'))
  })

  it('[REQ-C5] agendamento já cancelado não pode ser cancelado novamente', () => {
    const error = getCancellationPolicyError({
      status: 'cancelado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 60,
      now: new Date('2026-05-10T10:00:00'),
    })
    assert.equal(error, 'Agendamento ja cancelado.')
  })

  it('[REQ-C6] agendamento com status "faltou" não pode ser cancelado', () => {
    const error = getCancellationPolicyError({
      status: 'faltou',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 60,
      now: new Date('2026-05-10T10:00:00'),
    })
    assert.equal(error, 'Agendamento ja cancelado.')
  })

  it('[REQ-C7] janela de 0 minutos permite cancelar até a hora do agendamento', () => {
    // Com janela 0: deadline = hora do agendamento
    const error = getCancellationPolicyError({
      status: 'confirmado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 0,
      now: new Date('2026-05-10T14:59:59'),
    })
    assert.equal(error, null)
  })
})

// ─── MÓDULO: ADMIN ───────────────────────────────────────────────────────────

describe('ADMIN — validação de configurações e cadastros', () => {
  it('[REQ-V1] horário de funcionamento fechado passa sem validação de horários', () => {
    assert.equal(validateWorkingHoursRow({ day_of_week: 1, is_open: false, open_time: null, close_time: null, lunch_start: null, lunch_end: null }), null)
  })

  it('[REQ-V2] dia aberto sem horários retorna erro', () => {
    assert.equal(
      validateWorkingHoursRow({ day_of_week: 1, is_open: true, open_time: null, close_time: null, lunch_start: null, lunch_end: null }),
      'Dia aberto exige horário de abertura e fechamento.'
    )
  })

  it('[REQ-V3] fechamento antes da abertura retorna erro', () => {
    assert.equal(
      validateWorkingHoursRow({ day_of_week: 1, is_open: true, open_time: '18:00:00', close_time: '09:00:00', lunch_start: null, lunch_end: null }),
      'O horário de fechamento precisa ser maior que o de abertura.'
    )
  })

  it('[REQ-V4] almoço com início sem fim retorna erro', () => {
    const result = validateWorkingHoursRow({
      day_of_week: 1, is_open: true,
      open_time: '09:00:00', close_time: '18:00:00',
      lunch_start: '12:00:00', lunch_end: null,
    })
    assert.equal(result, 'Preencha início e fim do almoço, ou deixe ambos vazios.')
  })

  it('[REQ-V5] almoço fora do horário de funcionamento retorna erro', () => {
    const result = validateWorkingHoursRow({
      day_of_week: 1, is_open: true,
      open_time: '09:00:00', close_time: '17:00:00',
      lunch_start: '16:30:00', lunch_end: '18:00:00', // ultrapassa o fechamento
    })
    assert.equal(result, 'O almoço precisa estar dentro do horário de funcionamento.')
  })

  it('[REQ-V6] configuração completa válida passa sem erros', () => {
    const result = validateWorkingHoursRow({
      day_of_week: 1, is_open: true,
      open_time: '09:00:00', close_time: '18:00:00',
      lunch_start: '12:00:00', lunch_end: '13:00:00',
    })
    assert.equal(result, null)
  })

  it('[REQ-V7] todos os intervalos de grade permitidos são aceitos: 5, 10, 15, 20, 30, 60', () => {
    for (const interval of [5, 10, 15, 20, 30, 60]) {
      assert.equal(validateBusinessConfigPatch({ slot_interval_minutes: interval }), null, `intervalo ${interval} deve ser válido`)
    }
  })

  it('[REQ-V8] intervalo de grade não permitido (ex: 25 min) é rejeitado', () => {
    assert.ok(validateBusinessConfigPatch({ slot_interval_minutes: 25 })!.includes('Intervalo de grade inválido'))
  })

  it('[REQ-V9] janela de cancelamento negativa é rejeitada', () => {
    assert.ok(validateBusinessConfigPatch({ cancellation_window_minutes: -1 })!.includes('não pode ser negativa'))
  })

  it('[REQ-V10] janela de cancelamento zero é aceita (sem prazo mínimo)', () => {
    assert.equal(validateBusinessConfigPatch({ cancellation_window_minutes: 0 }), null)
  })

  it('[REQ-V11] serviço sem nome é rejeitado', () => {
    assert.equal(validateServicePayload({ name: '', price: 30, duration_minutes: 30 }), 'O nome do serviço é obrigatório.')
  })

  it('[REQ-V12] serviço com preço negativo é rejeitado', () => {
    assert.equal(validateServicePayload({ name: 'Corte', price: -5, duration_minutes: 30 }), 'O preço do serviço deve ser zero ou maior.')
  })

  it('[REQ-V13] serviço com preço zero (gratuito) é aceito', () => {
    assert.equal(validateServicePayload({ name: 'Consulta', price: 0, duration_minutes: 15 }), null)
  })

  it('[REQ-V14] serviço com duração zero ou negativa é rejeitado', () => {
    assert.equal(validateServicePayload({ name: 'Corte', price: 30, duration_minutes: 0 }), 'A duração do serviço deve ser um número inteiro maior que zero.')
    assert.equal(validateServicePayload({ name: 'Corte', price: 30, duration_minutes: -15 }), 'A duração do serviço deve ser um número inteiro maior que zero.')
  })

  it('[REQ-V15] HH:mm normaliza para HH:mm:ss corretamente', () => {
    assert.equal(normalizeTimeValue('09:00'), '09:00:00')
    assert.equal(normalizeTimeValue('09:00:00'), '09:00:00')
    assert.equal(normalizeTimeValue('23:59'), '23:59:00')
  })

  it('[REQ-V16] agenda especial fechada não precisa de horário', () => {
    assert.equal(validateSpecialSchedulePayload({ is_closed: true }), null)
  })

  it('[REQ-V17] agenda especial aberta sem horário é rejeitada', () => {
    assert.ok(validateSpecialSchedulePayload({ is_closed: false, open_time: null, close_time: '18:00:00' })!.includes('horário'))
  })
})

// ─── MÓDULO: PRODUTOS ────────────────────────────────────────────────────────

describe('PRODUTOS — regras de negocio para reservas da loja', () => {
  const USER_ID = 'user-1'
  const OTHER_USER = 'user-2'

  it('[REQ-P1] reserva de produto ativo e em estoque é permitida', () => {
    const error = validateReservarProduto(
      { is_active: true, reserve_enabled: true, stock_quantity: 5 },
      1,
      false
    )
    assert.equal(error, null)
  })

  it('[REQ-P2] produto inativo bloqueia nova reserva', () => {
    const error = validateReservarProduto(
      { is_active: false, reserve_enabled: true, stock_quantity: 5 },
      1,
      false
    )
    assert.equal(error, 'Produto indisponível.')
  })

  it('[REQ-P3] produto com reserva desabilitada bloqueia nova reserva', () => {
    const error = validateReservarProduto(
      { is_active: true, reserve_enabled: false, stock_quantity: 5 },
      1,
      false
    )
    assert.equal(error, 'Produto indisponível.')
  })

  it('[REQ-P4] estoque insuficiente bloqueia reserva', () => {
    const error = validateReservarProduto(
      { is_active: true, reserve_enabled: true, stock_quantity: 2 },
      3,
      false
    )
    assert.equal(error, 'Estoque insuficiente.')
  })

  it('[REQ-P5] produto com estoque ilimitado (-1) sempre permite reserva', () => {
    const error = validateReservarProduto(
      { is_active: true, reserve_enabled: true, stock_quantity: -1 },
      99,
      false
    )
    assert.equal(error, null)
  })

  it('[REQ-P6] reserva duplicada ativa bloqueia nova reserva do mesmo produto', () => {
    const error = validateReservarProduto(
      { is_active: true, reserve_enabled: true, stock_quantity: 10 },
      1,
      true // hasActiveReservation
    )
    assert.equal(error, 'Você já tem uma reserva ativa para este produto.')
  })

  it('[REQ-P7] quantidade zero ou negativa é rejeitada', () => {
    assert.equal(
      validateReservarProduto({ is_active: true, reserve_enabled: true, stock_quantity: 5 }, 0, false),
      'Quantidade inválida.'
    )
  })

  it('[REQ-P8] cancelamento de reserva própria com status "reservado" é permitido', () => {
    const error = validateCancelarReservaProduto(
      { client_id: USER_ID, quantity: 1, status: 'reservado' },
      USER_ID
    )
    assert.equal(error, null)
  })

  it('[REQ-P9] cancelamento de reserva de outro usuário é bloqueado', () => {
    const error = validateCancelarReservaProduto(
      { client_id: OTHER_USER, quantity: 1, status: 'reservado' },
      USER_ID
    )
    assert.equal(error, 'Não autorizado.')
  })

  it('[REQ-P10] cancelamento de reserva já cancelada é bloqueado', () => {
    const error = validateCancelarReservaProduto(
      { client_id: USER_ID, quantity: 1, status: 'cancelado' },
      USER_ID
    )
    assert.equal(error, 'Esta reserva não pode ser cancelada.')
  })

  it('[REQ-P11] reserva já retirada não pode ser cancelada', () => {
    const error = validateCancelarReservaProduto(
      { client_id: USER_ID, quantity: 1, status: 'retirado' },
      USER_ID
    )
    assert.equal(error, 'Esta reserva não pode ser cancelada.')
  })

  it('[REQ-P12] atualização de quantidade para o mesmo valor é permitida (sem mudança de estoque)', () => {
    const error = validateAtualizarQuantidadeReserva(
      { client_id: USER_ID, quantity: 2, status: 'reservado' },
      USER_ID,
      5,     // currentStock
      2      // newQuantity (sem diferença)
    )
    assert.equal(error, null)
  })

  it('[REQ-P13] aumento de quantidade respeitando estoque disponível é permitido', () => {
    const error = validateAtualizarQuantidadeReserva(
      { client_id: USER_ID, quantity: 1, status: 'reservado' },
      USER_ID,
      3,   // currentStock
      4    // newQuantity — diff +3 <= stock 3
    )
    assert.equal(error, null)
  })

  it('[REQ-P14] aumento de quantidade acima do estoque disponível é bloqueado', () => {
    const error = validateAtualizarQuantidadeReserva(
      { client_id: USER_ID, quantity: 1, status: 'reservado' },
      USER_ID,
      1,   // currentStock (apenas 1 em estoque)
      5    // newQuantity — diff +4 > stock 1
    )
    assert.equal(error, 'Estoque insuficiente para aumentar a quantidade.')
  })

  it('[REQ-P15] diminuição de quantidade sempre permitida (devolve estoque)', () => {
    const error = validateAtualizarQuantidadeReserva(
      { client_id: USER_ID, quantity: 5, status: 'reservado' },
      USER_ID,
      0,   // currentStock (não importa: diff é negativo)
      2    // newQuantity — diff -3 (devolução)
    )
    assert.equal(error, null)
  })

  it('[REQ-P16] produto com estoque ilimitado permite qualquer aumento de quantidade', () => {
    const error = validateAtualizarQuantidadeReserva(
      { client_id: USER_ID, quantity: 1, status: 'reservado' },
      USER_ID,
      -1,  // stock -1 = ilimitado
      100
    )
    assert.equal(error, null)
  })

  it('[REQ-P17] produto sem nome é rejeitado no admin', () => {
    assert.equal(validateProductPayload({ name: '', price: 50, stock_quantity: 10 }), 'O nome do produto é obrigatório.')
  })

  it('[REQ-P18] produto com preço negativo é rejeitado no admin', () => {
    assert.equal(validateProductPayload({ name: 'Pomada', price: -1, stock_quantity: 10 }), 'O preço do produto deve ser zero ou maior.')
  })

  it('[REQ-P19] produto com estoque ilimitado (-1) é aceito no admin', () => {
    assert.equal(validateProductPayload({ name: 'Pomada', price: 35, stock_quantity: -1 }), null)
  })
})

// ─── MÓDULO: BLOQUEIO ────────────────────────────────────────────────────────

describe('BLOQUEIO — construção de filtros de dispositivos bloqueados', () => {
  it('[REQ-B1] usuário + telefone gera filtro OR combinado', () => {
    const lookup = buildBlockedDeviceLookup({ userId: 'u-1', phone: '11999998888' })
    assert.equal(lookup.kind, 'or')
    if (lookup.kind === 'or') {
      assert.ok(lookup.filter.includes('u-1'))
      assert.ok(lookup.filter.includes('11999998888'))
    }
  })

  it('[REQ-B2] somente userId gera filtro por session_id', () => {
    const lookup = buildBlockedDeviceLookup({ userId: 'u-1' })
    assert.equal(lookup.kind, 'eq')
    if (lookup.kind === 'eq') {
      assert.equal(lookup.field, 'session_id')
      assert.equal(lookup.value, 'u-1')
    }
  })

  it('[REQ-B3] somente telefone gera filtro por phone (apenas dígitos)', () => {
    const lookup = buildBlockedDeviceLookup({ phone: '(11) 99999-8888' })
    assert.equal(lookup.kind, 'eq')
    if (lookup.kind === 'eq') {
      assert.equal(lookup.field, 'phone')
      assert.equal(lookup.value, '11999998888')
    }
  })

  it('[REQ-B4] sem identificador retorna kind "none"', () => {
    const lookup = buildBlockedDeviceLookup({})
    assert.equal(lookup.kind, 'none')
  })
})

// ─── MÓDULO: SINCRONIZAÇÃO ───────────────────────────────────────────────────

describe('SINCRONIZAÇÃO — chave de cache de disponibilidade', () => {
  const baseInput = {
    workingHours: [makeWH()],
    specialSchedules: [],
    isPaused: false,
    slotIntervalMinutes: 15,
    barberId: 'b-1',
  }

  it('[REQ-S1] a chave muda quando algum horário de funcionamento muda', () => {
    const key1 = buildAvailabilitySyncKey(baseInput)
    const key2 = buildAvailabilitySyncKey({
      ...baseInput,
      workingHours: [makeWH({ close_time: '20:00:00' })],
    })
    assert.notEqual(key1, key2)
  })

  it('[REQ-S2] a chave muda quando uma data especial é adicionada', () => {
    const key1 = buildAvailabilitySyncKey(baseInput)
    const key2 = buildAvailabilitySyncKey({
      ...baseInput,
      specialSchedules: [makeSS()],
    })
    assert.notEqual(key1, key2)
  })

  it('[REQ-S3] estado de pausa altera a chave', () => {
    const key1 = buildAvailabilitySyncKey(baseInput)
    const key2 = buildAvailabilitySyncKey({ ...baseInput, isPaused: true })
    assert.notEqual(key1, key2)
  })

  it('[REQ-S4] mudança de barbeiro altera a chave', () => {
    const key1 = buildAvailabilitySyncKey(baseInput)
    const key2 = buildAvailabilitySyncKey({ ...baseInput, barberId: 'b-2' })
    assert.notEqual(key1, key2)
  })

  it('[REQ-S5] sem barbeiro usa "none" como componente da chave', () => {
    const key = buildAvailabilitySyncKey({ ...baseInput, barberId: null })
    assert.ok(key.includes('none'))
  })
})

// ─── MÓDULO: FLUXO INTEGRADO ─────────────────────────────────────────────────

describe('FLUXO INTEGRADO — cenários reais de uso combinando múltiplos módulos', () => {
  it('[REQ-I1] fluxo feliz completo: data aberta → slots disponíveis → agendamento criado', () => {
    const DATE = '2026-05-04' // segunda-feira
    const now = new Date('2026-04-28T10:00:00') // uma semana antes

    // 1. Verificar data
    const wh = [makeWH({ day_of_week: 1, is_open: true })]
    assert.equal(isBookingDateDisabled(new Date(DATE), wh, [], now), false)

    // 2. Calcular slots
    const { slots } = calculateAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH({ day_of_week: 1 }),
      specialSchedule: null,
      existingAppointments: [],
      now,
    })
    assert.ok(slots.length > 0)
    assert.ok(slots.includes('09:00'))

    // 3. Validar criação
    const guardError = getCreateAppointmentStateError({
      serviceIsActive: true,
      barberIsActive: true,
      availableSlots: slots,
      requestedTime: '09:00',
    })
    assert.equal(guardError, null)
  })

  it('[REQ-I2] fluxo de feriado: data bloqueada → sem slots exibidos', () => {
    const HOLIDAY = '2026-05-04'
    const now = new Date('2026-04-28T10:00:00')

    // 1. Data bloqueada por agenda especial
    // Usa horário ao meio-dia para evitar problemas de fuso horário na comparação de data
    const ss = [makeSS({ date: HOLIDAY, is_closed: true })]
    assert.equal(isBookingDateDisabled(new Date(`${HOLIDAY}T12:00:00`), [], ss, now), true)

    // 2. Cálculo confirma: sem slots
    const { slots, error } = calculateAvailableSlots({
      date: HOLIDAY,
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: makeWH(),
      specialSchedule: makeSS({ date: HOLIDAY, is_closed: true }),
      now,
    })
    assert.equal(slots.length, 0)
    assert.ok(error!.includes('fechada'))
  })

  it('[REQ-I3] fluxo de cancelamento dentro do prazo é completamente autorizado', () => {
    // Agendamento às 15:00, janela 120min → deadline 13:00
    const error = getCancellationPolicyError({
      status: 'confirmado',
      appointmentDate: '2026-05-10',
      appointmentStartTime: '15:00:00',
      cancellationWindowMinutes: 120,
      now: new Date('2026-05-10T11:00:00'), // 2h antes do deadline → ok
    })
    assert.equal(error, null)
  })

  it('[REQ-I4] fluxo de reserva de produto: estoque controlado ponta a ponta', () => {
    const PRODUCT = { is_active: true, reserve_enabled: true, stock_quantity: 2 }

    // Usuário 1 reserva 1 unidade
    assert.equal(validateReservarProduto(PRODUCT, 1, false), null)

    // Estoque cai para 1 (simulado)
    const afterFirst = { ...PRODUCT, stock_quantity: 1 }

    // Usuário 2 tenta reservar 2 unidades → sem estoque
    assert.equal(validateReservarProduto(afterFirst, 2, false), 'Estoque insuficiente.')

    // Usuário 2 reserva 1 unidade → ok
    assert.equal(validateReservarProduto(afterFirst, 1, false), null)
  })
})
