export const DEFAULT_PAYMENT_EXPIRY_MINUTES = 5
export const MAX_PAYMENT_EXPIRY_MINUTES = 5

export function normalizePaymentExpiryMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_PAYMENT_EXPIRY_MINUTES
  }

  const normalized = Math.floor(value)
  if (normalized < 1) {
    return DEFAULT_PAYMENT_EXPIRY_MINUTES
  }

  return Math.min(normalized, MAX_PAYMENT_EXPIRY_MINUTES)
}

export function buildPaymentExpirationIso(now: Date, configuredMinutes: number | null | undefined) {
  const expiryMinutes = normalizePaymentExpiryMinutes(configuredMinutes)
  return new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString()
}