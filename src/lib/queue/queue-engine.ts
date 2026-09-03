import type { QueueEntry, QueueEntryStatus } from '@/lib/supabase/types'

// Lógica pura da fila — sem I/O, testável isoladamente (mesmo padrão do
// availability-engine). As server actions montam os dados e chamam estas funções.

export type QueueEntryForCalc = Pick<
  QueueEntry,
  'id' | 'joined_at' | 'status' | 'service_duration_minutes_snapshot'
>

const ACTIVE_STATUSES: QueueEntryStatus[] = ['aguardando', 'chamado']

/** Entradas ativas (aguardando/chamado) ordenadas por ordem de chegada. */
export function activeSorted(entries: QueueEntryForCalc[]): QueueEntryForCalc[] {
  return entries
    .filter((e) => ACTIVE_STATUSES.includes(e.status))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
}

/**
 * Posição na fila:
 *   0  = é o próximo / está sendo atendido (ninguém ativo na frente)
 *   N  = tem N pessoas ativas na frente
 *  -1  = não está na fila ativa (já atendido, desistiu, ausente ou inexistente)
 */
export function computePosition(entries: QueueEntryForCalc[], entryId: string): number {
  return activeSorted(entries).findIndex((e) => e.id === entryId)
}

/** Quantas pessoas ativas há na fila no total. */
export function activeCount(entries: QueueEntryForCalc[]): number {
  return activeSorted(entries).length
}

/**
 * Estimativa em minutos até ser atendido. Soma a duração real de quem está à
 * frente quando disponível; usa o tempo médio configurado como fallback.
 * Retorna 0 quando a pessoa é a próxima/atual.
 */
export function computeEstimateMinutes(
  entries: QueueEntryForCalc[],
  entryId: string,
  avgServiceMinutes: number,
): number {
  const ordered = activeSorted(entries)
  const idx = ordered.findIndex((e) => e.id === entryId)
  if (idx <= 0) return 0

  let minutes = 0
  for (let i = 0; i < idx; i++) {
    const d = ordered[i].service_duration_minutes_snapshot
    minutes += d && d > 0 ? d : avgServiceMinutes
  }
  return minutes
}
