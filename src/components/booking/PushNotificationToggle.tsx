'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, X, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { savePushSubscription, removePushSubscription } from '@/app/api/push/actions'

// Chave pública VAPID (exposta ao cliente, sem risco)
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
  // iOS Safari expõe navigator.standalone; outros browsers usam media query
  return !!(
    (navigator as unknown as Record<string, unknown>)['standalone'] ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Injeta a VAPID key no service worker para auto-renovação de subscription */
async function injectVapidKeyToSw(reg: ServiceWorkerRegistration) {
  const sw = reg.active ?? reg.waiting ?? reg.installing
  if (!sw || !VAPID_PUBLIC_KEY) return
  sw.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
}

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [iosPwaRequired, setIosPwaRequired] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [showDeniedModal, setShowDeniedModal] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return

    // iOS fora do PWA: push não é suportado — exibe dica
    if (isIos() && !isStandalone()) {
      setIosPwaRequired(true)
      return
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    // Permissão já negada anteriormente — exibir ajuda em vez de sumir
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setPermissionDenied(true)
      return
    }

    setSupported(true)

    // Verifica se já está subscrito e injeta VAPID key no SW
    navigator.serviceWorker.ready.then((reg) => {
      void injectVapidKeyToSw(reg)
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub)
      })
    })
  }, [])

  function showDeniedHelp() {
    setShowDeniedModal(true)
  }

  async function handleToggle() {
    if (!supported || !VAPID_PUBLIC_KEY) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready

      if (subscribed) {
        // Desativar
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await removePushSubscription(sub.endpoint)
        }
        setSubscribed(false)
        toast.success('Lembretes push desativados.')
      } else {
        // Ativar — pede permissão
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          if (permission === 'denied') {
            setPermissionDenied(true)
            setSupported(false)
            showDeniedHelp()
          } else {
            toast.error('Permissão para notificações não concedida.')
          }
          setLoading(false)
          return
        }

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
          toast.error('Erro ao salvar preferência: ' + result.error)
          await sub.unsubscribe()
        } else {
          // Injeta VAPID key para o SW poder renovar automaticamente
          await injectVapidKeyToSw(reg)
          setSubscribed(true)
          toast.success('Lembretes ativados! Você receberá avisos antes do seu agendamento.')
        }
      }
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'tente novamente'))
    }
    setLoading(false)
  }

  // iOS fora do PWA: mostra dica de instalação
  if (iosPwaRequired) {
    return (
      <p className="text-xs text-muted-foreground">
        Para receber lembretes, instale o app: toque em{' '}
        <strong>Compartilhar → Adicionar à Tela de Início</strong>.
      </p>
    )
  }

  // Permissão negada: botão + modal step-by-step
  if (permissionDenied) {
    const ios = isIos()
    const standalone = isStandalone()

    const steps: string[] = ios && standalone
      ? [
          'Abra o app Configurações do iPhone',
          'Role até encontrar "Barbearia Leste"',
          'Toque em Notificações',
          'Ative "Permitir Notificações"',
          'Volte aqui e toque em Ativar',
        ]
      : !ios && standalone
      ? [
          'Toque no ícone 🔒 ao lado da barra de endereço',
          'Toque em "Permissões do site"',
          'Toque em "Notificações"',
          'Selecione "Permitir"',
          'Volte aqui e toque em Ativar',
        ]
      : ios
      ? [
          'Toque em Compartilhar (ícone de caixa com seta)',
          'Toque em "Adicionar à Tela de Início"',
          'Abra o app pela ícone na tela inicial',
          'Toque em Ativar notificações',
        ]
      : [
          'Clique no ícone 🔒 na barra de endereço',
          'Clique em "Permissões do site"',
          'Em Notificações, selecione "Permitir"',
          'Recarregue a página e ative',
        ]

    return (
      <>
        <button
          onClick={showDeniedHelp}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <BellOff size={14} />
          <span>Notificações bloqueadas — como ativar?</span>
        </button>

        {showDeniedModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base text-foreground">Como ativar notificações</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Siga os passos abaixo no seu celular</p>
                </div>
                <button
                  onClick={() => setShowDeniedModal(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-foreground leading-snug">{step}</span>
                  </li>
                ))}
              </ol>

              <button
                onClick={() => setShowDeniedModal(false)}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                Entendi <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  if (!supported || !VAPID_PUBLIC_KEY) return null

  // Não subscrito: exibe banner pedindo ativação
  if (!subscribed) {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className="w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 text-left hover:bg-amber-500/15 transition-colors disabled:opacity-50"
      >
        <Bell size={18} className="text-amber-400 shrink-0" />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-xs font-bold text-amber-300 leading-snug">
            {loading ? 'Aguarde...' : 'Ativar lembretes e avisos'}
          </span>
          <span className="text-[11px] text-amber-400/70 leading-tight">
            Notificações direto no celular
          </span>
        </div>
        {!loading && (
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 shrink-0 bg-amber-500/20 px-2 py-1 rounded-lg">
            Ativar
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors ${
        subscribed
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      } disabled:opacity-50`}
    >
      {subscribed ? <Bell size={14} /> : <BellOff size={14} />}
      <span>{loading ? 'Aguarde...' : subscribed ? 'Lembretes ativos' : 'Ativar lembretes'}</span>
    </button>
  )
}
