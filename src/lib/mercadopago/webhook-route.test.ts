import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { processMercadoPagoWebhook } from './webhook-route'
import { buildProductReservationExternalReference } from './integration-alignment'

function createDeps(overrides: Partial<Parameters<typeof processMercadoPagoWebhook>[1]> = {}) {
  const paymentIntentUpdates: Array<{ appointmentId: string; patch: { status: string; mp_payment_id: string; payment_method?: string | null; refunded_at?: string | null; updated_at: string } }> = []
  const productPaymentIntentUpdates: Array<{ reservationId: string; patch: { status: string; mp_payment_id: string; payment_method?: string | null; refunded_at?: string | null; updated_at: string } }> = []
  const appointmentUpdates: Array<{ appointmentId: string; status: 'confirmado' | 'cancelado' }> = []
  const productReservationUpdates: Array<{ reservationId: string; status: 'reservado' | 'cancelado' }> = []
  const signatureCalls: Array<{ xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }> = []

  const deps: Parameters<typeof processMercadoPagoWebhook>[1] = {
    getAccessToken: async () => 'mp_token_prod',
    fetchPaymentStatus: async () => ({
      id: 123,
      status: 'approved',
      external_reference: 'appt-1',
      transaction_amount: 55,
      payment_method_id: null,
      payment_type_id: null,
    }),
    updatePaymentIntentByAppointmentId: async (appointmentId, patch) => {
      paymentIntentUpdates.push({ appointmentId, patch })
    },
    updateProductPaymentIntentByReservationId: async (reservationId, patch) => {
      productPaymentIntentUpdates.push({ reservationId, patch })
    },
    updateAppointmentStatus: async (appointmentId, status) => {
      appointmentUpdates.push({ appointmentId, status })
    },
    updateProductReservationStatus: async (reservationId, status) => {
      productReservationUpdates.push({ reservationId, status })
    },
    getNow: () => new Date('2026-04-13T14:00:00.000Z'),
    webhookSecret: 'secret-test',
    validateSignature: (input) => {
      signatureCalls.push(input)
      return true
    },
    ...overrides,
  }

  return {
    deps,
    paymentIntentUpdates,
    productPaymentIntentUpdates,
    appointmentUpdates,
    productReservationUpdates,
    signatureCalls,
  }
}

describe('mercadopago webhook route logic', () => {
  it('ignora eventos que não são de payment', async () => {
    const { deps, paymentIntentUpdates, appointmentUpdates } = createDeps()
    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago',
        headers: { xSignature: null, xRequestId: null },
        body: { type: 'topic_claims_integration_wh', data: { id: '1' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.equal(paymentIntentUpdates.length, 0)
    assert.equal(appointmentUpdates.length, 0)
  })

  it('retorna 400 quando o id do pagamento não existe', async () => {
    const { deps } = createDeps()
    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago',
        headers: { xSignature: null, xRequestId: null },
        body: { type: 'payment' },
      },
      deps
    )

    assert.deepEqual(result, { status: 400, body: { error: 'payment id ausente' } })
  })

  it('valida assinatura, atualiza intent e confirma agendamento quando aprovado', async () => {
    const { deps, paymentIntentUpdates, appointmentUpdates, signatureCalls } = createDeps()
    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?data.id=123',
        headers: { xSignature: 'ts=1,v1=hash', xRequestId: 'req-123' },
        body: { type: 'payment', data: { id: '123' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.equal(signatureCalls.length, 1)
    assert.equal(paymentIntentUpdates.length, 1)
    assert.deepEqual(paymentIntentUpdates[0], {
      appointmentId: 'appt-1',
      patch: {
        status: 'approved',
        mp_payment_id: '123',
        payment_method: null,
        refunded_at: undefined,
        updated_at: '2026-04-13T14:00:00.000Z',
      },
    })
    assert.deepEqual(appointmentUpdates[0], {
      appointmentId: 'appt-1',
      status: 'confirmado',
    })
  })

  it('registra cancelamento e refunded_at quando o pagamento confirmado é reembolsado', async () => {
    const { deps, paymentIntentUpdates, appointmentUpdates } = createDeps({
      fetchPaymentStatus: async () => ({
        id: 126,
        status: 'refunded',
        external_reference: 'appt-3',
        transaction_amount: 55,
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
      }),
    })

    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?data.id=126',
        headers: { xSignature: 'ts=1,v1=hash', xRequestId: 'req-126' },
        body: { type: 'payment', data: { id: '126' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.deepEqual(paymentIntentUpdates, [
      {
        appointmentId: 'appt-3',
        patch: {
          status: 'cancelled',
          mp_payment_id: '126',
          payment_method: 'pix',
          refunded_at: '2026-04-13T14:00:00.000Z',
          updated_at: '2026-04-13T14:00:00.000Z',
        },
      },
    ])
    assert.deepEqual(appointmentUpdates, [
      {
        appointmentId: 'appt-3',
        status: 'cancelado',
      },
    ])
  })

  it('mantém só o intent atualizado quando o pagamento segue pendente', async () => {
    const { deps, paymentIntentUpdates, appointmentUpdates } = createDeps({
      fetchPaymentStatus: async () => ({
        id: 124,
        status: 'pending',
        external_reference: 'appt-2',
        transaction_amount: 55,
      }),
    })

    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?data.id=124',
        headers: { xSignature: 'ts=1,v1=hash', xRequestId: 'req-124' },
        body: { type: 'payment', data: { id: '124' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.equal(paymentIntentUpdates.length, 1)
    assert.equal(paymentIntentUpdates[0]?.patch.status, 'pending')
    assert.equal(appointmentUpdates.length, 0)
  })

  it('retorna 500 quando a consulta ao Mercado Pago falha', async () => {
    const { deps } = createDeps({
      fetchPaymentStatus: async () => {
        throw new Error('falha remota')
      },
    })

    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?data.id=125',
        headers: { xSignature: 'ts=1,v1=hash', xRequestId: 'req-125' },
        body: { type: 'payment', data: { id: '125' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 500, body: { received: false } })
  })

  it('atualiza reserva de produto quando o pagamento da loja é aprovado', async () => {
    const {
      deps,
      paymentIntentUpdates,
      productPaymentIntentUpdates,
      appointmentUpdates,
      productReservationUpdates,
    } = createDeps({
      fetchPaymentStatus: async () => ({
        id: 222,
        status: 'approved',
        external_reference: buildProductReservationExternalReference('res-1'),
        transaction_amount: 79.9,
        payment_method_id: 'account_money',
        payment_type_id: 'account_money',
      }),
    })

    const result = await processMercadoPagoWebhook(
      {
        url: 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?data.id=222',
        headers: { xSignature: 'ts=1,v1=hash', xRequestId: 'req-222' },
        body: { type: 'payment', data: { id: '222' } },
      },
      deps
    )

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.equal(paymentIntentUpdates.length, 0)
    assert.equal(appointmentUpdates.length, 0)
    assert.deepEqual(productPaymentIntentUpdates, [
      {
        reservationId: 'res-1',
        patch: {
          status: 'approved',
          mp_payment_id: '222',
          payment_method: 'mercado_pago',
          refunded_at: undefined,
          updated_at: '2026-04-13T14:00:00.000Z',
        },
      },
    ])
    assert.deepEqual(productReservationUpdates, [
      {
        reservationId: 'res-1',
        status: 'reservado',
      },
    ])
  })
})