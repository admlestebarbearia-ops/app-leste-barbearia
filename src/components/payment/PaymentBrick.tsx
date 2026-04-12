'use client'

import { useEffect, useState } from 'react'
import { initMercadoPago, Payment, StatusScreen } from '@mercadopago/sdk-react'
import type { TPaymentType } from '@mercadopago/sdk-react/esm/bricks/payment/type'
import type { IBrickError } from '@mercadopago/sdk-react/esm/bricks/util/types/common'

type OnSubmitParam = Parameters<TPaymentType['onSubmit']>[0]

// ─── Guard em nível de módulo ─────────────────────────────────────────────────
// O initMercadoPago NÃO pode ser chamado múltiplas vezes. Usando uma variável de
// módulo (fora do componente) garantimos que ele só roda uma vez para toda a
// vida da página — mesmo que PaymentBrick desmonte e remonte via React transitions.
let _mpInitialized = false

interface Props {
  amount: number
  preferenceId?: string
  appointmentId: string
  publicKey: string
  paymentMethod?: 'pix' | 'card'
  onSuccess: (appointmentId: string) => void
  onError?: (message: string) => void
}

export function PaymentBrick({
  amount,
  preferenceId,
  appointmentId,
  publicKey,
  paymentMethod,
  onSuccess,
  onError,
}: Props) {
  const [ready, setReady] = useState(false)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Controle de erro crítico do Brick (ex: fields_setup_failed_after_3_tries).
  // Quando ocorre, exibimos UI de recuperação em vez de propagar ao pai —
  // o agendamento continua "aguardando_pagamento"; não é cancelado.
  const [brickFailed, setBrickFailed] = useState(false)
  // Incrementar força remontagem do componente <Payment> sem recriar o agendamento.
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (_mpInitialized) {
      setReady(true)
      return
    }
    _mpInitialized = true
    initMercadoPago(publicKey, { locale: 'pt-BR' })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, retryKey])

  const handleSubmit = async (param: OnSubmitParam) => {
    const { formData } = param
    setSubmitting(true)
    try {
      const response = await fetch('/api/mp/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, appointmentId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error ?? 'Erro ao processar pagamento.')
      }

      if (result.status === 'approved') {
        onSuccess(appointmentId)
        return
      }

      // PIX (pending) ou outros meios pendentes — mostra Status Screen
      if (result.paymentId) {
        setPaymentId(String(result.paymentId))
        return
      }

      throw new Error(result.statusDetail ?? 'Pagamento recusado.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao processar pagamento.'
      onError?.(message)
      throw err // brick detecta rejeição e exibe erro inline
    } finally {
      setSubmitting(false)
    }
  }

  const handleBrickError = (e: IBrickError) => {
    console.error('[MP Brick]', e)
    const isCritical = e?.type === 'critical'
    if (isCritical) {
      // Erro crítico de inicialização — mostra tela de recuperação.
      // NÃO chama onError (que navegaria o usuário para fora e causaria
      // cancelamento do agendamento pelo botão "Voltar").
      setBrickFailed(true)
    }
    // Errors não-críticos são informativos — o brick continua funcionando.
  }

  const handleRetry = () => {
    // Limpa script tags do SDK MercadoPago para forçar re-download limpo.
    // Necessário quando deploy skew (Vercel) causa 404 em chunks ou quando
    // o SDK falhou na inicialização e ficou com estado corrompido.
    document.querySelectorAll('script[src*="sdk.mercadopago"], script[src*="secure-fields"]').forEach(s => s.remove())
    // Remove iframes residuais do Secure Fields que o Brick criou
    document.querySelectorAll('[class*="mercadopago"], [id*="mercadopago"]').forEach(el => el.remove())
    // Limpa a instância global do SDK
    if (typeof window !== 'undefined' && 'MercadoPago' in window) {
      delete (window as Record<string, unknown>).MercadoPago
    }
    // Permite que initMercadoPago rode novamente
    _mpInitialized = false
    setBrickFailed(false)
    setReady(false)
    setRetryKey(k => k + 1)
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  // Após criar pagamento PIX/pendente — Status Screen mostra QR code
  if (paymentId) {
    return (
      <div className="w-full">
        <StatusScreen
          initialization={{ paymentId }}
          customization={{
            visual: {
              style: { theme: 'dark' },
              hideStatusDetails: false,
              hideTransactionDate: false,
            },
          }}
          onReady={() => {}}
          onError={(e) => console.error('[MP StatusScreen]', e)}
        />
        <button
          onClick={() => onSuccess(appointmentId)}
          className="mt-4 w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground"
        >
          Já paguei — Ver agendamento
        </button>
      </div>
    )
  }

  // Tela de recuperação após erro crítico do Brick.
  // O agendamento continua "aguardando_pagamento" — não é cancelado.
  if (brickFailed) {
    // Na segunda falha (retryKey > 0), o SDK está irrecuperável nesta sessão
    // (provável deploy skew ou bloqueio de rede). Recarregar a página é a única saída.
    const isSecondFailure = retryKey > 0
    return (
      <div className="flex flex-col items-center gap-5 py-8 px-2 text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-bold text-foreground">Formulário de pagamento indisponível</p>
          <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
            Seu agendamento está <strong className="text-white/70">confirmado e reservado</strong>.
            {isSecondFailure
              ? ' Recarregue a página para tentar novamente.'
              : ' Tente recarregar o formulário para concluir o pagamento.'}
          </p>
        </div>
        {isSecondFailure ? (
          <button
            onClick={() => window.location.reload()}
            className="h-12 px-8 rounded-2xl text-xs font-extrabold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Recarregar página
          </button>
        ) : (
          <button
            onClick={handleRetry}
            className="h-12 px-8 rounded-2xl text-xs font-extrabold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Tentar novamente
          </button>
        )}
        <p className="text-[10px] text-white/30">
          Se o problema persistir, entre em contato com a barbearia.
        </p>
      </div>
    )
  }

  return (
    <div key={retryKey} className={submitting ? 'opacity-70 pointer-events-none' : ''}>
      <Payment
        initialization={{ amount }}
        customization={{
          paymentMethods: paymentMethod === 'pix'
            ? { bankTransfer: 'all' }
            : paymentMethod === 'card'
            ? { creditCard: 'all', debitCard: 'all' }
            : { creditCard: 'all', debitCard: 'all', bankTransfer: 'all', mercadoPago: 'all' },
          visual: {
            style: { theme: 'dark' },
            hideFormTitle: true,
            ...(paymentMethod === 'pix'
              ? ({ defaultPaymentOption: { bankTransferForm: true } } as object)
              : paymentMethod === 'card'
              ? ({ defaultPaymentOption: { creditCardForm: true } } as object)
              : {}),
          },
        }}
        onSubmit={handleSubmit}
        onReady={() => {}}
        onError={handleBrickError}
      />
    </div>
  )
}
