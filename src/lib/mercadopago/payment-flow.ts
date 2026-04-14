import type { PaymentIntentStatus } from '@/lib/supabase/types'

export function mapMercadoPagoStatusToIntentStatus(status: string | null | undefined): PaymentIntentStatus {
  switch (status) {
    case 'approved':
      return 'approved'
    case 'pending':
    case 'in_process':
      return 'pending'
    case 'rejected':
      return 'rejected'
    case 'cancelled':
    case 'refunded':
    case 'charged_back':
      return 'cancelled'
    case 'expired':
      return 'expired'
    default:
      return 'pending'
  }
}

export function shouldReuseMercadoPagoPayment(status: string | null | undefined) {
  return status === 'approved' || status === 'pending' || status === 'in_process'
}

export function isPaymentIntentExpired(expiresAt: string | null | undefined, now = new Date()) {
  if (!expiresAt) return false
  const expiresAtMs = new Date(expiresAt).getTime()
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()
}

export function buildPaymentCreationIdempotencyKey(paymentIntentId: string) {
  return `payment-intent:${paymentIntentId}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isTokenlessMercadoPagoMethod(formData: Record<string, unknown>) {
  const paymentMethodId = isNonEmptyString(formData.payment_method_id)
    ? formData.payment_method_id.trim().toLowerCase()
    : ''
  const paymentTypeId = isNonEmptyString(formData.payment_type_id)
    ? formData.payment_type_id.trim().toLowerCase()
    : ''

  return paymentMethodId === 'pix'
    || paymentMethodId === 'account_money'
    || paymentTypeId === 'account_money'
    || paymentTypeId === 'bank_transfer'
}

export function validateMercadoPagoPaymentRequest(input: {
  appointmentId: string
  amount: number
  description: string
  formData: Record<string, unknown>
}) {
  if (!/^[0-9a-f-]{36}$/i.test(input.appointmentId)) {
    return 'Agendamento inválido.'
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return 'Valor de pagamento inválido.'
  }

  if (!isNonEmptyString(input.description)) {
    return 'Descrição do pagamento inválida.'
  }

  if (!input.formData || typeof input.formData !== 'object') {
    return 'Dados do pagamento inválidos.'
  }

  if (!isNonEmptyString(input.formData.payment_method_id)) {
    return 'Método de pagamento inválido.'
  }

  const payer = input.formData.payer
  if (!payer || typeof payer !== 'object') {
    return 'Dados do pagador inválidos.'
  }

  const email = (payer as Record<string, unknown>).email
  if (email != null && !isNonEmptyString(email)) {
    return 'E-mail do pagador inválido.'
  }

  const isCardPayment = !isTokenlessMercadoPagoMethod(input.formData)
  if (isCardPayment) {
    if (!isNonEmptyString(input.formData.token)) {
      return 'Token de pagamento inválido.'
    }

    if (typeof input.formData.installments !== 'number' || input.formData.installments <= 0) {
      return 'Parcelamento inválido.'
    }
  } else {
    // PIX, saldo Mercado Pago e transferência bancária exigem email do pagador.
    if (!isNonEmptyString(email)) {
      return 'Informe seu e-mail para prosseguir com o pagamento.'
    }
  }

  return null
}