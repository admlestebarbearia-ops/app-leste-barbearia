import {
  getMercadoPagoWebhookTransition,
  validateMercadoPagoWebhookSignature,
} from '@/lib/mercadopago/integration-alignment'

export interface MercadoPagoWebhookBody {
  type?: string
  action?: string
  data?: { id?: string | number }
}

export interface MercadoPagoWebhookPayment {
  id: number
  status: string
  external_reference: string | null
  transaction_amount: number
}

export interface ProcessMercadoPagoWebhookDeps {
  getAccessToken(): Promise<string | null>
  fetchPaymentStatus(paymentId: string, accessToken: string): Promise<MercadoPagoWebhookPayment>
  updatePaymentIntentByAppointmentId(appointmentId: string, patch: {
    status: string
    mp_payment_id: string
    updated_at: string
  }): Promise<void>
  updateAppointmentStatus(appointmentId: string, status: 'confirmado' | 'cancelado'): Promise<void>
  getNow(): Date
  webhookSecret?: string | null
  validateSignature?(input: {
    xSignature: string | null
    xRequestId: string | null
    dataId: string | null
    secret: string
  }): boolean
}

export interface ProcessMercadoPagoWebhookInput {
  url: string
  headers: {
    xSignature: string | null
    xRequestId: string | null
  }
  body: MercadoPagoWebhookBody
}

export interface RouteResult {
  status: number
  body: Record<string, unknown>
}

export async function processMercadoPagoWebhook(
  input: ProcessMercadoPagoWebhookInput,
  deps: ProcessMercadoPagoWebhookDeps
): Promise<RouteResult> {
  const url = new URL(input.url)
  const dataId = url.searchParams.get('data.id')
  const paymentIdRaw = input.body.data?.id ?? dataId

  if (input.body.type !== 'payment') {
    return { status: 200, body: { received: true } }
  }

  if (!paymentIdRaw) {
    return { status: 400, body: { error: 'payment id ausente' } }
  }

  const paymentId = String(paymentIdRaw)
  const webhookSecret = deps.webhookSecret ?? null

  if (webhookSecret) {
    const signatureValidator = deps.validateSignature ?? ((signatureInput) =>
      validateMercadoPagoWebhookSignature(
        signatureInput.xSignature,
        signatureInput.xRequestId,
        signatureInput.dataId,
        signatureInput.secret
      ))

    signatureValidator({
      xSignature: input.headers.xSignature,
      xRequestId: input.headers.xRequestId,
      dataId: dataId ?? paymentId,
      secret: webhookSecret,
    })
  }

  try {
    const accessToken = await deps.getAccessToken()
    if (!accessToken) {
      return { status: 200, body: { received: true } }
    }

    const payment = await deps.fetchPaymentStatus(paymentId, accessToken)
    const appointmentId = payment.external_reference

    if (!appointmentId) {
      return { status: 200, body: { received: true } }
    }

    const transition = getMercadoPagoWebhookTransition(payment.status)

    if (transition.intentStatus) {
      await deps.updatePaymentIntentByAppointmentId(appointmentId, {
        status: transition.intentStatus,
        mp_payment_id: paymentId,
        updated_at: deps.getNow().toISOString(),
      })
    }

    if (transition.appointmentStatus) {
      await deps.updateAppointmentStatus(appointmentId, transition.appointmentStatus)
    }

    return { status: 200, body: { received: true } }
  } catch {
    return { status: 500, body: { received: false } }
  }
}