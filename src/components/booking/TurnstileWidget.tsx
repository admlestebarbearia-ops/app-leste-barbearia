'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

interface Props {
  siteKey: string
  onSuccess: (token: string) => void
  onError: () => void
}

export function TurnstileWidget({ siteKey, onSuccess, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  const renderWidget = () => {
    if (!containerRef.current || !window.turnstile) return
    if (widgetId.current) return

    widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onSuccess,
      'error-callback': onError,
      theme: 'dark',
      size: 'normal',
    })
  }

  useEffect(() => {
    // Se o script ja foi carregado (segundo render)
    if (window.turnstile) {
      renderWidget()
    }
    return () => {
      if (window.turnstile && widgetId.current) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div ref={containerRef} className="flex justify-center" />
    </>
  )
}
