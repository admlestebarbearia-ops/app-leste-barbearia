import { createHmac, timingSafeEqual } from 'crypto'
import { mapMercadoPagoStatusToIntentStatus } from '@/lib/mercadopago/payment-flow'
import type { PaymentIntentStatus, PaymentMethod } from '@/lib/supabase/types'

const ALLOWED_FORM_FIELDS = [
  'token',
  'payment_method_id',
  'payment_type_id',
  'installments',
  'issuer_id',
  'payer',
] as const

type MercadoPagoPhone = {
  area_code?: string
  number?: string
}

type MercadoPagoPayer = {
  email?: string
  first_name?: string
  last_name?: string
  identification?: {
    type?: string
    number?: string
  }
  phone?: MercadoPagoPhone
} & Record<string, unknown>

export interface TrustedPayerData {
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeMercadoPagoDataId(dataId: string | null | undefined) {
  if (!dataId) return null
  return /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
}

export function buildProductReservationExternalReference(reservationId: string) {
  return `product_reservation:${reservationId}`
}

export function parseMercadoPagoExternalReference(externalReference: string | null | undefined):
  | { kind: 'appointment'; id: string }
  | { kind: 'product_reservation'; id: string }
  | null {
  const normalized = externalReference?.trim()

  if (!normalized) return null

  if (normalized.startsWith('product_reservation:')) {
    const id = normalized.slice('product_reservation:'.length)
    return id ? { kind: 'product_reservation', id } : null
  }

  return { kind: 'appointment', id: normalized }
}

export function mapMercadoPagoPaymentMethod(
  paymentMethodId: string | null | undefined,
  paymentTypeId: string | null | undefined
): PaymentMethod | null {
  const method = paymentMethodId?.trim().toLowerCase() ?? ''
  const type = paymentTypeId?.trim().toLowerCase() ?? ''

  if (method === 'pix' || type === 'bank_transfer') return 'pix'
  if (method === 'account_money' || type === 'account_money') return 'mercado_pago'
  if (type === 'debit_card') return 'debito'
  if (type === 'credit_card') return 'credito'

  return null
}

export function sanitizeMercadoPagoFormData(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) =>
      (ALLOWED_FORM_FIELDS as readonly string[]).includes(key)
    )
  )
}

export function splitPayerName(fullName: string | null | undefined) {
  const normalized = (fullName ?? '').trim().replace(/\s+/g, ' ')

  if (!normalized) return { first_name: undefined, last_name: undefined }

  const [firstName, ...rest] = normalized.split(' ')
  return {
    first_name: firstName,
    last_name: rest.length > 0 ? rest.join(' ') : undefined,
  }
}

export function buildMercadoPagoPhone(phone: string | null | undefined): MercadoPagoPhone | undefined {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return undefined

  const normalized = digits.length > 11 ? digits.slice(-11) : digits
  return {
    area_code: normalized.slice(0, 2),
    number: normalized.slice(2),
  }
}

export function buildTrustedMercadoPagoPayer(
  formPayer: unknown,
  trustedPayer: TrustedPayerData
): MercadoPagoPayer {
  const safePayer = isRecord(formPayer) ? { ...formPayer } as MercadoPagoPayer : {}
  const trustedName = splitPayerName(trustedPayer.clientName)
  const trustedPhone = buildMercadoPagoPhone(trustedPayer.clientPhone)
  const currentPhone = isRecord(safePayer.phone) ? { ...safePayer.phone } as MercadoPagoPhone : undefined

  if (!hasText(safePayer.email) && hasText(trustedPayer.clientEmail)) {
    safePayer.email = trustedPayer.clientEmail.trim()
  }

  if (!hasText(safePayer.first_name) && trustedName.first_name) {
    safePayer.first_name = trustedName.first_name
  }

  if (!hasText(safePayer.last_name) && trustedName.last_name) {
    safePayer.last_name = trustedName.last_name
  }

  const mergedPhone = {
    area_code: hasText(currentPhone?.area_code) ? currentPhone.area_code : trustedPhone?.area_code,
    number: hasText(currentPhone?.number) ? currentPhone.number : trustedPhone?.number,
  }

  if (hasText(mergedPhone.area_code) && hasText(mergedPhone.number)) {
    safePayer.phone = mergedPhone
  } else {
    delete safePayer.phone
  }

  return safePayer
}

export function buildMercadoPagoNotificationUrl(baseUrl: string) {
  const url = new URL('/api/webhooks/mercadopago', baseUrl)
  url.searchParams.set('source_news', 'webhooks')
  return url.toString()
}

export function buildMercadoPagoWebhookManifest(
  dataId: string | null,
  xRequestId: string | null,
  timestamp: string | null
) {
  const manifestParts: string[] = []
  const normalizedDataId = normalizeMercadoPagoDataId(dataId)

  if (normalizedDataId) manifestParts.push(`id:${normalizedDataId}`)
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`)
  if (timestamp) manifestParts.push(`ts:${timestamp}`)

  return manifestParts.join(';') + ';'
}

export function validateMercadoPagoWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string
) {
  if (!xSignature) return false

  let timestamp: string | null = null
  let receivedHash: string | null = null

  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=')
    if (key?.trim() === 'ts') timestamp = value?.trim() ?? null
    if (key?.trim() === 'v1') receivedHash = value?.trim() ?? null
  }

  if (!timestamp || !receivedHash) return false

  const manifest = buildMercadoPagoWebhookManifest(dataId, xRequestId, timestamp)
  const computedHash = createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(receivedHash, 'hex'))
  } catch {
    return false
  }
}

export function getMercadoPagoWebhookTransition(status: string): {
  appointmentStatus: 'confirmado' | 'cancelado' | null
  intentStatus: PaymentIntentStatus | null
} {
  if (status === 'approved') {
    return {
      appointmentStatus: 'confirmado',
      intentStatus: 'approved',
    }
  }

  if (status === 'pending' || status === 'in_process') {
    return {
      appointmentStatus: null,
      intentStatus: mapMercadoPagoStatusToIntentStatus(status),
    }
  }

  if (
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'refunded' ||
    status === 'charged_back'
  ) {
    return {
      appointmentStatus: 'cancelado',
      intentStatus: mapMercadoPagoStatusToIntentStatus(status),
    }
  }

  return {
    appointmentStatus: null,
    intentStatus: null,
  }
}