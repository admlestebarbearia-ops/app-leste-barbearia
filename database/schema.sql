-- ============================================================
-- LESTE BARBEARIA — Schema SQL Completo
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- === PROFILES ===
-- Espelho de auth.users, criado automaticamente via trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona coluna email se ja existir a tabela sem ela
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Trigger: cria profile automaticamente ao registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- === BUSINESS CONFIG (Singleton — apenas 1 linha) ===
CREATE TABLE IF NOT EXISTS public.business_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  barber_name TEXT NOT NULL DEFAULT 'Willians Lopes',
  barber_nickname TEXT NOT NULL DEFAULT 'China',
  display_name_preference TEXT NOT NULL DEFAULT 'nickname'
    CHECK (display_name_preference IN ('name', 'nickname')),
  barber_photo_url TEXT,
  logo_url TEXT,
  bottom_logo_url TEXT,
  require_google_login BOOLEAN NOT NULL DEFAULT true,
  cancellation_window_minutes INTEGER NOT NULL DEFAULT 120,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  show_agency_brand BOOLEAN NOT NULL DEFAULT true,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_message TEXT,
  pause_return_time TIMESTAMPTZ,
  enable_gallery BOOLEAN NOT NULL DEFAULT false,
  allow_client_uploads BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.business_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- === BARBERS ===
CREATE TABLE IF NOT EXISTS public.barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nickname TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === SERVICES ===
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  icon_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === WORKING HOURS ===
CREATE TABLE IF NOT EXISTS public.working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT false,
  open_time TIME,
  close_time TIME,
  lunch_start TIME,
  lunch_end TIME,
  UNIQUE(day_of_week)
);

-- === SPECIAL SCHEDULES (folgas, feriados, horario especial) ===
CREATE TABLE IF NOT EXISTS public.special_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  is_closed BOOLEAN NOT NULL DEFAULT true,
  open_time TIME,
  close_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === APPOINTMENTS ===
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Modo Google Login: client_id preenchido
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Modo livre: client_name + client_phone preenchidos
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  barber_id UUID NOT NULL REFERENCES public.barbers(id),
  service_id UUID NOT NULL REFERENCES public.services(id),
  service_name_snapshot TEXT,
  service_price_snapshot NUMERIC(10,2),
  service_duration_minutes_snapshot INTEGER,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado', 'cancelado', 'faltou')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Garantir que pelo menos um identificador de cliente existe
  CONSTRAINT client_identifier CHECK (
    client_id IS NOT NULL OR (client_name IS NOT NULL AND client_phone IS NOT NULL)
  )
);

-- Index para queries frequentes
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- === STORAGE ===
-- Buckets publicos para exibir logo e foto do barbeiro
INSERT INTO storage.buckets (id, name, public)
VALUES ('logo', 'logo', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('barbeiro-foto', 'barbeiro-foto', true)
ON CONFLICT (id) DO NOTHING;

-- === BLOCKED DEVICES ===
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  session_id TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === GALLERY PHOTOS ===
CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved')),
  user_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

-- Helper: verifica se o usuario atual e admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- --- profiles ---
DROP POLICY IF EXISTS "Usuario ve proprio perfil" ON public.profiles;
CREATE POLICY "Usuario ve proprio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Admin atualiza perfis" ON public.profiles;
CREATE POLICY "Admin atualiza perfis" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- --- business_config ---
-- Leitura publica (necessario para a pagina de login saber o modo)
DROP POLICY IF EXISTS "Leitura publica de config" ON public.business_config;
CREATE POLICY "Leitura publica de config" ON public.business_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin atualiza config" ON public.business_config;
CREATE POLICY "Admin atualiza config" ON public.business_config
  FOR UPDATE USING (public.is_admin());

-- --- barbers ---
DROP POLICY IF EXISTS "Leitura publica de barbeiros" ON public.barbers;
CREATE POLICY "Leitura publica de barbeiros" ON public.barbers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia barbeiros" ON public.barbers;
CREATE POLICY "Admin gerencia barbeiros" ON public.barbers
  FOR ALL USING (public.is_admin());

-- --- services ---
DROP POLICY IF EXISTS "Leitura publica de servicos" ON public.services;
CREATE POLICY "Leitura publica de servicos" ON public.services
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia servicos" ON public.services;
CREATE POLICY "Admin gerencia servicos" ON public.services
  FOR ALL USING (public.is_admin());

-- --- working_hours ---
DROP POLICY IF EXISTS "Leitura publica de horarios" ON public.working_hours;
CREATE POLICY "Leitura publica de horarios" ON public.working_hours
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia horarios" ON public.working_hours;
CREATE POLICY "Admin gerencia horarios" ON public.working_hours
  FOR ALL USING (public.is_admin());

-- --- special_schedules ---
DROP POLICY IF EXISTS "Leitura publica de datas especiais" ON public.special_schedules;
CREATE POLICY "Leitura publica de datas especiais" ON public.special_schedules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia datas especiais" ON public.special_schedules;
CREATE POLICY "Admin gerencia datas especiais" ON public.special_schedules
  FOR ALL USING (public.is_admin());

-- --- appointments ---
DROP POLICY IF EXISTS "Usuario ve proprios agendamentos" ON public.appointments;
DROP POLICY IF EXISTS "Usuario ve agendamentos" ON public.appointments;
CREATE POLICY "Usuario ve agendamentos" ON public.appointments
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin() OR client_id IS NULL);

