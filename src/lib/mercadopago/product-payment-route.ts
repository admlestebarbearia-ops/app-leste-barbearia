import {
  buildPaymentCreationIdempotencyKey,
  isPaymentIntentExpired,
  mapMercadoPagoStatusToIntentStatus,
  shouldReuseMercadoPagoPayment,
  validateMercadoPagoPaymentRequest,
} from '@/lib/mercadopago/payment-flow'
import {
  buildMercadoPagoNotificationUrl,
  buildProductReservationExternalReference,
  buildTrustedMercadoPagoPayer,
  sanitizeMercadoPagoFormData,
} from '@/lib/mercadopago/integration-alignment'

export interface MercadoPagoProductPaymentRouteBody {
  formData: Record<string, unknown>
  reservationId: string
}

export interface PendingProductReservationRecord {
  id: string
  status: string
  product_name_snapshot: string
  product_price_snapshot: number | string | null
  quantity: number
  client_name: string | null
  client_email: string | null
  client_phone: string | null
}

export interface ProductPaymentIntentRecord {
  id: string
  status: string
  mp_payment_id: string | null
  expires_at: string | null
}

export interface MercadoPagoPaymentStatusResponse {
  id: number
  status: string
  status_detail?: string
}

export interface MercadoPagoCreatedPayment {
  id?: number | null
  status: string
  status_detail?: string
}

export interface ProcessMercadoPagoProductPaymentRequestDeps {
  getPendingReservation(reservationId: string): Promise<PendingProductReservationRecord | null>
  getPaymentIntent(reservationId: string): Promise<ProductPaymentIntentRecord | null>
  expirePendingIntent(intentId: string, reservationId: string): Promise<void>
  getAccessToken(): Promise<string | null>
  fetchExistingPaymentStatus(paymentId: string, accessToken: string): Promise<MercadoPagoPaymentStatusResponse>
  createPayment(input: {
    body: Record<string, unknown>
    idempotencyKey: string
    accessToken: string
  }): Promise<MercadoPagoCreatedPayment>
  updatePaymentIntent(
    intentId: string,
    patch: { status: string; mp_payment_id?: string | null; updated_at: string }
  ): Promise<void>
  generateRandomId(): string
  getNow(): Date
  getBaseUrl(): string
}

export interface RouteResult {
  status: number
  body: Record<string, unknown>
}

function isValidReservationId(reservationId: string) {
  return /^[0-9a-f-]{36}$/i.test(reservationId)
}

export async function processMercadoPagoProductPaymentRequest(
  body: MercadoPagoProductPaymentRouteBody,
  deps: ProcessMercadoPagoProductPaymentRequestDeps
): Promise<RouteResult> {
  const { formData, reservationId } = body

  if (
    !formData ||
    typeof formData !== 'object' ||
    typeof reservationId !== 'string' ||
    !isValidReservationId(reservationId)
  ) {
    return { status: 400, body: { error: 'Dados inválidos.' } }
  }

  const reservation = await deps.getPendingReservation(reservationId)
  if (!reservation) {
    return {
      status: 404,
      body: { error: 'Reserva não encontrada ou pagamento já processado.' },
    }
  }

  const paymentIntent = await deps.getPaymentIntent(reservationId)
  if (!paymentIntent) {
    return {
      status: 409,
      body: { error: 'Controle de pagamento não encontrado.' },
    }
  }

  if (isPaymentIntentExpired(paymentIntent.expires_at, deps.getNow())) {
    await deps.expirePendingIntent(paymentIntent.id, reservationId)
    return {
      status: 409,
      body: { error: 'Prazo de pagamento expirado. Inicie uma nova compra.' },
    }
  }

  const accessToken = await deps.getAccessToken()
  if (!accessToken) {
    return {
      status: 503,
      body: { error: 'Pagamento online não configurado. Contate a barbearia.' },
    }
  }

  const safeFormData = sanitizeMercadoPagoFormData(formData)
  const normalizedFormData = {
    ...safeFormData,
    payer: buildTrustedMercadoPagoPayer(safeFormData.payer, {
      clientName: reservation.client_name,
      clientEmail: reservation.client_email,
      clientPhone: reservation.client_phone,
    }),
  }
  const apiCompatibleFormData = { ...normalizedFormData } as Record<string, unknown>
  delete apiCompatibleFormData.payment_type_id

  const amount = Number(reservation.product_price_snapshot) * reservation.quantity
  const paymentDescription = reservation.product_name_snapshot ?? 'Produto Barbearia'
  const validationError = validateMercadoPagoPaymentRequest({
    appointmentId: reservationId,
    amount,
    description: paymentDescription,
    formData: normalizedFormData,
  })

  if (validationError) {
    return { status: 400, body: { error: validationError } }
  }

  try {
    if (paymentIntent.mp_payment_id && shouldReuseMercadoPagoPayment(paymentIntent.status)) {
      const existingPayment = await deps.fetchExistingPaymentStatus(paymentIntent.mp_payment_id, accessToken)
      const existingIntentStatus = mapMercadoPagoStatusToIntentStatus(existingPayment.status)

      await deps.updatePaymentIntent(paymentIntent.id, {
        status: existingIntentStatus,
        mp_payment_id: String(existingPayment.id),
        updated_at: deps.getNow().toISOString(),
      })

      if (shouldReuseMercadoPagoPayment(existingPayment.status)) {
        return {
          status: 200,
          body: {
            status: existingPayment.status,
            statusDetail: existingPayment.status_detail,
            paymentId: existingPayment.id,
            reused: true,
          },
        }
      }
    }

    const payment = await deps.createPayment({
      accessToken,
      body: {
        ...apiCompatibleFormData,
        transaction_amount: amount,
        description: paymentDescription,
        statement_descriptor: 'BARBEARIA LESTE',
        external_reference: buildProductReservationExternalReference(reservationId),
        installments: 1,
        notification_url: buildMercadoPagoNotificationUrl(deps.getBaseUrl()),
      },
      idempotencyKey: paymentIntent.mp_payment_id
        ? deps.generateRandomId()
        : buildPaymentCreationIdempotencyKey(paymentIntent.id),
    })

    await deps.updatePaymentIntent(paymentIntent.id, {
      status: mapMercadoPagoStatusToIntentStatus(payment.status),
      mp_payment_id: payment.id ? String(payment.id) : null,
      updated_at: deps.getNow().toISOString(),
    })

    return {
      status: 200,
      body: {
        status: payment.status,
        statusDetail: payment.status_detail,
        paymentId: payment.id,
      },
    }
  } catch (err) {
    const mpErr = err instanceof Error ? err : null
    console.error('[mp/product-payment] createPayment failed:', {
      message: mpErr?.message ?? String(err),
      status: (err as Record<string, unknown>)?.status,
      cause: (err as Record<string, unknown>)?.cause,
    })
    return {
      status: 500,
      body: { error: 'Erro ao processar pagamento. Tente novamente.' },
    }
  }
}