import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Estrutura do payload Meta Cloud API ─────────────────────────────────────
// entry[0].changes[0].value.messages[0].text.body
interface MetaWebhookPayload {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          text?: { body?: string }
          type?: string
        }>
      }
    }>
  }>
}

/**
 * GET — Verificação do hub da Meta (CA11.1).
 * A Meta envia: hub.mode=subscribe, hub.verify_token e hub.challenge.
 * Retornamos apenas hub.challenge como texto plano para confirmar a URL.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.META_VERIFY_TOKEN
  if (!verifyToken) {
    return new NextResponse('META_VERIFY_TOKEN not configured', { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    // Resposta obrigatória: devolver o challenge como texto puro
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST — Recebe mensagens da Meta Cloud API.
 * Extrai o hash de opt-in e marca wa_opt_in=true no banco.
 */
export async function POST(req: NextRequest) {
  let body: MetaWebhookPayload
  try {
    body = await req.json()
  } catch {
    // Sempre retornar 200 para a Meta não re-entregar indefinidamente
    return NextResponse.json({ ok: true })
  }

  // Confirmar que é um webhook de WhatsApp
  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ ok: true })
  }

  // Extrair texto da primeira mensagem da primeira change
  const messageObj = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!messageObj || messageObj.type !== 'text') {
    return NextResponse.json({ ok: true })
  }

  const text = messageObj.text?.body ?? ''

  // ── Extrair hash do opt-in ─────────────────────────────────────────────────
  // Formato esperado: "...ID_abc12345"
  const match = text.match(/ID_([a-f0-9]{8})/i)
  if (!match) return NextResponse.json({ ok: true })

  const hash = match[1].toLowerCase()

  // ── Registrar opt-in + número do cliente no banco ──────────────────────────
  const adminClient = createAdminClient()
  const senderPhone = messageObj.from ?? null   // Ex: "5511999990000" (com DDI)

  await adminClient
    .from('appointments')
    .update({
      wa_opt_in: true,
      last_wa_interaction: new Date().toISOString(),
      // Atualiza o telefone se o agendamento era de guest sem telefone cadastrado
      ...(senderPhone ? { client_phone: senderPhone } : {}),
    })
    .eq('wa_hash', hash)

  // Sempre 200 — a Meta re-entrega em 4xx/5xx
  return NextResponse.json({ ok: true })
}
