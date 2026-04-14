'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { initMercadoPago, Payment, StatusScreen } from '@mercadopago/sdk-react'
import type { IPaymentBrickCustomization } from '@mercadopago/sdk-react/esm/bricks/payment/type'
import type { TPaymentType } from '@mercadopago/sdk-react/esm/bricks/payment/type'
import type { IBrickError } from '@mercadopago/sdk-react/esm/bricks/util/types/common'
import { getPendingPaymentStatus } from '@/app/agendar/actions'
import { getPendingProductPaymentStatus } from '@/app/loja/actions'
import { buildPaymentBrickCustomization, type PublicMpMethod } from '@/lib/mercadopago/checkout-config'

type OnSubmitParam = Parameters<TPaymentType['onSubmit']>[0]
const MP_STATUS_POLL_ATTEMPTS = 6
const MP_STATUS_POLL_INTERVAL_MS = 2000
const noop = () => {}

// ─── Guard em nível de módulo ─────────────────────────────────────────────────
// O initMercadoPago NÃO pode ser chamado múltiplas vezes. Usando uma variável de
// módulo (fora do componente) garantimos que ele só roda uma vez para toda a
// vida da página — mesmo que PaymentBrick desmonte e remonte via React transitions.
let _mpInitialized = false

// ─── StatusScreenOnly ─────────────────────────────────────────────────────────
// Envolve o <StatusScreen> do SDK do MercadoPago de forma completamente isolada.
//
// Problema: o SKD compara os props do StatusScreen por REFERÊNCIA. Se qualquer
// prop mudar de referência (initialization inline, onError inline, etc.), o SDK
// destrói e recria o iframe — causando o piscar visível.
//
// O pai (BookingForm) re-renderiza todo segundo pelo timer de countdown, e toda
// vez que router.refresh() / realtime roda. Isso recria callbacks inline a cada
// render. React.memo NÃO resolve quando onError é uma lambda nova a cada render.
//
// Solução: useRef para capturar o callback mais recente sem expô-lo como dep do
// useCallback. Assim handleError passado ao StatusScreen é SEMPRE a mesma
// referência — o SDK nunca vê mudança de prop e não remonta o iframe.
interface StatusScreenOnlyProps {
  activePaymentId: string
  onError: () => void
}

const STATUS_SCREEN_CUSTOMIZATION = {
  visual: {
    style: { theme: 'dark' as const },
    hideStatusDetails: false,
    hideTransactionDate: false,
  },
}

