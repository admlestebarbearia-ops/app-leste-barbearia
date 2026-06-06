'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X, Download, Share, Smartphone } from 'lucide-react'

const DISMISSED_KEY = 'pwa-prompt-dismissed-v2'

type Mode = 'install' | 'ios' | 'manual' | null

declare global {
  interface Window {
    __pwaPrompt: (Event & { prompt(): Promise<void> }) | null
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as Record<string, unknown>).standalone === true
  )
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export default function PwaPrompt() {
  const pathname = usePathname()
  const [mode, setMode] = useState<Mode>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const isDev = process.env.NODE_ENV !== 'production'
    const isAdminRoute = pathname.startsWith('/admin')

    if (isAdminRoute) {
      setVisible(false)
      if (isDev) {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations()
            .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
            .catch(() => {})
        }

        if ('caches' in window) {
          caches.keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .catch(() => {})
        }
      }

      return
    }

    if (isDev) {
      return
    }

    // Registra SW globalmente
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (isStandalone()) return
    if (localStorage.getItem(DISMISSED_KEY)) return

    if (isIos()) {
      setMode('ios')
      setVisible(true)
      return
    }

    // Tenta pegar o evento capturado pelo script inline no <head>
    const tryShow = (retries = 0) => {
      if (window.__pwaPrompt) {
        setMode('install')
        setVisible(true)
        return
      }
      // Se o evento nunca disparou (cooldown pós-desinstalação, Firefox, etc.)
      // mostra instrução manual após breve espera
      if (retries >= 8) {
        setMode('manual')
        setVisible(true)
        return
      }
      setTimeout(() => tryShow(retries + 1), 250)
    }
    tryShow()

    // Também ouve o evento caso dispare depois
    const handler = (e: Event) => {
      e.preventDefault()
      window.__pwaPrompt = e as Event & { prompt(): Promise<void> }
      setMode('install')
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [pathname])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  const install = async () => {
    if (!window.__pwaPrompt) return
    await window.__pwaPrompt.prompt()
    window.__pwaPrompt = null
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-18 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm mx-auto bg-card/95 backdrop-blur-md border border-border/60 rounded-2xl shadow-2xl flex items-center gap-3 p-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
          <Smartphone className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Instale o app</p>
          {mode === 'ios' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Toque em <Share className="inline size-3" /> e depois <strong>Adicionar à tela inicial</strong>
            </p>
          )}
          {mode === 'install' && (
            <p className="text-xs text-muted-foreground mt-0.5">Acesso rápido com notificações</p>
          )}
          {mode === 'manual' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Toque em <strong>⋮</strong> no navegador e escolha <strong>Instalar app</strong>
            </p>
          )}
        </div>
        {mode === 'install' && (
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
