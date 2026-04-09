'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, Download, Share } from 'lucide-react'

const DISMISSED_KEY = 'pwa-prompt-dismissed'

type Platform = 'android' | 'ios' | null

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream
  const isAndroid = /Android/.test(ua)
  if (isIos) return 'ios'
  if (isAndroid) return 'android'
  // Desktop Chrome também suporta install
  if ('BeforeInstallPromptEvent' in window || !isIos) return 'android'
  return null
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as Record<string, unknown>).standalone === true
  )
}

export default function PwaPrompt() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt(): Promise<void> } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Registra SW globalmente
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (isStandalone()) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    const plt = detectPlatform()
    if (!plt) return

    if (plt === 'ios') {
      setPlatform('ios')
      setVisible(true)
      return
    }

    // Android/desktop Chrome: aguarda evento do browser
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt(): Promise<void> })
      setPlatform('android')
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm mx-auto bg-card border border-border rounded-2xl shadow-2xl flex items-center gap-3 p-3">
        <Image
          src="/logo2.png"
          alt="Leste Barbearia"
          width={48}
          height={48}
          className="rounded-xl shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Leste Barbearia</p>
          {platform === 'ios' ? (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              Toque em <Share className="inline size-3 shrink-0" /> e depois <strong>Adicionar à tela inicial</strong>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Instale o app para acesso rápido</p>
          )}
        </div>
        {platform === 'android' && (
          <button
            onClick={install}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <Download className="size-3" />
            Instalar
          </button>
        )}
        <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
