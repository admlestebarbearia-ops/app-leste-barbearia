export type AppointmentStatus = 'confirmado' | 'cancelado' | 'faltou' | 'concluido' | 'aguardando_pagamento'
export type PaymentMode = 'presencial' | 'online_obrigatorio'
export type PaymentIntentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'
export type DisplayNamePreference = 'name' | 'nickname'
export type GalleryPhotoStatus = 'pending' | 'approved'
export type PaymentMethod = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'mercado_pago'

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  is_admin: boolean
  is_blocked: boolean
  created_at: string
}

export interface BusinessConfig {
  id: number
  barber_name: string
  barber_nickname: string
  display_name_preference: DisplayNamePreference
  barber_photo_url: string | null
  logo_url: string | null
  admin_logo_url: string | null
  bottom_logo_url: string | null
  require_google_login: boolean
  cancellation_window_minutes: number
  onboarding_complete: boolean
  show_agency_brand: boolean
  is_paused: boolean
  pause_message: string | null
  pause_return_time: string | null
  enable_gallery: boolean
  allow_client_uploads: boolean
  enable_products: boolean
  whatsapp_number: string | null
  instagram_url: string | null
  address: string | null
  slot_interval_minutes: number
  // ─── Fase 2: Controles de Agenda ─────────────────────────────────────
  max_appointments_per_day: number | null   // null = sem limite configurado (usa padrão 3)
  block_multi_day_booking: boolean          // bloqueia cliente com agendamento em data diferente
  calendar_max_days_ahead: number           // dias à frente que o calendário fica aberto (padrão 30)
  calendar_open_until_date: string | null   // data limite absoluta (YYYY-MM-DD) ou null
  // ─── Fase 3: Financeiro ───────────────────────────────────────────────
  has_card_machine: boolean                 // o estabelecimento usa maquininha?
  default_card_rate_pct: number             // legado — mantido por compatibilidade
  debit_rate_pct: number                    // taxa cartão de débito (%)
  credit_rate_pct: number                   // taxa cartão de crédito (%)
  // ─── Fase 4: Mercado Pago ─────────────────────────────────────────────
  payment_mode: PaymentMode                 // 'presencial' | 'online_obrigatorio'
  aceita_dinheiro: boolean                  // quando online_obrigatorio, permite cliente escolher pagar em dinheiro
  mp_access_token: string | null            // token de acesso MP (null = não configurado)
  mp_refresh_token: string | null           // refresh token OAuth MP
  mp_public_key: string | null              // chave pública MP salva no OAuth (APP_USR-...)
  mp_webhook_secret: string | null          // assinatura secreta de webhook MP (legado)
  payment_expiry_minutes: number            // minutos para expirar payment_intent (padrão 5, máximo 5)
  updated_at: string
}

export interface Barber {
  id: string
  name: string
  nickname: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
}

export interface Service {
  id: string
  name: string
  price: number
  duration_minutes: number
  icon_name: string | null
  is_active: boolean
  created_at: string
}

export interface WorkingHours {
  id: string
  day_of_week: number
  is_open: boolean
  open_time: string | null
  close_time: string | null
  lunch_start: string | null
  lunch_end: string | null
}

export interface SpecialSchedule {
  id: string
  date: string
  is_closed: boolean
  open_time: string | null
  close_time: string | null
  reason: string | null
  created_at: string
}

export interface Appointment {
  id: string
  client_id: string | null
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  barber_id: string
  service_id: string
  service_name_snapshot?: string | null
  service_price_snapshot?: number | null
  service_duration_minutes_snapshot?: number | null
  date: string
  start_time: string
  status: AppointmentStatus
  deleted_at: string | null
  admin_hidden_at: string | null
  created_at: string
  services?: Pick<Service, 'name' | 'price' | 'duration_minutes'>
  profiles?: Pick<Profile, 'is_blocked'> & { display_name?: string; email?: string | null; phone?: string | null }
  client_ratings?: Pick<ClientRating, 'score' | 'note'> | null
}

export interface BlockedDevice {
  id: string
  ip_address: string | null
  session_id: string | null
  phone: string | null
  created_at: string
}

export interface GalleryPhoto {
  id: string
  url: string
  status: GalleryPhotoStatus
  user_name: string | null
  user_id: string | null
  created_at: string
}

// ─── Fase 3: Rating e Financeiro ────────────────────────────────────────────
export type FinancialEntryType = 'receita' | 'despesa'
export type FinancialEntrySource = 'agendamento' | 'produto' | 'estorno' | 'manual'

export interface ClientRating {
  id: string
  appointment_id: string
  client_id: string | null
  score: number
  note: string | null
  created_at: string
}

export interface FinancialEntry {
  id: string
  type: FinancialEntryType
  source: FinancialEntrySource
  amount: number
  description: string
  payment_method: PaymentMethod | null
  card_rate_pct: number
  net_amount: number
  reference_id: string | null
  date: string
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Produtos ────────────────────────────────────────────────────────────────
export type ProductReservationStatus = 'aguardando_pagamento' | 'reservado' | 'cancelado' | 'retirado'

export interface Product {
  id: string
  name: string
  short_description: string | null
  full_description: string | null   // descrição completa
  size_info: string | null          // indicação de tamanhos / variações
  price: number
  stock_quantity: number   // -1 = ilimitado
  is_active: boolean
  reserve_enabled: boolean
  cover_image_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductReservation {
  id: string
  product_id: string
  appointment_id: string | null
  client_id: string | null
  client_phone: string | null
  quantity: number
  status: ProductReservationStatus
  product_name_snapshot: string
  product_price_snapshot: number
  product_image_snapshot: string | null
  created_at: string
  updated_at: string
  products?: Pick<Product, 'name' | 'cover_image_url' | 'price'>
  profiles?: {
    display_name: string | null
    email: string | null
    phone: string | null
  } | null
}

// ─── Fase 4: Mercado Pago ────────────────────────────────────────────────────
export interface PaymentIntent {
  id: string
  appointment_id: string
  mp_preference_id: string | null
  mp_payment_id: string | null
  payment_method: PaymentMethod | null
  refunded_at: string | null
  status: PaymentIntentStatus
  amount: number
  expires_at: string
  created_at: string
  updated_at: string
}

export interface ProductPaymentIntent {
  id: string
  reservation_id: string
  mp_preference_id: string | null
  mp_payment_id: string | null
  payment_method: PaymentMethod | null
  refunded_at: string | null
  status: PaymentIntentStatus
  amount: number
  expires_at: string
  created_at: string
  updated_at: string
}
