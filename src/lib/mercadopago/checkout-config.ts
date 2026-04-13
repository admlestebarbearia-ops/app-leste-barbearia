import type { IPaymentBrickCustomization } from '@mercadopago/sdk-react/esm/bricks/payment/type'

export type PublicMpMethod = 'pix' | 'credito' | 'debito' | 'mercado_pago'

export interface PublicMpMethodOption {
  id: PublicMpMethod
  label: string
  subtitle: string
}

export const PUBLIC_MP_METHOD_OPTIONS: PublicMpMethodOption[] = [
  { id: 'pix', label: 'PIX', subtitle: 'Instantâneo' },
  { id: 'credito', label: 'Crédito', subtitle: '1x no app' },
  { id: 'debito', label: 'Débito', subtitle: 'Pagamento online' },
  { id: 'mercado_pago', label: 'Saldo MP', subtitle: 'Conta Mercado Pago' },
]

export function buildPaymentBrickCustomization(paymentMethod?: PublicMpMethod): IPaymentBrickCustomization {
  const paymentMethods: IPaymentBrickCustomization['paymentMethods'] = paymentMethod === 'pix'
    ? { bankTransfer: 'all' }
    : paymentMethod === 'credito'
    ? { creditCard: 'all' }
    : paymentMethod === 'debito'
    ? { debitCard: 'all' }
    : paymentMethod === 'mercado_pago'
    ? { mercadoPago: 'all' }
    : { mercadoPago: 'all', creditCard: 'all', debitCard: 'all', bankTransfer: 'all' }

  const visual: NonNullable<IPaymentBrickCustomization['visual']> = {
    style: { theme: 'dark' },
    hideFormTitle: true,
    ...(paymentMethod === 'pix'
      ? { defaultPaymentOption: { bankTransferForm: true } }
      : paymentMethod === 'credito'
      ? { defaultPaymentOption: { creditCardForm: true } }
      : paymentMethod === 'debito'
      ? { defaultPaymentOption: { debitCardForm: true } }
      : paymentMethod === 'mercado_pago'
      ? { defaultPaymentOption: { walletForm: true } }
      : {}),
  }

  return {
    paymentMethods,
    visual,
  }
}

export function getPublicMpMethodBadge(method: PublicMpMethod) {
  switch (method) {
    case 'pix':
      return 'Pagamento via PIX'
    case 'credito':
      return 'Pagamento via Cartão de Crédito'
    case 'debito':
      return 'Pagamento via Cartão de Débito'
    case 'mercado_pago':
      return 'Pagamento com saldo Mercado Pago'
  }
}