import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// ────────────────────────────────────────────────────────────────────────────
// Trilha de auditoria.
//
// REGRA INEGOCIÁVEL: registrar NUNCA pode derrubar a operação. Se a gravação
// falhar — tabela ausente, rede fora, banco lento — o agendamento tem que
// acontecer do mesmo jeito. Por isso toda função aqui engole o próprio erro e
// nenhuma delas é aguardada por quem chama.
// ────────────────────────────────────────────────────────────────────────────

export type AuditActorType = 'admin' | 'cliente' | 'convidado' | 'sistema'

export type AuditAction =
  | 'agendamento.criou'
  | 'agendamento.cancelou'
  | 'agendamento.concluiu'
  | 'agendamento.marcou_falta'
  | 'agendamento.reativou'
  | 'agendamento.ocultou'
  | 'agendamento.apagou'
  | 'agendamento.estornou'
  | 'pagamento.aprovado'
  | 'pagamento.expirou'
  | 'cliente.bloqueou'
  | 'cliente.desbloqueou'
  | 'config.alterou'

export interface AuditActor {
  type: AuditActorType
  id?: string | null
  label?: string | null
}

export interface AuditInput {
  actor: AuditActor
  action: AuditAction
  entityId?: string | null
  entityType?: string
  /** Frase legível montada AGORA. Sobrevive ao apagamento do agendamento. */
  summary?: string | null
  details?: Record<string, unknown> | null
}

/** Lê IP e navegador do request atual. Nunca lança. */
async function readRequestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    // A Vercel entrega a cadeia de proxies; o primeiro item é o cliente real.
    const forwarded = h.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent')
    return { ip, userAgent: userAgent ? userAgent.slice(0, 400) : null }
  } catch {
    // Fora de um request (cron, webhook, script) não há cabeçalhos.
    return { ip: null, userAgent: null }
  }
}

/**
 * Grava uma entrada na trilha. Dispare sem `await` (ou com void) — o retorno
 * não interessa e o erro nunca sobe.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await readRequestContext()
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      actor_type: input.actor.type,
      actor_id: input.actor.id ?? null,
      actor_label: input.actor.label ?? null,
      action: input.action,
      entity_type: input.entityType ?? 'appointment',
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      details: input.details ?? null,
      ip,
      user_agent: userAgent,
    })
  } catch {
    // Silêncio proposital: a trilha é para investigação, não para o fluxo.
    // Se um dia não houver registro, seguimos a vida — como já é hoje.
  }
}

/** Atalho que garante que nada seja aguardado por engano. */
export function audit(input: AuditInput): void {
  void recordAudit(input)
}

/** Monta o resumo legível de um agendamento: "05/09 14:30 · Corte · João". */
export function describeAppointment(appt: {
  date?: string | null
  start_time?: string | null
  service_name_snapshot?: string | null
  services?: { name?: string | null } | null
  client_name?: string | null
  client_phone?: string | null
}): string {
  const data = appt.date ? appt.date.split('-').reverse().slice(0, 2).join('/') : '??'
  const hora = appt.start_time ? String(appt.start_time).slice(0, 5) : '??'
  const servico = appt.service_name_snapshot ?? appt.services?.name ?? 'serviço'
  const quem = appt.client_name?.trim() || appt.client_phone || 'sem nome'
  return `${data} ${hora} · ${servico} · ${quem}`
}