const StatusScreenOnly = memo(function StatusScreenOnly({
  activePaymentId,
  onError,
}: StatusScreenOnlyProps) {
  const initialization = useMemo(
    () => ({ paymentId: activePaymentId }),
    [activePaymentId],
  )
  // Ref sempre aponta para o callback mais recente sem ser dep do useCallback
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Callback ESTÁVEL (deps vazias) — o StatusScreen nunca recebe nova referência
  const handleError = useCallback((e: unknown) => {
    console.error('[MP StatusScreen]', e)
    onErrorRef.current()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StatusScreen
      initialization={initialization}
      customization={STATUS_SCREEN_CUSTOMIZATION}
      onReady={noop}
      onError={handleError}
    />
  )
})

export type PaymentBrickCheckoutKind = 'appointment' | 'product_reservation'

interface Props {
  amount: number
  preferenceId?: string
  checkoutId: string
  checkoutKind: PaymentBrickCheckoutKind
  publicKey: string
  paymentMethod?: PublicMpMethod
  existingPaymentId?: string
  onSuccess: (checkoutId: string) => void
  onError?: (message: string) => void
  onPaymentRejected?: () => void
}

export function PaymentBrick({
  amount,
  preferenceId,
  checkoutId,
  checkoutKind,
  publicKey,
  paymentMethod,
  existingPaymentId,
  onSuccess,
  onError,
  onPaymentRejected,
}: Props) {
  const [ready, setReady] = useState(false)
  const [paymentId, setPaymentId] = useState<string | null>(existingPaymentId ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [brickFailed, setBrickFailed] = useState(false)
  const [statusScreenFailed, setStatusScreenFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  // Sinaliza que o último pagamento foi recusado — exibe botão de trocar método
  const [wasRejected, setWasRejected] = useState(false)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onPaymentRejectedRef = useRef(onPaymentRejected)
  const statusPollInFlightRef = useRef(false)
  const activePaymentId = paymentId ?? existingPaymentId ?? null

  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onPaymentRejectedRef.current = onPaymentRejected }, [onPaymentRejected])
  useEffect(() => { if (existingPaymentId) setPaymentId(existingPaymentId) }, [existingPaymentId])

  const configError = useMemo(() => {
    if (!publicKey.trim()) return 'Chave pública do Mercado Pago não configurada.'
    if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) return 'Pagamento inválido para iniciar checkout.'
    if (!Number.isFinite(amount) || amount <= 0) return 'Valor do pagamento inválido.'
    return null
  }, [amount, checkoutId, publicKey])

  const paymentInitialization = useMemo(() => ({
    amount,
    ...(preferenceId ? { preferenceId } : {}),
  }), [amount, preferenceId])

  const paymentCustomization = useMemo<IPaymentBrickCustomization>(
    () => buildPaymentBrickCustomization(paymentMethod),
    [paymentMethod]
  )

  const checkBackendConfirmation = useCallback(async (options?: { attempts?: number; silent?: boolean }) => {
    if (statusPollInFlightRef.current) return false

    statusPollInFlightRef.current = true
    setCheckingStatus(true)

    try {
      const attempts = options?.attempts ?? MP_STATUS_POLL_ATTEMPTS

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (checkoutKind === 'appointment') {
          const snapshot = await getPendingPaymentStatus(checkoutId)

          if (snapshot.error) {
            if (!options?.silent) {
              onErrorRef.current?.(snapshot.error)
            }
            return false
          }

          if (snapshot.appointmentStatus === 'confirmado') {
            onSuccessRef.current(checkoutId)
            return true
          }

          if (snapshot.appointmentStatus === 'cancelado' || snapshot.paymentIntentStatus === 'cancelled' || snapshot.paymentIntentStatus === 'expired') {
            if (!options?.silent) {
              onErrorRef.current?.('Pagamento não está mais disponível. Faça um novo agendamento.')
            }
            return false
          }

          if (snapshot.paymentId && !paymentId) {
            setPaymentId(snapshot.paymentId)
          }
        } else {
          const snapshot = await getPendingProductPaymentStatus(checkoutId)

          if (snapshot.error) {
            if (!options?.silent) {
              onErrorRef.current?.(snapshot.error)
            }
            return false
          }

          if (snapshot.reservationStatus === 'reservado' || snapshot.reservationStatus === 'retirado') {
            onSuccessRef.current(checkoutId)
            return true
          }

          if (snapshot.reservationStatus === 'cancelado' || snapshot.paymentIntentStatus === 'cancelled' || snapshot.paymentIntentStatus === 'expired') {
            if (!options?.silent) {
              onErrorRef.current?.('Pagamento não está mais disponível. Inicie uma nova compra.')
            }
            return false
          }

          if (snapshot.paymentId && !paymentId) {
            setPaymentId(snapshot.paymentId)
          }
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, MP_STATUS_POLL_INTERVAL_MS))
        }
      }

      if (!options?.silent) {
        onErrorRef.current?.('Ainda aguardando confirmação do banco. Tente verificar novamente em instantes.')
      }

      return false
    } finally {
      statusPollInFlightRef.current = false
      setCheckingStatus(false)
    }
  }, [checkoutId, checkoutKind, paymentId])

  useEffect(() => {
    if (configError) {
      setReady(false)
      return
    }

    if (_mpInitialized) {
      setReady(true)
      return
    }

    try {
      _mpInitialized = true
      initMercadoPago(publicKey, { locale: 'pt-BR' })
      setReady(true)
    } catch (error) {
      console.error('[MP SDK init]', error)
      _mpInitialized = false
      setReady(false)
      setBrickFailed(true)
      onErrorRef.current?.('Falha ao iniciar o formulário de pagamento. Tente novamente.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configError, publicKey, retryKey])

  useEffect(() => {
    if (!activePaymentId) return
    void checkBackendConfirmation({ attempts: 2, silent: true })
  }, [activePaymentId, checkBackendConfirmation])

  const handleSubmit = useCallback(async (param: OnSubmitParam) => {
    const { formData } = param
    setSubmitting(true)

    try {
      const response = await fetch(checkoutKind === 'appointment' ? '/api/mp/payment' : '/api/mp/product-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          checkoutKind === 'appointment'
            ? { formData, appointmentId: checkoutId }
            : { formData, reservationId: checkoutId }
        ),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error ?? 'Erro ao processar pagamento.')
      }

      // "pending" = PIX ou boleto aguardando; "approved" = cartão aprovado; "in_process" = análise manual.
      // Para qualquer um desses, mostra o StatusScreen (QR code do PIX ou confirmação de cartão).
      // Para "rejected" e outros status de falha, NÃO troca para StatusScreen — deixa o Brick
      // mostrar o erro inline para que o cliente possa tentar novamente ou trocar a forma de pagamento.
      const isAwaitingConfirmation =
        result.status === 'pending' || result.status === 'approved' || result.status === 'in_process'
      if (result.paymentId && isAwaitingConfirmation) {
        setPaymentId(String(result.paymentId))
        return
      }

      // Pagamento recusado: sinaliza para exibir botão de trocar método
      setWasRejected(true)
      throw new Error(
        result.status === 'rejected'
          ? 'Pagamento recusado. Tente novamente ou escolha outro meio de pagamento.'
          : (result.statusDetail ?? result.error ?? 'Pagamento recusado.')
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao processar pagamento.'
      onErrorRef.current?.(message)
      throw err // brick detecta rejeição e exibe erro inline
    } finally {
      setSubmitting(false)
    }
  }, [checkoutId, checkoutKind])

  const handleBrickError = useCallback((e: IBrickError) => {
    console.error('[MP Brick]', e)
    const isCritical = e?.type === 'critical'
    if (isCritical) {
      // Erro crítico de inicialização — mostra tela de recuperação.
      // NÃO chama onError (que navegaria o usuário para fora e causaria
      // cancelamento do agendamento pelo botão "Voltar").
      setBrickFailed(true)
    }
    // Errors não-críticos são informativos — o brick continua funcionando.
  }, [])

  const handleRetry = useCallback(() => {
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
    setPaymentId(null)
    setRetryKey(k => k + 1)
  }, [])

  if (configError) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 text-center">
        <p className="text-xs font-bold text-destructive uppercase tracking-wider">
          {configError}
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  // Após criar pagamento PIX/pendente — Status Screen mostra QR code
  if (activePaymentId) {
    // Se o StatusScreen falhou (ex: public_key ≠ conta que criou o pagamento),
    // exibe tela de fallback em vez de entrar em loop infinito de re-renders.
    if (statusScreenFailed) {
      return (
        <div className="flex flex-col items-center gap-5 py-8 px-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
            <span className="text-2xl">⏳</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-bold text-foreground">Pagamento registrado</p>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
              Não foi possível exibir o QR code agora. Seu horário está
              <strong className="text-white/70"> reservado aguardando pagamento</strong>.
              Use o botão abaixo para verificar se já foi processado, ou acesse <strong className="text-white/70">Minhas Reservas</strong> para retomar o pagamento mais tarde.
            </p>
          </div>
          <button
            onClick={() => void checkBackendConfirmation({ attempts: MP_STATUS_POLL_ATTEMPTS, silent: false })}
            disabled={checkingStatus}
            className="h-12 px-8 rounded-2xl text-xs font-extrabold uppercase tracking-widest bg-primary text-primary-foreground disabled:opacity-60 hover:bg-primary/90 transition-colors"
          >
            {checkingStatus ? 'Verificando...' : 'Verificar pagamento'}
          </button>
        </div>
      )
    }

    const handleStatusError = useCallback(() => setStatusScreenFailed(true), [])

    return (
      <div className="w-full">
        <StatusScreenOnly
          activePaymentId={activePaymentId}
          onError={handleStatusError}
        />
        <button
          onClick={() => void checkBackendConfirmation({ attempts: MP_STATUS_POLL_ATTEMPTS, silent: false })}
          disabled={checkingStatus}
          className="mt-4 w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground disabled:opacity-60"
        >
          {checkingStatus ? 'Verificando pagamento...' : 'Já paguei — Verificar agora'}
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
            Seu horário está <strong className="text-white/70">reservado aguardando pagamento</strong>.
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
        initialization={paymentInitialization}
        customization={paymentCustomization}
        onSubmit={handleSubmit}
        onReady={noop}
        onError={handleBrickError}
      />
      {wasRejected && onPaymentRejectedRef.current && (
        <button
          onClick={() => onPaymentRejectedRef.current?.()}
          className="mt-3 w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-colors bg-white/5"
        >
          Tentar com outro método de pagamento
        </button>
      )}
    </div>
  )
}
