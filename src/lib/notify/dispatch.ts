import { firePushToUser } from '@/app/api/push/actions'
import { sendWhatsApp } from './whatsapp'

// ─── Central de notificações ao cliente ───────────────────────────────────
// TODO o sistema (lembretes de agendamento, confirmações, fila, "você é o
// próximo"...) deve notificar por AQUI. Assim, ativar o WhatsApp (ver
// whatsapp.ts) acende o canal para TUDO de uma vez, sem caçar cada ponto.

export interface NotifyTarget {
  /** userId (auth, anônimo ou logado) para PWA push. */
  userId?: string | null
  /** Telefone para WhatsApp (canal dormente hoje). */
  phone?: string | null
}

export interface NotifyContent {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Dispara a notificação por todos os canais disponíveis (push + WhatsApp quando ativo). */
export async function notifyClient(target: NotifyTarget, content: NotifyContent): Promise<void> {
  if (target.userId) {
    void firePushToUser(target.userId, {
      title: content.title,
      body: content.body,
      url: content.url,
      tag: content.tag,
    })
  }
  if (target.phone) {
    void sendWhatsApp({ phone: target.phone, text: `${content.title}\n${content.body}` })
  }
}
