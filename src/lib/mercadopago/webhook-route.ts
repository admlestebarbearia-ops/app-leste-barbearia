import {
  getMercadoPagoWebhookTransition,
  mapMercadoPagoPaymentMethod,
  parseMercadoPagoExternalReference,
  validateMercadoPagoWebhookSignature,
} from '@/lib/mercadopago/integration-alignment'
import type { PaymentMethod } from '@/lib/supabase/types'

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
  payment_method_id?: string | null
  payment_type_id?: string | null
  date_approved?: string | null
}

export interface ProcessMercadoPagoWebhookDeps {
  getAccessToken(): Promise<string | null>
  fetchPaymentStatus(paymentId: string, accessToken: string): Promise<MercadoPagoWebhookPayment>
  updatePaymentIntentByAppointmentId(appointmentId: string, patch: {
    status: string
    mp_payment_id: string
    payment_method?: PaymentMethod | null
    refunded_at?: string | null
    updated_at: string
  }): Promise<void>
  updateProductPaymentIntentByReservationId?(reservationId: string, patch: {
    status: string
    mp_payment_id: string
    payment_method?: PaymentMethod | null
    refunded_at?: string | null
    updated_at: string
  }): Promise<void>
  updateAppointmentStatus(appointmentId: string, status: 'confirmado' | 'cancelado'): Promise<void>
  updateProductReservationStatus?(reservationId: string, status: 'reservado' | 'cancelado'): Promise<void>
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
    const target = parseMercadoPagoExternalReference(payment.external_reference)

    if (!target) {
      return { status: 200, body: { received: true } }
    }

    const transition = getMercadoPagoWebhookTransition(payment.status)
    const nowIso = deps.getNow().toISOString()
    const paymentMethod = mapMercadoPagoPaymentMethod(
      payment.payment_method_id ?? null,
      payment.payment_type_id ?? null
    )
    const refundedAt = payment.status === 'refunded' || payment.status === 'charged_back'
      ? nowIso
      : undefined

    if (target.kind === 'appointment') {
      if (transition.intentStatus) {
        await deps.updatePaymentIntentByAppointmentId(target.id, {
          status: transition.intentStatus,
          mp_payment_id: paymentId,
          payment_method: paymentMethod,
          refunded_at: refundedAt,
          updated_at: nowIso,
        })
      }

      if (transition.appointmentStatus) {
        await deps.updateAppointmentStatus(target.id, transition.appointmentStatus)
      }
    } else {
      if (transition.intentStatus && deps.updateProductPaymentIntentByReservationId) {
        await deps.updateProductPaymentIntentByReservationId(target.id, {
          status: transition.intentStatus,
          mp_payment_id: paymentId,
          payment_method: paymentMethod,
          refunded_at: refundedAt,
          updated_at: nowIso,
        })
      }

      const productStatus = payment.status === 'approved'
        ? 'reservado'
        : transition.appointmentStatus === 'cancelado'
        ? 'cancelado'
        : null

      if (productStatus && deps.updateProductReservationStatus) {
        await deps.updateProductReservationStatus(target.id, productStatus)
      }
    }

    return { status: 200, body: { received: true } }
  } catch {
    return { status: 500, body: { received: false } }
  }
}