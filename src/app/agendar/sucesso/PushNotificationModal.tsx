'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { savePushSubscription } from '@/app/api/push/actions'
import { ensurePushBrowserSession } from '@/lib/push/browser-session'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return !!(
    (navigator as unknown as Record<string, unknown>)['standalone'] ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

async function injectVapidKeyToSw(reg: ServiceWorkerRegistration) {
  const sw = reg.active ?? reg.waiting ?? reg.installing
  if (!sw || !VAPID_PUBLIC_KEY) return
  sw.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
}

export function PushNotificationModal() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // iOS fora do PWA: push não é suportado — não exibir
    if (isIos() && !isStandalone()) {
      console.info('[push/modal] hidden: ios requires installed PWA')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.info('[push/modal] hidden: push unsupported in browser')
      return
    }
    if (typeof Notification === 'undefined') {
      console.info('[push/modal] hidden: Notification API unavailable')
      return
    }
    // Só exibe se ainda não decidiram (nem granted nem denied)
    if (Notification.permission !== 'default') {
      console.info('[push/modal] hidden: permission already decided', { permission: Notification.permission })
      return
    }

    const timer = setTimeout(() => setVisible(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  async function handleActivate() {
    if (!VAPID_PUBLIC_KEY || loading) {
      console.warn('[push/modal] activation blocked: missing VAPID public key or already loading')
      if (!VAPID_PUBLIC_KEY) {
        toast.error('Avisos indisponíveis neste momento. Tente novamente mais tarde.')
      }
      return
    }

    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        const pushSession = await ensurePushBrowserSession()
        if (pushSession.created) {
          console.info('[push/modal] anonymous session created for push', { sessionKind: pushSession.sessionKind })
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
          console.warn('[push/modal] subscription save failed', { error: result.error ?? 'unknown' })
          toast.error('Permissão concedida, mas este aparelho não foi vinculado aos avisos.')
          await sub.unsubscribe().catch(() => {})
          return
        }

        if (result.linkedAppointments && result.linkedAppointments > 0) {
          console.info('[push/modal] guest appointments linked to push session', {
            linkedAppointments: result.linkedAppointments,
            sessionKind: result.sessionKind ?? null,
          })
        }

        await injectVapidKeyToSw(reg)
        toast.success('Avisos ativados neste aparelho.')
      } else if (permission === 'denied') {
        console.info('[push/modal] permission denied by user')
        toast.error('Notificações bloqueadas. Libere nas configurações do navegador para receber avisos.')
      } else {
        console.info('[push/modal] permission dismissed by user')
      }
    } catch (e) {
      console.error('[PushModal]', e)
      toast.error('Falha ao ativar os avisos neste aparelho.')
    } finally {
      setLoading(false)
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-4 pb-10 sm:pb-0"
      onClick={(e) => { if (e.target === e.currentTarget) setVisible(false) }}
    >
      <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-7 flex flex-col gap-5 shadow-2xl">

        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-5xl leading-none">🔔</span>
          <h2 className="text-xl font-black text-white leading-snug">
            ⚠️ Não perca seu horário!
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Para garantirmos sua vaga, ative as notificações. Avisaremos você{' '}
            <strong className="text-white">20, 10 e 5 minutos antes</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleActivate()}
          onTouchStart={() => {}}
          disabled={loading}
          style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' as unknown as string }}
          className="w-full h-14 rounded-xl bg-primary font-black text-white text-sm uppercase tracking-widest shadow-[0_0_28px_rgba(11,65,150,0.55)] animate-pulse disabled:opacity-70 disabled:animate-none transition-all active:scale-[0.97]"
        >
          {loading ? 'Ativando...' : 'ATIVAR AVISOS AGORA'}
        </button>

        <button
          type="button"
          onClick={() => setVisible(false)}
          onTouchStart={() => {}}
          style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' as unknown as string }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-center"
        >
          Não quero ser avisado (Risco de perder a vaga)
        </button>

      </div>
    </div>
  )
}
