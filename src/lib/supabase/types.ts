export type AppointmentStatus = 'confirmado' | 'cancelado' | 'faltou'
export type DisplayNamePreference = 'name' | 'nickname'
export type GalleryPhotoStatus = 'pending' | 'approved'

export interface Profile {
  id: string
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
  whatsapp_number: string | null
  instagram_url: string | null
  address: string | null
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
  client_phone: string | null
  barber_id: string
  service_id: string
  date: string
  start_time: string
  status: AppointmentStatus
  created_at: string
  services?: Pick<Service, 'name' | 'price' | 'duration_minutes'>
  profiles?: Pick<Profile, 'is_blocked'> & { display_name?: string; email?: string | null }
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
