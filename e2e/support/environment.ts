export const DEFAULT_PLAYWRIGHT_BASE_URL = 'https://lestebarbearia.agenciajn.com.br'

export const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_PLAYWRIGHT_BASE_URL

export const ALLOW_PROD_PAYMENT_E2E = process.env.ALLOW_PROD_PAYMENT_E2E === 'true'

export function isProductionLikeBaseUrl(url: string) {
  return /lestebarbearia\.agenciajn\.com\.br/i.test(url)
}