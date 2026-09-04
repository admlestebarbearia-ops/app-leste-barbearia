'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { firePushToAdmins } from '@/app/api/push/actions'
import { notifyClient } from '@/lib/notify/dispatch'
import {
  computePosition,
  computeEstimateMinutes,
  activeCount,
  type QueueEntryForCalc,
} from '@/lib/queue/queue-engine'
import type { QueueDay, QueueEntry, QueueMode } from '@/lib/supabase/types'

// Verificação de admin local (mesmo comportamento do painel).
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nao autenticado.')
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) throw new Error('Sem permissao.')
  return { supabase, user }
}

// ─── Público / cliente ────────────────────────────────────────────────

/** Retorna a config de fila do dia se estiver ativa; senão null. */
export async function getActiveQueueDay(date: string): Promise<QueueDay | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('queue_days')
    .select('*')
    .eq('date', date)
    .eq('is_active', true)
    .maybeSingle()
  return (data as QueueDay | null) ?? null
}

/** Entrar na fila do dia. Retorna a entrada + posição + estimativa. */
export async function joinQueue(input: {
  date: string
  serviceId?: string | null
  name?: string | null
  phone?: string | null
}): Promise<{
  success: boolean
  error?: string
  entryId?: string
  position?: number
  estimateMinutes?: number
}> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Dia precisa estar em modo fila ativo.
    const { data: qday } = await admin
      .from('queue_days')
      .select('*')
      .eq('date', input.date)
      .eq('is_active', true)
      .maybeSingle()
    if (!qday) return { success: false, error: 'A fila não está aberta para este dia.' }
    if ((qday as { accepting_joins?: boolean }).accepting_joins === false) {
      return { success: false, error: 'A fila está cheia no momento. Volte em alguns minutos — pode abrir vaga.' }
    }

    const { data: { user } } = await supabase.auth.getUser()

    // Snapshot do serviço (para estimativa por duração real).
    let serviceName: string | null = null
    let serviceDuration: number | null = null
    if (input.serviceId) {
      const { data: svc } = await admin
        .from('services')
        .select('name, duration_minutes')
        .eq('id', input.serviceId)
        .maybeSingle()
      serviceName = svc?.name ?? null
      serviceDuration = svc?.duration_minutes ?? null
    }

    // Evita duplicata: já está ativo na fila do dia?
    if (user) {
      const { data: existing } = await admin
        .from('queue_entries')
        .select('id')
        .eq('date', input.date)
        .eq('client_id', user.id)
        .in('status', ['aguardando', 'chamado'])
        .maybeSingle()
      if (existing) return { success: false, error: 'Você já está na fila deste dia.' }
    } else {
      if (!input.name?.trim() || !input.phone?.trim()) {
        return { success: false, error: 'Informe nome e telefone para entrar na fila.' }
      }
      const { data: existing } = await admin
        .from('queue_entries')
        .select('id')
        .eq('date', input.date)
        .eq('client_phone', input.phone.trim())
        .in('status', ['aguardando', 'chamado'])
        .maybeSingle()
      if (existing) return { success: false, error: 'Este telefone já está na fila deste dia.' }
    }

    const insertRow = {
      date: input.date,
      client_id: user?.id ?? null,
      client_name: user ? null : input.name?.trim() ?? null,
      client_phone: user ? null : input.phone?.trim() ?? null,
      service_id: input.serviceId ?? null,
      service_name_snapshot: serviceName,
      service_duration_minutes_snapshot: serviceDuration,
    }

    const { data: inserted, error: insErr } = await supabase
      .from('queue_entries')
      .insert(insertRow)
      .select('id')
      .single()
    if (insErr) throw insErr

    const entryId = (inserted as { id: string }).id
    const status = await getMyQueueStatus(entryId)

    // Avisa o admin que entrou alguém na fila.
    void firePushToAdmins({
      title: '👥 Novo na fila',
      body: `${serviceName ?? 'Cliente'} entrou na fila de hoje.`,
      url: '/admin',
      tag: `queue-join-${input.date}`,
    })

    revalidatePath('/admin')
    return {
      success: true,
      entryId,
      position: status.position,
      estimateMinutes: status.estimateMinutes,
    }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Status atual de uma entrada (posição, estimativa, situação). Serve para anon (via entryId). */
export async function getMyQueueStatus(entryId: string): Promise<{
  found: boolean
  status?: QueueEntry['status']
  position?: number
  estimateMinutes?: number
  mode?: QueueMode
  activeAhead?: number
}> {
  const admin = createAdminClient()

  const { data: entry } = await admin
    .from('queue_entries')
    .select('id, date, status')
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) return { found: false }

  const e = entry as { id: string; date: string; status: QueueEntry['status'] }

  const [{ data: qday }, { data: all }] = await Promise.all([
    admin.from('queue_days').select('mode, avg_service_minutes').eq('date', e.date).maybeSingle(),
    admin
      .from('queue_entries')
      .select('id, joined_at, status, service_duration_minutes_snapshot')
      .eq('date', e.date),
  ])

  const avg = (qday as { avg_service_minutes?: number } | null)?.avg_service_minutes ?? 30
  const mode = ((qday as { mode?: QueueMode } | null)?.mode ?? 'estimativa') as QueueMode
  const entries = (all ?? []) as QueueEntryForCalc[]

  const position = computePosition(entries, entryId)
  return {
    found: true,
    status: e.status,
    position: position < 0 ? undefined : position,
    estimateMinutes: position < 0 ? undefined : computeEstimateMinutes(entries, entryId, avg),
    mode,
    activeAhead: position < 0 ? undefined : position,
  }
}

