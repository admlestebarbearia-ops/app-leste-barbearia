import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PUBLIC_MP_METHOD_OPTIONS,
  buildPaymentBrickCustomization,
  getPublicMpMethodBadge,
} from '@/lib/mercadopago/checkout-config'

test('PUBLIC_MP_METHOD_OPTIONS expõe PIX, crédito, débito e saldo Mercado Pago', () => {
  assert.deepEqual(
    PUBLIC_MP_METHOD_OPTIONS.map((option) => option.id),
    ['pix', 'credito', 'debito', 'mercado_pago']
  )

  assert.deepEqual(
    PUBLIC_MP_METHOD_OPTIONS.map((option) => option.label),
    ['PIX', 'Crédito', 'Débito', 'Saldo MP']
  )
})

test('buildPaymentBrickCustomization filtra corretamente cada método público', () => {
  assert.deepEqual(buildPaymentBrickCustomization('pix'), {
    paymentMethods: { bankTransfer: 'all' },
    visual: {
      style: { theme: 'dark' },
      hideFormTitle: true,
      defaultPaymentOption: { bankTransferForm: true },
    },
  })

  assert.deepEqual(buildPaymentBrickCustomization('credito'), {
    paymentMethods: { creditCard: 'all' },
    visual: {
      style: { theme: 'dark' },
      hideFormTitle: true,
      defaultPaymentOption: { creditCardForm: true },
    },
  })

  assert.deepEqual(buildPaymentBrickCustomization('debito'), {
    paymentMethods: { debitCard: 'all' },
    visual: {
      style: { theme: 'dark' },
      hideFormTitle: true,
      defaultPaymentOption: { debitCardForm: true },
    },
  })

  assert.deepEqual(buildPaymentBrickCustomization('mercado_pago'), {
    paymentMethods: { mercadoPago: 'all' },
    visual: {
      style: { theme: 'dark' },
      hideFormTitle: true,
      defaultPaymentOption: { walletForm: true },
    },
  })
})

test('getPublicMpMethodBadge retorna o texto curto da etapa de pagamento', () => {
  assert.equal(getPublicMpMethodBadge('pix'), 'Pagamento via PIX')
  assert.equal(getPublicMpMethodBadge('credito'), 'Pagamento via Cartão de Crédito')
  assert.equal(getPublicMpMethodBadge('debito'), 'Pagamento via Cartão de Débito')
  assert.equal(getPublicMpMethodBadge('mercado_pago'), 'Pagamento com saldo Mercado Pago')
})