import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getReservationHistoryCalendarMeta, isReservationHistoryEntry } from './reservation-history'

describe('reservation history', () => {
  it('inclui no historico reservas antigas e status finalizados mesmo em datas futuras', () => {
    assert.equal(
      isReservationHistoryEntry(
        { date: '2026-04-10', status: 'confirmado' },
        '2026-04-13'
      ),
      true
    )

    assert.equal(
      isReservationHistoryEntry(
        { date: '2026-04-20', status: 'cancelado' },
        '2026-04-13'
      ),
      true
    )

    assert.equal(
      isReservationHistoryEntry(
        { date: '2026-04-20', status: 'concluido' },
        '2026-04-13'
      ),
      true
    )
  })

  it('mantem fora do historico reservas ativas futuras', () => {
    assert.equal(
      isReservationHistoryEntry(
        { date: '2026-04-20', status: 'confirmado' },
        '2026-04-13'
      ),
      false
    )

    assert.equal(
      isReservationHistoryEntry(
        { date: '2026-04-20', status: 'aguardando_pagamento' },
        '2026-04-13'
      ),
      false
    )
  })

  it('calcula o alcance do calendario a partir da primeira e da ultima reserva do historico', () => {
    const meta = getReservationHistoryCalendarMeta(
      [
        { date: '2025-10-10', status: 'concluido' },
        { date: '2026-04-20', status: 'cancelado' },
        { date: '2026-04-01', status: 'faltou' },
      ],
      new Date('2026-04-13T09:00:00')
    )

    assert.deepEqual(meta.selectableDateKeys, ['2025-10-10', '2026-04-01', '2026-04-20'])
    assert.equal(meta.selectedDate?.toISOString(), '2026-04-20T15:00:00.000Z')
    assert.equal(meta.startMonth.toISOString(), '2025-10-01T15:00:00.000Z')
    assert.equal(meta.endMonth.toISOString(), '2026-04-01T15:00:00.000Z')
  })
})