DROP POLICY IF EXISTS "Autenticado insere proprio agendamento" ON public.appointments;
DROP POLICY IF EXISTS "Autenticado insere agendamento" ON public.appointments;
CREATE POLICY "Autenticado insere agendamento" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id OR public.is_admin());

DROP POLICY IF EXISTS "Anonimo insere agendamento livre" ON public.appointments;
CREATE POLICY "Anonimo insere agendamento livre" ON public.appointments
  FOR INSERT TO anon
  WITH CHECK (client_id IS NULL AND client_name IS NOT NULL AND client_phone IS NOT NULL);

DROP POLICY IF EXISTS "Usuario cancela proprio agendamento" ON public.appointments;
CREATE POLICY "Usuario cancela proprio agendamento" ON public.appointments
  FOR UPDATE USING (auth.uid() = client_id)
  WITH CHECK (status = 'cancelado');

DROP POLICY IF EXISTS "Admin atualiza todos agendamentos" ON public.appointments;
CREATE POLICY "Admin atualiza todos agendamentos" ON public.appointments
  FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS "Admin insere todos agendamentos" ON public.appointments;
CREATE POLICY "Admin insere todos agendamentos" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- --- storage.objects ---
DROP POLICY IF EXISTS "Leitura publica de imagens" ON storage.objects;
CREATE POLICY "Leitura publica de imagens" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('logo', 'barbeiro-foto'));

DROP POLICY IF EXISTS "Admin envia imagens" ON storage.objects;
CREATE POLICY "Admin envia imagens" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('logo', 'barbeiro-foto')
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admin atualiza imagens" ON storage.objects;
CREATE POLICY "Admin atualiza imagens" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('logo', 'barbeiro-foto')
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id IN ('logo', 'barbeiro-foto')
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admin remove imagens" ON storage.objects;
CREATE POLICY "Admin remove imagens" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('logo', 'barbeiro-foto')
    AND public.is_admin()
  );

-- --- blocked_devices ---
DROP POLICY IF EXISTS "Admin gerencia dispositivos bloqueados" ON public.blocked_devices;
CREATE POLICY "Admin gerencia dispositivos bloqueados" ON public.blocked_devices
  FOR ALL USING (public.is_admin());

-- --- gallery_photos ---
DROP POLICY IF EXISTS "Leitura publica de fotos aprovadas" ON public.gallery_photos;
CREATE POLICY "Leitura publica de fotos aprovadas" ON public.gallery_photos
  FOR SELECT USING (status = 'approved' OR public.is_admin());

DROP POLICY IF EXISTS "Qualquer um pode enviar foto da galeria" ON public.gallery_photos;
CREATE POLICY "Qualquer um pode enviar foto da galeria" ON public.gallery_photos
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin gerencia fotos da galeria" ON public.gallery_photos;
CREATE POLICY "Admin gerencia fotos da galeria" ON public.gallery_photos
  FOR ALL USING (public.is_admin());

-- ============================================================
-- SEED DATA
-- ============================================================

-- Barbeiro inicial
INSERT INTO public.barbers (name, nickname)
SELECT 'Willians Lopes', 'China'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.barbers
  WHERE name = 'Willians Lopes'
);

-- Servicos iniciais
INSERT INTO public.services (name, price, duration_minutes)
SELECT 'Cabelo', 30.00, 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.services WHERE name = 'Cabelo'
);

INSERT INTO public.services (name, price, duration_minutes)
SELECT 'Barba', 25.00, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.services WHERE name = 'Barba'
);

INSERT INTO public.services (name, price, duration_minutes)
SELECT 'Cabelo + Barba', 50.00, 50
WHERE NOT EXISTS (
  SELECT 1 FROM public.services WHERE name = 'Cabelo + Barba'
);

-- Horarios de funcionamento padrao (Seg-Sab, 9h-19h)
-- O admin pode alterar via painel no primeiro acesso (onboarding)
INSERT INTO public.working_hours (day_of_week, is_open, open_time, close_time) VALUES
  (0, false, NULL,    NULL),
  (1, true,  '09:00', '19:00'),
  (2, true,  '09:00', '19:00'),
  (3, true,  '09:00', '19:00'),
  (4, true,  '09:00', '19:00'),
  (5, true,  '09:00', '19:00'),
  (6, true,  '09:00', '18:00')
ON CONFLICT (day_of_week) DO NOTHING;

-- ============================================================
-- PARA DEFINIR O ADMIN:
-- Apos o Willians fazer login pela primeira vez com Google,
-- execute o SQL abaixo substituindo pelo email dele:
--
-- UPDATE public.profiles
-- SET is_admin = true
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'email_do_willians@gmail.com'
-- );
-- ============================================================

-- ============================================================
-- MIGRAÇÃO: Adicionar colunas novas ao banco existente
-- Execute no SQL Editor do Supabase se a tabela já existia antes
-- ============================================================
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS bottom_logo_url TEXT;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS pause_message TEXT;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS pause_return_time TIMESTAMPTZ;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS enable_gallery BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS allow_client_uploads BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS show_tolerance_modal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_name_snapshot TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_price_snapshot NUMERIC(10,2);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_duration_minutes_snapshot INTEGER;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS icon_name TEXT;
