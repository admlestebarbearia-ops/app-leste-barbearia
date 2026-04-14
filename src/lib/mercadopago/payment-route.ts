import {
  buildPaymentCreationIdempotencyKey,
  isPaymentIntentExpired,
  mapMercadoPagoStatusToIntentStatus,
  shouldReuseMercadoPagoPayment,
  validateMercadoPagoPaymentRequest,
} from '@/lib/mercadopago/payment-flow'
import {
  buildMercadoPagoNotificationUrl,
  buildTrustedMercadoPagoPayer,
  sanitizeMercadoPagoFormData,
} from '@/lib/mercadopago/integration-alignment'

export interface MercadoPagoPaymentRouteBody {
  formData: Record<string, unknown>
  appointmentId: string
}

export interface PendingAppointmentRecord {
  id: string
  status: string
  service_name_snapshot: string | null
  service_price_snapshot: number | string | null
  client_name: string | null
  client_email: string | null
  client_phone: string | null
}

export interface PaymentIntentRecord {
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

export interface ProcessMercadoPagoPaymentRequestDeps {
  getPendingAppointment(appointmentId: string): Promise<PendingAppointmentRecord | null>
  getPaymentIntent(appointmentId: string): Promise<PaymentIntentRecord | null>
  expirePendingIntent(intentId: string, appointmentId: string): Promise<void>
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

function isValidAppointmentId(appointmentId: string) {
  return /^[0-9a-f-]{36}$/i.test(appointmentId)
}

export async function processMercadoPagoPaymentRequest(
  body: MercadoPagoPaymentRouteBody,
  deps: ProcessMercadoPagoPaymentRequestDeps
): Promise<RouteResult> {
  const { formData, appointmentId } = body

  if (
    !formData ||
    typeof formData !== 'object' ||
    typeof appointmentId !== 'string' ||
    !isValidAppointmentId(appointmentId)
  ) {
    return { status: 400, body: { error: 'Dados inválidos.' } }
  }

  const appt = await deps.getPendingAppointment(appointmentId)
  if (!appt) {
    return {
      status: 404,
      body: { error: 'Agendamento não encontrado ou pagamento já processado.' },
    }
  }

  const paymentIntent = await deps.getPaymentIntent(appointmentId)
  if (!paymentIntent) {
    return {
      status: 409,
      body: { error: 'Controle de pagamento não encontrado.' },
    }
  }

  if (isPaymentIntentExpired(paymentIntent.expires_at, deps.getNow())) {
    await deps.expirePendingIntent(paymentIntent.id, appointmentId)
    return {
      status: 409,
      body: { error: 'Prazo de pagamento expirado. Faça um novo agendamento.' },
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
      clientName: appt.client_name,
      clientEmail: appt.client_email,
      clientPhone: appt.client_phone,
    }),
  }

  const paymentDescription = appt.service_name_snapshot ?? 'Serviço Barbearia'
  const validationError = validateMercadoPagoPaymentRequest({
    appointmentId,
    amount: Number(appt.service_price_snapshot),
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
        ...normalizedFormData,
        transaction_amount: Number(appt.service_price_snapshot),
        description: paymentDescription,
        statement_descriptor: 'BARBEARIA LESTE',
        external_reference: appointmentId,
        installments: 1,
        notification_url: buildMercadoPagoNotificationUrl(deps.getBaseUrl()),
        // ─── additional_info: melhora qualidade da integração (aprovação + experiência) ──
        // Sem estes campos o painel de qualidade do MP fica abaixo de 100.
        additional_info: {
          items: [
            {
              id: `svc-${appointmentId.slice(0, 8)}`,
              title: appt.service_name_snapshot ?? 'Serviço',
              description: appt.service_name_snapshot ?? 'Serviço Barbearia',
              category_id: 'health_beauty',
              quantity: 1,
              unit_price: Number(appt.service_price_snapshot),
              currency_id: 'BRL',
            },
          ],
          payer: {
            first_name: (normalizedFormData.payer as Record<string, unknown> | undefined)?.first_name,
            last_name: (normalizedFormData.payer as Record<string, unknown> | undefined)?.last_name,
            phone: (normalizedFormData.payer as Record<string, unknown> | undefined)?.phone,
            registration_date: new Date().toISOString(),
          },
        },
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
    // Loga o erro real nos Vercel Logs — fundamental para diagnóstico.
    // A ApiError do SDK MP tem .cause (array) e .status (HTTP code da API MP).
    const mpErr = err instanceof Error ? err : null
    console.error('[mp/payment] createPayment failed:', {
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