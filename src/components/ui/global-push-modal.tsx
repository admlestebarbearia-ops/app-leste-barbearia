'use client'

/**
 * GlobalPushModal — modal indutivo de ativação de push/PWA.
 *
 * Exibido globalmente em qualquer rota de cliente (exceto /admin e /agendar/sucesso,
 * que já tem seu próprio modal agressivo pós-agendamento).
 *
 * Regras de exibição:
 *   - Notification.permission === 'default' (não decidido ainda)
 *   - Usuário não dispensou nos últimos DISMISS_DAYS dias
 *   - Não é iOS fora do modo standalone (push não suportado)
 *   - Delay de 5 s após montar — não interrompe a navegação inicial
 */

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { savePushSubscription } from '@/app/api/push/actions'
import { ensurePushBrowserSession } from '@/lib/push/browser-session'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const DISMISSED_KEY = 'push_prompt_dismissed_v1'
const DISMISS_DAYS = 15

// Rotas que já têm seu próprio modal de push — evitar duplicata
const SKIP_PATHS = ['/agendar/sucesso']
const SKIP_PREFIXES = ['/admin']

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

function isDismissed(): boolean {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (!stored) return false
    const { ts } = JSON.parse(stored) as { ts: number }
    return Date.now() < ts + DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function saveDismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ts: Date.now() }))
  } catch {
    // localStorage indisponível (modo privado rígido) — ignora
  }
}

async function injectVapidKeyToSw(reg: ServiceWorkerRegistration) {
  const sw = reg.active ?? reg.waiting ?? reg.installing
  if (!sw || !VAPID_PUBLIC_KEY) return
  sw.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
}

export function GlobalPushModal() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt(): Promise<void> }) | null>(null)

  useEffect(() => {
    // Não mostrar em rotas administrativas ou onde já existe modal dedicado
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return

    // iOS fora do PWA: push não suportado — silenciar
    if (isIos() && !isStandalone()) return

    // Browser sem suporte a push
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (typeof Notification === 'undefined') return

    // Não perguntar se já decidiu (granted ou denied)
    if (Notification.permission !== 'default') return

    // Não incomodar dentro do período de dismissal
    if (isDismissed()) return

    if (!VAPID_PUBLIC_KEY) return

    // Captura o evento PWA se já estiver disponível (script inline do <head> guarda em __pwaPrompt)
    if (window.__pwaPrompt) setInstallPrompt(window.__pwaPrompt)

    const beforeInstallHandler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as Event & { prompt(): Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', beforeInstallHandler)

    // Espera 5 s antes de exibir para não interromper a navegação inicial
    const timer = setTimeout(() => setVisible(true), 5000)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler)
    }
  }, [pathname])

  const handleDismiss = () => {
    saveDismiss()
    setVisible(false)
  }

  const handleInstallPwa = async () => {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      window.__pwaPrompt = null
      setInstallPrompt(null)
    } catch {
      // usuário fechou o prompt nativo — ignora
    }
  }

  const handleActivate = async () => {
    if (!VAPID_PUBLIC_KEY || loading) return
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        const pushSession = await ensurePushBrowserSession()
        if (pushSession.created) {
          console.info('[GlobalPushModal] sessão anônima criada para push', { sessionKind: pushSession.sessionKind })
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
          console.warn('[GlobalPushModal] falha ao salvar subscription', { error: result.error ?? 'unknown' })
          toast.error('Permissão concedida, mas este aparelho não foi vinculado. Tente novamente.')
          await sub.unsubscribe().catch(() => {})
          return
        }

        await injectVapidKeyToSw(reg)
        toast.success('✅ Avisos ativados! Você receberá lembretes antes do horário.')
      } else if (permission === 'denied') {
        toast.error('Notificações bloqueadas. Para ativar, acesse as configurações do navegador.')
      }
    } catch (e) {
      console.error('[GlobalPushModal] erro ao ativar push', e)
      toast.error('Falha ao ativar avisos. Tente novamente mais tarde.')
    } finally {
      setLoading(false)
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ativar avisos de agendamento"
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-primary/10 border-b border-border px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bell className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">Não perca seu horário!</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ative os avisos para receber lembretes antes do corte.</p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Fechar"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            O sistema avisa automaticamente <strong className="text-foreground">20, 10 e 5 minutos</strong> antes
            do seu corte — diretamente no aparelho, sem precisar abrir o app.
          </p>

          {/* Botão principal: ativar push */}
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60 transition-opacity"
          >
            {loading ? 'Ativando...' : '🔔 Ativar Lembretes'}
          </button>

          {/* Botão secundário: instalar PWA (só aparece se disponível) */}
          {installPrompt && (
            <button
              type="button"
              onClick={() => void handleInstallPwa()}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground flex items-center justify-center gap-2"
            >
              <Download className="size-4" />
              Instalar App na Tela Inicial
            </button>
          )}

          {/* Recusa com ciência */}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs text-muted-foreground/60 underline underline-offset-2 text-center w-full"
          >
            Não quero receber lembretes (dispensar por {DISMISS_DAYS} dias)
          </button>
        </div>
      </div>
    </div>
  )
}
