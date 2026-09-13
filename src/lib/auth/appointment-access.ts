import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GUEST_BOOKING_IDS_COOKIE,
  buildOwnershipFilter,
  parseGuestIds,
} from '@/lib/auth/guest-ownership'

// ────────────────────────────────────────────────────────────────────────────
// Leitura de UM agendamento com verificação de posse — para Server Components.
//
// Motivo (IDOR confirmado em 13/09/2026): as telas de resultado
// (/agendar/sucesso, /agendar/pagamento/*) liam o agendamento SÓ pelo id da
// URL, com `select('*')` — sem checar quem estava pedindo. Quem tivesse o UUID
// (link compartilhado, histórico do navegador, referrer) via nome, telefone e
// e-mail do cliente. Não era enumerável, mas era acesso sem autorização.
//
// Aqui a posse é exigida de verdade, no servidor:
//   - usuário logado  → client_id = auth.uid()
//   - visitante       → id ∈ lista de IDs assinados por HMAC deste aparelho
//
// Usa service_role porque a RLS não consegue validar o cookie assinado; a
// autorização é o `ownershipFilter` aplicado na própria query.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Devolve o agendamento apenas se quem pediu for dono dele. Caso contrário,
 * `null` — que as telas tratam como "não encontrado" (sem revelar existência).
 */
export async function getOwnedAppointment(
  appointmentId: string,
  select = '*, services(name, price, duration_minutes)'
): Promise<Record<string, unknown> | null> {
  if (!appointmentId) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const guestAppointmentIds = await parseGuestIds(
    cookieStore.get(GUEST_BOOKING_IDS_COOKIE)?.value
  )

  // Vale tanto o login Google quanto a sessão anônima do Supabase: nos dois
  // casos o agendamento fica gravado com client_id = auth.uid().
  const ownershipFilter = buildOwnershipFilter(
    user?.id ?? null,
    guestAppointmentIds
  )
  // Sem nenhuma prova de posse não há o que mostrar.
  if (!ownershipFilter) return null

  const { data } = await createAdminClient()
    .from('appointments')
    .select(select)
    .eq('id', appointmentId)
    .or(ownershipFilter)
    .maybeSingle()

  return (data as Record<string, unknown> | null) ?? null
}
