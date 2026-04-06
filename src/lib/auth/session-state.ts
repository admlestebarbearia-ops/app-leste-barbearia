import type { User } from '@supabase/supabase-js'

export const GUEST_BOOKING_PHONE_COOKIE = 'guest_booking_phone'

export function normalizePhoneLookup(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export function isAuthenticatedUser(user: Pick<User, 'is_anonymous'> | null | undefined): user is User {
  return !!user && !user.is_anonymous
}

export function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}