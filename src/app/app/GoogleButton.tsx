'use client'

import { useState } from 'react'
import { signInWithGoogle } from '@/lib/auth-actions'
import styles from './landing.module.css'

// ────────────────────────────────────────────────────────────────────────────
// Botao "Entrar com Google" — EXCLUSIVO da landing /app.
//
// NAO e o `LoginButton` da rota `/`. Aquele componente e compartilhado com a
// tela em producao e nao pode ser tocado nesta sprint. Este aqui e isolado: se
// mudar, muda so a landing.
//
// Especificacao oficial (Google Identity branding guidelines, tema escuro,
// conferida em 14/09/2026):
//   fill #131314 · stroke #8E918F 1px inside · texto #E3E3E3 · medium 14/20
//   padding: 12px antes do logo · 10px depois do logo · 12px depois do texto
//   "G" oficial colorido, tamanho e cor inalterados, sobre fundo escuro
//   texto permitido: "Entrar com Google" (traducao e permitida e recomendada)
//
// O documento NAO especifica raio de canto nem proibe estados de hover — por
// isso o raio e a elevacao de 2px sao permitidos. O que nao se mexe e o "G", as
// cores e o texto.
// ────────────────────────────────────────────────────────────────────────────

export function GoogleButton({ nextPath = '/agendar' }: { nextPath?: string }) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleLogin = async () => {
    if (isRedirecting) return
    setIsRedirecting(true)
    try {
      await signInWithGoogle(nextPath)
    } catch {
      setIsRedirecting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogin()}
      disabled={isRedirecting}
      className={`${styles.lift} inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium leading-5 disabled:opacity-70`}
      style={{
        backgroundColor: '#131314',
        border: '1px solid #8E918F',
        color: '#E3E3E3',
        paddingLeft: '12px',
        paddingRight: '12px',
      }}
    >
      <span className="flex items-center" style={{ paddingRight: '10px' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
        </svg>
      </span>
      <span>{isRedirecting ? 'Conectando...' : 'Entrar com Google'}</span>
    </button>
  )
}
