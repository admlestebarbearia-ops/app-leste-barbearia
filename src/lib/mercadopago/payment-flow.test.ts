import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPaymentCreationIdempotencyKey,
  isPaymentIntentExpired,
  mapMercadoPagoStatusToIntentStatus,
  shouldReuseMercadoPagoPayment,
  validateMercadoPagoPaymentRequest,
} from '@/lib/mercadopago/payment-flow'

test('mapMercadoPagoStatusToIntentStatus normaliza os estados do gateway', () => {
  assert.equal(mapMercadoPagoStatusToIntentStatus('approved'), 'approved')
  assert.equal(mapMercadoPagoStatusToIntentStatus('pending'), 'pending')
  assert.equal(mapMercadoPagoStatusToIntentStatus('in_process'), 'pending')
  assert.equal(mapMercadoPagoStatusToIntentStatus('rejected'), 'rejected')
  assert.equal(mapMercadoPagoStatusToIntentStatus('cancelled'), 'cancelled')
  assert.equal(mapMercadoPagoStatusToIntentStatus('refunded'), 'cancelled')
  assert.equal(mapMercadoPagoStatusToIntentStatus('charged_back'), 'cancelled')
  assert.equal(mapMercadoPagoStatusToIntentStatus('expired'), 'expired')
})

test('shouldReuseMercadoPagoPayment reutiliza apenas pagamentos ainda vivos', () => {
  assert.equal(shouldReuseMercadoPagoPayment('approved'), true)
  assert.equal(shouldReuseMercadoPagoPayment('pending'), true)
  assert.equal(shouldReuseMercadoPagoPayment('in_process'), true)
  assert.equal(shouldReuseMercadoPagoPayment('rejected'), false)
  assert.equal(shouldReuseMercadoPagoPayment('cancelled'), false)
  assert.equal(shouldReuseMercadoPagoPayment('expired'), false)
})

test('isPaymentIntentExpired detecta expiração corretamente', () => {
  const now = new Date('2026-04-12T12:00:00.000Z')
  assert.equal(isPaymentIntentExpired('2026-04-12T11:59:59.000Z', now), true)
  assert.equal(isPaymentIntentExpired('2026-04-12T12:00:01.000Z', now), false)
  assert.equal(isPaymentIntentExpired(null, now), false)
})

test('buildPaymentCreationIdempotencyKey é determinístico por intent', () => {
  assert.equal(
    buildPaymentCreationIdempotencyKey('abc-123'),
    buildPaymentCreationIdempotencyKey('abc-123')
  )
})

test('validateMercadoPagoPaymentRequest valida PIX e cartão sem aceitar payload quebrado', () => {
  assert.equal(validateMercadoPagoPaymentRequest({
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    amount: 25,
    description: 'Barba',
    formData: {
      payment_method_id: 'pix',
      payer: { email: 'cliente@teste.com' },
    },
  }), null)

  assert.equal(validateMercadoPagoPaymentRequest({
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    amount: 25,
    description: 'Barba',
    formData: {
      payment_method_id: 'master',
      token: 'tok_test',
      installments: 1,
      payer: { email: 'cliente@teste.com' },
    },
  }), null)

  assert.equal(validateMercadoPagoPaymentRequest({
    appointmentId: 'invalido',
    amount: 25,
    description: 'Barba',
    formData: {
      payment_method_id: 'pix',
      payer: { email: 'cliente@teste.com' },
    },
  }), 'Agendamento inválido.')

  assert.equal(validateMercadoPagoPaymentRequest({
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    amount: 0,
    description: 'Barba',
    formData: {
      payment_method_id: 'pix',
      payer: { email: 'cliente@teste.com' },
    },
  }), 'Valor de pagamento inválido.')

  assert.equal(validateMercadoPagoPaymentRequest({
    appointmentId: '123e4567-e89b-12d3-a456-426614174000',
    amount: 25,
    description: 'Barba',
    formData: {
      payment_method_id: 'master',
      installments: 1,
      payer: { email: 'cliente@teste.com' },
    },
  }), 'Token de pagamento inválido.')
})