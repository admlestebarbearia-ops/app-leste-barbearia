// Colunas de business_config que PODEM ir para o navegador.
//
// Gerada a partir do schema real, removendo apenas os segredos. Existe porque
// um select-tudo em /agendar/page.tsx colocava mp_access_token e
// mp_refresh_token no HTML publico: o config e passado como prop para
// <BookingForm> (Client Component), e o Next serializa props no payload RSC,
// que vai para o navegador de TODO visitante. Confirmado em producao em
// 13/09/2026 e corrigido no mesmo dia.
//
// REGRA: nunca use select('*') em business_config num caminho que chegue ao
// cliente. Use esta constante.
//
// NUNCA incluir aqui: mp_access_token, mp_refresh_token, mp_webhook_secret.
export const PUBLIC_CONFIG_COLUMN_LIST = [
  "aceita_dinheiro",
  "address",
  "admin_logo_url",
  "admin_nav_tabs",
  "allow_client_uploads",
  "auto_conclude_enabled",
  "barber_name",
  "barber_nickname",
  "barber_photo_url",
  "block_multi_day_booking",
  "bottom_logo_url",
  "calendar_max_days_ahead",
  "calendar_open_until_date",
  "cancellation_window_minutes",
  "credit_rate_pct",
  "debit_rate_pct",
  "default_card_rate_pct",
  "display_name_preference",
  "distant_booking_threshold_days",
  "enable_gallery",
  "enable_products",
  "has_card_machine",
  "id",
  "instagram_url",
  "is_paused",
  "logo_url",
  "max_appointments_per_day",
  "mp_public_key",
  "onboarding_complete",
  "pause_message",
  "pause_return_time",
  "payment_expiry_minutes",
  "payment_mode",
  "require_advance_payment_distant_bookings",
  "require_google_login",
  "show_agency_brand",
  "show_tolerance_modal",
  "slot_interval_minutes",
  "tolerance_minutes",
  "updated_at",
  "whatsapp_number",
] as const

export const PUBLIC_CONFIG_COLUMNS = PUBLIC_CONFIG_COLUMN_LIST.join(', ')
