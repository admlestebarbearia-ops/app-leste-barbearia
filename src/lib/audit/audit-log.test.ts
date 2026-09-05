import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { describeAppointment } from './log'

describe('describeAppointment', () => {
  // Este resumo é a ÚNICA memória que sobra depois de um "Apagar permanente":
  // a linha do agendamento some do banco e entity_id passa a apontar para nada.
  // Por isso ele precisa carregar dia, hora, serviço e quem era, sempre.
  test('monta o resumo no formato dia/mês hora · serviço · cliente', () => {
    assert.equal(
      describeAppointment({
        date: '2026-09-05',
        start_time: '14:30:00',
        service_name_snapshot: 'Corte',
        client_name: 'João',
      }),
      '05/09 14:30 · Corte · João'
    )
  })

  test('usa o telefone quando não há nome', () => {
    assert.equal(
      describeAppointment({
        date: '2026-12-24',
        start_time: '09:00',
        service_name_snapshot: 'Barba',
        client_name: null,
        client_phone: '11999998888',
      }),
      '24/12 09:00 · Barba · 11999998888'
    )
  })

  test('cai no nome do serviço relacionado quando não há snapshot', () => {
    assert.equal(
      describeAppointment({
        date: '2026-01-02',
        start_time: '08:15',
        services: { name: 'Cabelo + Barba' },
        client_name: 'Ana',
      }),
      '02/01 08:15 · Cabelo + Barba · Ana'
    )
  })

  test('nome só com espaços não vira o nome exibido', () => {
    assert.equal(
      describeAppointment({
        date: '2026-03-10',
        start_time: '10:00',
        service_name_snapshot: 'Corte',
        client_name: '   ',
        client_phone: '11911112222',
      }),
      '10/03 10:00 · Corte · 11911112222'
    )
  })

  test('nunca lança, mesmo com o registro todo vazio', () => {
    assert.doesNotThrow(() => describeAppointment({}))
    assert.equal(describeAppointment({}), '?? ?? · serviço · sem nome')
  })
})
