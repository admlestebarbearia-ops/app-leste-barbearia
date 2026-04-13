import { MercadoPagoConfig, Preference } from 'mercadopago'
import { buildMercadoPagoNotificationUrl } from '@/lib/mercadopago/integration-alignment'

export interface MpCheckoutPreferenceInput {
  accessToken: string
  externalReference: string
  itemId: string
  title: string
  unitPrice: number
  quantity?: number
  payerEmail: string | null
  baseUrl: string
  expiryMinutes: number
  backUrls: {
    success: string
    failure: string
    pending: string
  }
  statementDescriptor?: string
}

export interface MpPreferenceResult {
  preferenceId: string
  initPoint: string
  sandboxInitPoint: string
}

/**
 * Cria uma preferência de pagamento no Mercado Pago usando Checkout Pro.
 */
export async function createMpCheckoutPreference(
  input: MpCheckoutPreferenceInput
): Promise<MpPreferenceResult> {
  const {
    accessToken,
    externalReference,
    itemId,
    title,
    unitPrice,
    quantity = 1,
    payerEmail,
    baseUrl,
    expiryMinutes,
    backUrls,
    statementDescriptor = 'BARBEARIA LESTE',
  } = input

  const client = new MercadoPagoConfig({ accessToken })
  const preference = new Preference(client)

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

  const result = await preference.create({
    body: {
      items: [
        {
          id: itemId,
          title,
          quantity,
          unit_price: unitPrice,
          currency_id: 'BRL',
        },
      ],
      payer: payerEmail ? { email: payerEmail } : undefined,
      back_urls: backUrls,
      auto_return: 'approved',
      external_reference: externalReference,
      expiration_date_to: expiresAt,
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: 1,
      },
      statement_descriptor: statementDescriptor,
      notification_url: buildMercadoPagoNotificationUrl(baseUrl),
    },
  })

  if (!result.id || !result.init_point) {
    throw new Error('Resposta inválida do Mercado Pago ao criar preferência.')
  }

  return {
    preferenceId: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point ?? result.init_point,
  }
}