/** Vincula o alvo de notificação (userId da sessão de push) a uma entrada da fila. */
export async function setQueueNotifyTarget(
  entryId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('queue_entries')
      .update({ notify_user_id: userId })
      .eq('id', entryId)
    if (error) throw error
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Cliente desiste da fila. */
export async function leaveQueue(entryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('queue_entries')
      .update({ status: 'desistiu', finished_at: new Date().toISOString() })
      .eq('id', entryId)
      .in('status', ['aguardando', 'chamado'])
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ─── Admin ────────────────────────────────────────────────────────────

/** Ativa (ou atualiza) o modo fila em uma data. */
export async function activateQueueDay(
  date: string,
  opts: {
    mode?: QueueMode
    avgServiceMinutes?: number
    callMessage?: string | null
    leadMinutes?: number
    toleranceMinutes?: number
  } = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase.from('queue_days').upsert({
      date,
      is_active: true,
      accepting_joins: true,
      mode: opts.mode ?? 'estimativa',
      avg_service_minutes: opts.avgServiceMinutes && opts.avgServiceMinutes > 0 ? opts.avgServiceMinutes : 30,
      call_message: opts.callMessage?.trim() || null,
      lead_minutes: typeof opts.leadMinutes === 'number' && opts.leadMinutes >= 0 ? opts.leadMinutes : 15,
      tolerance_minutes: typeof opts.toleranceMinutes === 'number' && opts.toleranceMinutes >= 0 ? opts.toleranceMinutes : 10,
    })
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Abre ou fecha a entrada de novos clientes na fila (controle manual do barbeiro). */
export async function setQueueAccepting(
  date: string,
  accepting: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('queue_days')
      .update({ accepting_joins: accepting })
      .eq('date', date)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Desativa o modo fila em uma data. */
export async function deactivateQueueDay(date: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('queue_days')
      .update({ is_active: false })
      .eq('date', date)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Lista completa da fila do dia (admin). */
export async function listQueueForDay(date: string): Promise<{
  entries: QueueEntry[]
  active: number
  day: QueueDay | null
  error?: string
}> {
  try {
    const { supabase } = await requireAdmin()
    const [{ data: entries }, { data: day }] = await Promise.all([
      supabase.from('queue_entries').select('*').eq('date', date).order('joined_at', { ascending: true }),
      supabase.from('queue_days').select('*').eq('date', date).maybeSingle(),
    ])
    const list = (entries ?? []) as QueueEntry[]
    return {
      entries: list,
      active: activeCount(list as unknown as QueueEntryForCalc[]),
      day: (day as QueueDay | null) ?? null,
    }
  } catch (e) {
    return { entries: [], active: 0, day: null, error: (e as Error).message }
  }
}

/**
 * Avança a fila ("Próximo"): conclui quem está sendo atendido e chama o próximo.
 * Notifica quem foi chamado ("é a sua vez") e o novo próximo ("você é o próximo").
 */
export async function advanceQueue(date: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const now = new Date().toISOString()

    const { data: rows } = await supabase
      .from('queue_entries')
      .select('id, client_id, notify_user_id, client_phone, joined_at, status')
      .eq('date', date)
      .in('status', ['aguardando', 'chamado'])
      .order('joined_at', { ascending: true })

    const active = (rows ?? []) as Array<{ id: string; client_id: string | null; notify_user_id: string | null; client_phone: string | null; joined_at: string; status: string }>

    const pushTarget = (r: { client_id: string | null; notify_user_id: string | null }) =>
      r.notify_user_id ?? r.client_id

    // Conclui o atual (chamado).
    const current = active.find((r) => r.status === 'chamado')
    if (current) {
      await supabase
        .from('queue_entries')
        .update({ status: 'atendido', finished_at: now })
        .eq('id', current.id)
    }

    // Chama o próximo (primeiro aguardando).
    const next = active.find((r) => r.status === 'aguardando')
    if (next) {
      await supabase
        .from('queue_entries')
        .update({ status: 'chamado', called_at: now })
        .eq('id', next.id)
      void notifyClient({ userId: pushTarget(next), phone: next.client_phone }, {
        title: '💈 É a sua vez!',
        body: 'Se você está na barbearia, pode sentar na cadeira.',
        url: '/agendar',
        tag: `queue-called-${next.id}`,
      })
      // Avisa o novo "próximo" (segundo da fila) — com antecedência.
      const following = active.find((r) => r.status === 'aguardando' && r.id !== next.id)
      if (following) {
        void notifyClient({ userId: pushTarget(following), phone: following.client_phone }, {
          title: '⏳ Você é o próximo!',
          body: 'Venha para a barbearia com antecedência. Esteja aqui quando for sua vez, ou perde a vaga e vai para o fim da fila.',
          url: '/agendar',
          tag: `queue-next-${following.id}`,
        })
      }
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Marca uma entrada como atendida (sem avançar o resto). */
export async function markQueueServed(entryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('queue_entries')
      .update({ status: 'atendido', finished_at: new Date().toISOString() })
      .eq('id', entryId)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Marca uma entrada como ausente (não compareceu quando chamado). */
export async function markQueueAbsent(entryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from('queue_entries')
      .update({ status: 'ausente', finished_at: new Date().toISOString() })
      .eq('id', entryId)
    if (error) throw error
    revalidatePath('/admin')
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
