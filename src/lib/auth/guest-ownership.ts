// ────────────────────────────────────────────────────────────────────────────
// POSSE DE AGENDAMENTO PARA VISITANTE (sem login).
//
// Modelo ANTIGO (falha de segurança corrigida em 05/09/2026):
//   dono = "quem digitar o telefone escrito no agendamento".
//   O telefone é um dado de CONTATO, não uma credencial: não há SMS, não há
//   código, não há prova nenhuma. Bastava agendar uma vez digitando o número
//   de outra pessoa para passar a ver e cancelar TODOS os agendamentos dela.
//   Foi assim que um cliente cancelou 3 agendamentos que não eram dele.
//
// Modelo NOVO:
//   dono = "o aparelho que criou o agendamento".
//   Ao concluir um agendamento, o servidor grava no cookie o ID daquele
//   agendamento, assinado com HMAC. Sem a assinatura correta o cookie é
//   descartado — não adianta editar no navegador.
//
// Quem entra com o Google continua identificado por client_id e funciona em
// qualquer aparelho; isto aqui vale só para quem agenda sem conta.
// ────────────────────────────────────────────────────────────────────────────

export const GUEST_BOOKING_IDS_COOKIE = 'guest_booking_ids'

/** Teto de IDs guardados por aparelho. Evita cookie gigante. */
const MAX_IDS = 40

/** Só aceitamos UUID. Blindagem extra contra injeção no filtro do PostgREST. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Chave de assinatura. Usa um segredo dedicado quando existir; senão cai na
 * service role, que já é obrigatória para o app funcionar e nunca sai do
 * servidor. Sem segredo nenhum, retorna vazio e o modo visitante simplesmente
 * não guarda posse — falha FECHADA, nunca emitindo token forjável.
 */
function signingKey(): string {
  return (
    process.env.GUEST_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

// Web Crypto em vez de node:crypto: a home (src/app/page.tsx) roda no runtime
// Edge, onde os modulos do Node nao existem. crypto.subtle esta disponivel
// tanto no Node 20+ quanto no Edge — por isso as funcoes abaixo sao async.
async function sign(payload: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const chave = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(payload))
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Compara em tempo constante. Nunca sai antes da hora ao achar diferenca. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Monta o valor do cookie: "<ids>.<assinatura>". String vazia = não gravar. */
export async function serializeGuestIds(ids: string[]): Promise<string> {
  const key = signingKey()
  if (!key) return ''
  // Deduplica mantendo a ULTIMA ocorrencia: assim o corte em MAX_IDS descarta
  // sempre o mais antigo, e reagendar o mesmo ID o traz de volta para o fim.
  const validos = ids.filter((id) => UUID_RE.test(id))
  const limpos = [...new Set(validos.slice().reverse())].reverse().slice(-MAX_IDS)
  if (limpos.length === 0) return ''
  const payload = limpos.join(',')
  return `${payload}.${await sign(payload, key)}`
}

/** Lê e VALIDA o cookie. Assinatura inválida ou ausente devolve lista vazia. */
export async function parseGuestIds(raw: string | undefined | null): Promise<string[]> {
  if (!raw) return []
  const key = signingKey()
  if (!key) return []

  // UUID não contém ponto, então o último ponto separa assinatura do conteúdo.
  const corte = raw.lastIndexOf('.')
  if (corte <= 0) return []

  const payload = raw.slice(0, corte)
  const assinatura = raw.slice(corte + 1)
  if (!safeEqual(assinatura, await sign(payload, key))) return []

  return payload.split(',').filter((id) => UUID_RE.test(id)).slice(-MAX_IDS)
}

/** Acrescenta um agendamento à posse deste aparelho. */
export async function appendGuestId(raw: string | undefined | null, novoId: string): Promise<string> {
  return serializeGuestIds([...(await parseGuestIds(raw)), novoId])
}

/**
 * Filtro de posse do PostgREST (vírgula = OR).
 *
 * Retorna null quando não há NENHUMA prova de posse — e quem chama deve
 * tratar isso como "nada encontrado", jamais executar a consulta sem filtro:
 * um `.or()` vazio devolveria a agenda inteira da barbearia.
 */
export function buildOwnershipFilter(
  userId: string | null,
  guestAppointmentIds: string[]
): string | null {
  const partes: string[] = []
  if (userId) partes.push(`client_id.eq.${userId}`)

  const ids = guestAppointmentIds.filter((id) => UUID_RE.test(id))
  if (ids.length > 0) partes.push(`id.in.(${ids.join(',')})`)

  return partes.length > 0 ? partes.join(',') : null
}

/** Opções do cookie. httpOnly: JS da página não lê nem escreve. */
export const GUEST_IDS_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 180,
}
