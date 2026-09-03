import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  activeSorted,
  activeCount,
  computePosition,
  computeEstimateMinutes,
  type QueueEntryForCalc,
} from './queue-engine'

function entry(
  id: string,
  joined_at: string,
  status: QueueEntryForCalc['status'] = 'aguardando',
  dur: number | null = null,
): QueueEntryForCalc {
  return { id, joined_at, status, service_duration_minutes_snapshot: dur }
}

describe('queue-engine', () => {
  const base = [
    entry('a', '2026-12-24T09:00:00Z', 'chamado', 30),
    entry('b', '2026-12-24T09:05:00Z', 'aguardando', 20),
    entry('c', '2026-12-24T09:10:00Z', 'aguardando', 40),
    entry('d', '2026-12-24T08:50:00Z', 'atendido', 30), // já atendido, sai da conta
    entry('e', '2026-12-24T09:02:00Z', 'desistiu', 30),  // desistiu, sai da conta
  ]

  it('ordena apenas os ativos por chegada', () => {
    assert.deepEqual(activeSorted(base).map((e) => e.id), ['a', 'b', 'c'])
  })

  it('conta só os ativos', () => {
    assert.equal(activeCount(base), 3)
  })

  it('posição: 0 para o atual, N para quem está atrás', () => {
    assert.equal(computePosition(base, 'a'), 0)
    assert.equal(computePosition(base, 'b'), 1)
    assert.equal(computePosition(base, 'c'), 2)
  })

  it('posição -1 para quem não está ativo', () => {
    assert.equal(computePosition(base, 'd'), -1)
    assert.equal(computePosition(base, 'z'), -1)
  })

  it('estimativa soma as durações reais de quem está à frente', () => {
    // c tem a(30) + b(20) na frente = 50 min
    assert.equal(computeEstimateMinutes(base, 'c', 30), 50)
    // b tem só a(30) na frente
    assert.equal(computeEstimateMinutes(base, 'b', 30), 30)
    // a é o atual → 0
    assert.equal(computeEstimateMinutes(base, 'a', 30), 0)
  })

  it('estimativa usa o tempo médio como fallback quando falta a duração', () => {
    const semDur = [
      entry('x', '2026-12-24T09:00:00Z', 'chamado', null),
      entry('y', '2026-12-24T09:05:00Z', 'aguardando', null),
      entry('z', '2026-12-24T09:10:00Z', 'aguardando', null),
    ]
    // z tem 2 pessoas à frente sem duração → 2 × 30 (avg) = 60
    assert.equal(computeEstimateMinutes(semDur, 'z', 30), 60)
  })
})
