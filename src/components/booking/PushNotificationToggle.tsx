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

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setSupported(true)

    // Verifica se já está subscrito
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub)
      })
    })
  }, [])

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
          toast.error('Permissão para notificações negada.')
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
          setSubscribed(true)
          toast.success('Lembretes ativados! Você receberá avisos 1 dia antes do agendamento.')
        }
      }
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'tente novamente'))
    }
    setLoading(false)
  }

  if (!supported || !VAPID_PUBLIC_KEY) return null

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
