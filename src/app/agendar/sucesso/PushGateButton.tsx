'use client'

/**
 * PushGateButton — o "segredo dos sites de spam" aplicado legitimamente.
 *
 * O usuário clica em "Ver minhas reservas" porque QUER ver as reservas.
 * Dentro desse handler (user gesture), chamamos requestPermission() ANTES de navegar.
 * O browser abre o diálogo nativo de permissão no contexto do clique → alta taxa de "Allow".
 *
 * Se permissão já foi decidida (granted/denied): navega direto.
 * Se usuário clica "Block" no diálogo nativo: navega mesmo assim (semprioridade).
 * Se erro: navega sem push, sem bloquear o usuário.
 */

import { useState } from 'react'
import { savePushSubscription } from '@/app/api/push/actions'
import { ensurePushBrowserSession } from '@/lib/push/browser-session'
import { toast } from 'sonner'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

async function tryActivatePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'default') return

  try {
    // requestPermission() dentro do handler de clique = user gesture → alta taxa de Allow
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const pushSession = await ensurePushBrowserSession()
    if (pushSession.created) {
      console.info('[PushGateButton] sessão anônima criada', { kind: pushSession.sessionKind })
    }

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    })
    const subJson = sub.toJSON()
    const result = await savePushSubscription({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? '',
      },
    })

    if (!result.success) {
      console.warn('[PushGateButton] falha ao salvar subscription', result.error)
      await sub.unsubscribe().catch(() => {})
      return
    }

    // Injeta VAPID no SW
    const sw = reg.active ?? reg.waiting ?? reg.installing
    if (sw && VAPID_PUBLIC_KEY) {
      sw.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
    }

    toast.success('✅ Avisos ativados! Você receberá lembretes antes do horário.')
  } catch (e) {
    // Nunca bloqueia a navegação — push é opcional
    console.error('[PushGateButton] erro (não bloqueia navegação)', e)
  }
}

interface Props {
  href: string
  label?: string
  className?: string
}

export function PushGateButton({ href, label = 'Ver minhas reservas', className }: Props) {
  const [loading, setLoading] = useState(false)

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Só intercepta se o usuário ainda não decidiu sobre notificações
    if (typeof Notification !== 'undefined' && Notification.permission === 'default' && VAPID_PUBLIC_KEY) {
      e.preventDefault()
      setLoading(true)
      await tryActivatePush()
      setLoading(false)
      // Navega após o diálogo ser respondido (Allow ou Block)
      window.location.href = href
    }
    // Caso contrário: link funciona normalmente (permissão já decidida ou push indisponível)
  }

  return (
    <a
      href={href}
      onClick={(e) => void handleClick(e)}
      className={className}
    >
      {loading ? 'Ativando avisos...' : label}
    </a>
  )
}
