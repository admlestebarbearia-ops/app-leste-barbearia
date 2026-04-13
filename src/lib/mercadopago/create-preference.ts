import { MercadoPagoConfig, Preference } from 'mercadopago'

export interface MpPreferenceInput {
  accessToken: string
  appointmentId: string
  serviceName: string
  servicePrice: number     // valor em reais (ex: 45.00)
  clientEmail: string | null
  baseUrl: string          // ex: https://barbearialeste.com.br
  expiryMinutes: number    // minutos para expirar o link de pagamento
}

export interface MpPreferenceResult {
  preferenceId: string
  initPoint: string        // URL de checkout do MP (produção)
  sandboxInitPoint: string // URL de checkout do MP (sandbox)
}

/**
 * Cria uma preferência de pagamento no Mercado Pago usando Checkout Pro.
 * Retorna o init_point para redirecionar o usuário.
 */
export async function createMpPreference(
  input: MpPreferenceInput
): Promise<MpPreferenceResult> {
  const { accessToken, appointmentId, serviceName, servicePrice, clientEmail, baseUrl, expiryMinutes } = input

  const client = new MercadoPagoConfig({ accessToken })
  const preference = new Preference(client)

  // Data de expiração em ISO 8601 (UTC)
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

  const result = await preference.create({
    body: {
      items: [
        {
          id: appointmentId,
          title: serviceName,
          quantity: 1,
          unit_price: servicePrice,
          currency_id: 'BRL',
        },
      ],
      payer: clientEmail ? { email: clientEmail } : undefined,
      back_urls: {
        success: `${baseUrl}/agendar/pagamento/sucesso?appt_id=${appointmentId}`,
        failure: `${baseUrl}/agendar/pagamento/falha?appt_id=${appointmentId}`,
        pending: `${baseUrl}/agendar/pagamento/pendente?appt_id=${appointmentId}`,
      },
      auto_return: 'approved',
      external_reference: appointmentId,
      expiration_date_to: expiresAt,
      // Habilita PIX, crédito e débito (padrão do checkout pro)
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: 1, // apenas à vista (sem parcelamento em barbearia)
      },
      statement_descriptor: 'BARBEARIA LESTE',
      notification_url: `${baseUrl}/api/webhooks/mercadopago?source_news=webhooks`,
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
