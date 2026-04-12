'use client'

import { useEffect, useRef, useState } from 'react'
import { initMercadoPago, Payment, StatusScreen } from '@mercadopago/sdk-react'
import type { TPaymentType } from '@mercadopago/sdk-react/esm/bricks/payment/type'

type OnSubmitParam = Parameters<TPaymentType['onSubmit']>[0]

interface Props {
  amount: number
  preferenceId?: string // não usado no Checkout Bricks — mantido para compatibilidade futura
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
  const initialized = useRef(false)
  const [ready, setReady] = useState(false)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    initMercadoPago(publicKey, { locale: 'pt-BR' })
    setReady(true)
  }, [publicKey])

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

  return (
    <div className={submitting ? 'opacity-70 pointer-events-none' : ''}>
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
          },
        }}
        onSubmit={handleSubmit}
        onReady={() => {}}
        onError={(e) => {
          console.error('[MP Brick]', e)
          onError?.('Erro no formulário de pagamento.')
        }}
      />
    </div>
  )
}
