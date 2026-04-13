import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PAYMENT_EXPIRY_MINUTES,
  MAX_PAYMENT_EXPIRY_MINUTES,
  buildPaymentExpirationIso,
  normalizePaymentExpiryMinutes,
} from '@/lib/mercadopago/payment-policy'

test('normalizePaymentExpiryMinutes aplica a política nova de hold curto', () => {
  assert.equal(DEFAULT_PAYMENT_EXPIRY_MINUTES, 5)
  assert.equal(MAX_PAYMENT_EXPIRY_MINUTES, 5)
  assert.equal(normalizePaymentExpiryMinutes(undefined), 5)
  assert.equal(normalizePaymentExpiryMinutes(null), 5)
  assert.equal(normalizePaymentExpiryMinutes(NaN), 5)
  assert.equal(normalizePaymentExpiryMinutes(0), 5)
  assert.equal(normalizePaymentExpiryMinutes(3), 3)
  assert.equal(normalizePaymentExpiryMinutes(5), 5)
  assert.equal(normalizePaymentExpiryMinutes(15), 5)
})

test('buildPaymentExpirationIso sempre calcula a expiração usando no máximo 5 minutos', () => {
  const now = new Date('2026-04-13T12:00:00.000Z')

  assert.equal(
    buildPaymentExpirationIso(now, undefined),
    '2026-04-13T12:05:00.000Z'
  )

  assert.equal(
    buildPaymentExpirationIso(now, 2),
    '2026-04-13T12:02:00.000Z'
  )

  assert.equal(
    buildPaymentExpirationIso(now, 20),
    '2026-04-13T12:05:00.000Z'
  )
})