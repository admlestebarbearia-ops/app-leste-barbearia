'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'
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
    const ios = isIos()
    const standalone = isStandalone()
    if (ios && standalone) {
      toast.error(
        'Permissão bloqueada. Vá em Configurações do iPhone → Barbearia Leste → Notificações e ative.',
        { duration: 9000 },
      )
    } else if (!ios && standalone) {
      // Android Chrome PWA
      toast.error(
        'Permissão bloqueada. Abra o Chrome → toque no 🔒 ao lado do endereço → Permissões do site → Notificações → Permitir.',
        { duration: 9000 },
      )
    } else if (ios) {
      toast.error(
        'Para notificações no iPhone, instale o app: Compartilhar → Adicionar à Tela de Início.',
        { duration: 9000 },
      )
    } else {
      toast.error(
        'Permissão bloqueada. Clique no 🔒 na barra de endereço → Permissões do site → Notificações → Permitir.',
        { duration: 9000 },
      )
    }
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

  // Permissão negada: botão visível que explica como reativar
  if (permissionDenied) {
    return (
      <button
        onClick={showDeniedHelp}
        className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
      >
        <BellOff size={14} />
        <span>Notificações bloqueadas</span>
      </button>
    )
  }

  if (!supported || !VAPID_PUBLIC_KEY) return null

  // N\u00e3o subscrito: exibe banner proeminente pedindo ativa\u00e7\u00e3o
  if (!subscribed) {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className="w-full flex items-center gap-3 bg-amber-500/12 border border-amber-500/25 rounded-2xl px-4 py-3.5 text-left hover:bg-amber-500/18 transition-colors disabled:opacity-50"
      >
        <Bell size={18} className="text-amber-400 shrink-0" />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-xs font-bold text-amber-300">
            {loading ? 'Aguarde...' : 'Ative as notifica\u00e7\u00f5es para receber alertas'}
          </span>
          <span className="text-[11px] text-amber-400/70 leading-tight">
            Lembretes de hor\u00e1rio e confirma\u00e7\u00f5es direto no seu celular
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/60 shrink-0">Ativar</span>
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
