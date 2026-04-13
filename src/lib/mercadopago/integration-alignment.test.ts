import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { describe, it } from 'node:test'
import {
  buildMercadoPagoNotificationUrl,
  buildMercadoPagoPhone,
  buildMercadoPagoWebhookManifest,
  buildTrustedMercadoPagoPayer,
  getMercadoPagoWebhookTransition,
  sanitizeMercadoPagoFormData,
  validateMercadoPagoWebhookSignature,
} from './integration-alignment'

describe('mercadopago integration alignment', () => {
  it('remove campos injetados do payload do Brick', () => {
    assert.deepEqual(
      sanitizeMercadoPagoFormData({
        token: 'tok_test',
        payment_method_id: 'master',
        payer: { email: 'cliente@teste.com' },
        transaction_amount: 999,
        notification_url: 'https://malicioso',
      }),
      {
        token: 'tok_test',
        payment_method_id: 'master',
        payer: { email: 'cliente@teste.com' },
      }
    )
  })

  it('enriquece o payer com dados confiaveis do agendamento sem perder identificacao do Brick', () => {
    assert.deepEqual(
      buildTrustedMercadoPagoPayer(
        {
          email: '',
          first_name: 'Maria',
          identification: { type: 'CPF', number: '99999999999' },
          phone: { area_code: '11' },
        },
        {
          clientName: 'Maria Santos Pereira',
          clientEmail: 'maria@cliente.com',
          clientPhone: '(11) 99999-9999',
        }
      ),
      {
        email: 'maria@cliente.com',
        first_name: 'Maria',
        last_name: 'Santos Pereira',
        identification: { type: 'CPF', number: '99999999999' },
        phone: { area_code: '11', number: '999999999' },
      }
    )
  })

  it('normaliza telefone do cliente para o formato esperado pelo payer do MP', () => {
    assert.deepEqual(buildMercadoPagoPhone('11987654321'), {
      area_code: '11',
      number: '987654321',
    })

    assert.equal(buildMercadoPagoPhone('12345'), undefined)
  })

  it('garante source_news=webhooks na notification_url', () => {
    assert.equal(
      buildMercadoPagoNotificationUrl('https://barbearia-leste.vercel.app'),
      'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?source_news=webhooks'
    )
  })

  it('valida a assinatura do webhook conforme o manifest do Mercado Pago', () => {
    const secret = 'segredo_teste'
    const timestamp = '1704908010'
    const requestId = 'req-123'
    const dataId = 'ABC123'
    const manifest = buildMercadoPagoWebhookManifest(dataId, requestId, timestamp)
    const hash = createHmac('sha256', secret).update(manifest).digest('hex')
    const xSignature = `ts=${timestamp},v1=${hash}`

    assert.equal(
      validateMercadoPagoWebhookSignature(xSignature, requestId, dataId, secret),
      true
    )

    assert.equal(
      validateMercadoPagoWebhookSignature(`ts=${timestamp},v1=hash_invalido`, requestId, dataId, secret),
      false
    )
  })

  it('mapeia os estados do pagamento para os estados locais do agendamento', () => {
    assert.deepEqual(getMercadoPagoWebhookTransition('approved'), {
      appointmentStatus: 'confirmado',
      intentStatus: 'approved',
    })

    assert.deepEqual(getMercadoPagoWebhookTransition('pending'), {
      appointmentStatus: null,
      intentStatus: 'pending',
    })

    assert.deepEqual(getMercadoPagoWebhookTransition('charged_back'), {
      appointmentStatus: 'cancelado',
      intentStatus: 'cancelled',
    })
  })
})