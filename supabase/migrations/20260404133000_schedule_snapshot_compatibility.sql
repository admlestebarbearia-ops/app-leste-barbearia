ALTER TABLE public.business_config
ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS client_email TEXT;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_name_snapshot TEXT;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_price_snapshot NUMERIC(10,2);

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_duration_minutes_snapshot INTEGER;