import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  processMercadoPagoPaymentRequest,
  type PendingAppointmentRecord,
  type PaymentIntentRecord,
} from './payment-route'

function buildPendingAppointment(overrides: Partial<PendingAppointmentRecord> = {}): PendingAppointmentRecord {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    status: 'aguardando_pagamento',
    service_name_snapshot: 'Corte + Barba',
    service_price_snapshot: 55,
    client_name: 'Maria Santos Pereira',
    client_email: 'maria@cliente.com',
    client_phone: '11999998888',
    ...overrides,
  }
}

function buildPaymentIntent(overrides: Partial<PaymentIntentRecord> = {}): PaymentIntentRecord {
  return {
    id: 'intent-1',
    status: 'pending',
    mp_payment_id: null,
    expires_at: '2026-04-13T15:00:00.000Z',
    ...overrides,
  }
}

function createDeps(overrides: Partial<Parameters<typeof processMercadoPagoPaymentRequest>[1]> = {}) {
  const updates: Array<{ intentId: string; patch: { status: string; mp_payment_id?: string | null; updated_at: string } }> = []
  const creations: Array<{ body: Record<string, unknown>; idempotencyKey: string; accessToken: string }> = []
  const expirations: Array<{ intentId: string; appointmentId: string }> = []
  const baseNow = new Date('2026-04-13T14:00:00.000Z')

  const deps: Parameters<typeof processMercadoPagoPaymentRequest>[1] = {
    getPendingAppointment: async () => buildPendingAppointment(),
    getPaymentIntent: async () => buildPaymentIntent(),
    expirePendingIntent: async (intentId, appointmentId) => {
      expirations.push({ intentId, appointmentId })
    },
    getAccessToken: async () => 'mp_token_prod',
    fetchExistingPaymentStatus: async () => ({
      id: 9001,
      status: 'pending',
      status_detail: 'pending_waiting_payment',
    }),
    createPayment: async (input) => {
      creations.push(input)
      return {
        id: 777,
        status: 'pending',
        status_detail: 'pending_waiting_payment',
      }
    },
    updatePaymentIntent: async (intentId, patch) => {
      updates.push({ intentId, patch })
    },
    generateRandomId: () => 'random-uuid',
    getNow: () => baseNow,
    getBaseUrl: () => 'https://barbearia-leste.vercel.app',
    ...overrides,
  }

  return { deps, updates, creations, expirations }
}

describe('mercadopago payment route logic', () => {
  it('rejeita payload inválido antes de tocar em qualquer dependência', async () => {
    const { deps } = createDeps()
    const result = await processMercadoPagoPaymentRequest(
      {
        appointmentId: 'invalido',
        formData: {},
      },
      deps
    )

    assert.deepEqual(result, {
      status: 400,
      body: { error: 'Dados inválidos.' },
    })
  })

  it('expira o intent quando o prazo de pagamento venceu', async () => {
    const { deps, expirations } = createDeps({
      getPaymentIntent: async () => buildPaymentIntent({ expires_at: '2026-04-13T13:59:59.000Z' }),
    })

    const result = await processMercadoPagoPaymentRequest(
      {
        appointmentId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {
          payment_method_id: 'pix',
          payer: { email: 'maria@cliente.com' },
        },
      },
      deps
    )

    assert.deepEqual(result, {
      status: 409,
      body: { error: 'Prazo de pagamento expirado. Faça um novo agendamento.' },
    })
    assert.deepEqual(expirations, [{ intentId: 'intent-1', appointmentId: '123e4567-e89b-12d3-a456-426614174000' }])
  })

  it('reutiliza payment ainda vivo e atualiza o payment_intent local', async () => {
    const { deps, updates, creations } = createDeps({
      getPaymentIntent: async () => buildPaymentIntent({ mp_payment_id: 'mp-123', status: 'pending' }),
      fetchExistingPaymentStatus: async () => ({
        id: 123,
        status: 'approved',
        status_detail: 'accredited',
      }),
    })

    const result = await processMercadoPagoPaymentRequest(
      {
        appointmentId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {
          payment_method_id: 'pix',
          payer: { email: 'maria@cliente.com' },
        },
      },
      deps
    )

    assert.deepEqual(result, {
      status: 200,
      body: {
        status: 'approved',
        statusDetail: 'accredited',
        paymentId: 123,
        reused: true,
      },
    })
    assert.equal(creations.length, 0)
    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.patch.status, 'approved')
    assert.equal(updates[0]?.patch.mp_payment_id, '123')
  })

  it('cria um novo pagamento com payer enriquecido e notification_url padronizada', async () => {
    const { deps, updates, creations } = createDeps()

    const result = await processMercadoPagoPaymentRequest(
      {
        appointmentId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {
          payment_method_id: 'master',
          token: 'tok_test',
          installments: 1,
          payer: {
            email: '',
            identification: { type: 'CPF', number: '99999999999' },
          },
          transaction_amount: 999,
        },
      },
      deps
    )

    assert.equal(result.status, 200)
    assert.equal(creations.length, 1)
    assert.equal(creations[0]?.idempotencyKey, 'payment-intent:intent-1')
    assert.equal(creations[0]?.body.notification_url, 'https://barbearia-leste.vercel.app/api/webhooks/mercadopago?source_news=webhooks')
    assert.equal(creations[0]?.body.transaction_amount, 55)
    assert.deepEqual(creations[0]?.body.payer, {
      email: 'maria@cliente.com',
      first_name: 'Maria',
      last_name: 'Santos Pereira',
      identification: { type: 'CPF', number: '99999999999' },
      phone: { area_code: '11', number: '999998888' },
    })
    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.patch.status, 'pending')
    assert.equal(updates[0]?.patch.mp_payment_id, '777')
  })
})