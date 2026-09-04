// ─── Canal WhatsApp — PRÉ-CABEADO e DESLIGADO ─────────────────────────────
// Toda notificação ao cliente já passa pela central (dispatch.ts). O WhatsApp
// é um canal a mais, hoje dormente. Para ATIVAR no futuro:
//   1. Definir WHATSAPP_ENABLED=true nas variáveis de ambiente.
//   2. Configurar o provedor (Evolution API self-host, ou WhatsApp Business API).
//   3. Implementar o envio dentro de sendWhatsApp() — é o ÚNICO ponto a mexer.
// Enquanto desligado, é um no-op silencioso (não envia nada, não quebra nada).

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === 'true'
}

export interface WhatsAppMessage {
  /** Telefone do destinatário (será normalizado para E.164 ao ativar). */
  phone: string
  text: string
}

export async function sendWhatsApp(
  msg: WhatsAppMessage,
): Promise<{ sent: boolean; skipped?: string }> {
  if (!isWhatsAppEnabled()) {
    return { sent: false, skipped: 'whatsapp_disabled' }
  }
  if (!msg.phone?.trim() || !msg.text?.trim()) {
    return { sent: false, skipped: 'dados_incompletos' }
  }

  // ── PONTO DE IMPLEMENTAÇÃO (ao ativar o provedor) ──
  // Evolution API (exemplo):
  //   const url = `${process.env.WHATSAPP_API_URL}/message/sendText/${process.env.WHATSAPP_INSTANCE}`
  //   await fetch(url, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', apikey: process.env.WHATSAPP_API_KEY! },
  //     body: JSON.stringify({ number: normalizePhone(msg.phone), text: msg.text }),
  //   })
  // Mantido sem envio real até a configuração existir.
  console.warn('[whatsapp] canal habilitado, mas envio ainda não implementado (aguardando provedor).')
  return { sent: false, skipped: 'nao_implementado' }
}
