-- ============================================================
-- LESTE BARBEARIA — Schema SQL Completo
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- === PROFILES ===
-- Espelho de auth.users, criado automaticamente via trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: cria profile automaticamente ao registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
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
  require_google_login BOOLEAN NOT NULL DEFAULT true,
  cancellation_window_minutes INTEGER NOT NULL DEFAULT 120,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  show_agency_brand BOOLEAN NOT NULL DEFAULT true,
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
  client_phone TEXT,
  barber_id UUID NOT NULL REFERENCES public.barbers(id),
  service_id UUID NOT NULL REFERENCES public.services(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado', 'cancelado', 'faltou')),
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
CREATE POLICY "Usuario ve proprios agendamentos" ON public.appointments
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

DROP POLICY IF EXISTS "Autenticado insere proprio agendamento" ON public.appointments;
CREATE POLICY "Autenticado insere proprio agendamento" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

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

-- --- storage.objects ---
DROP POLICY IF EXISTS "Leitura publica de imagens" ON storage.objects;
CREATE POLICY "Leitura publica de imagens" ON storage.objects
  FOR SELECT TO public
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
  (0, false, NULL,    NULL),     -- Domingo: fechado
  (1, true,  '09:00', '19:00'), -- Segunda
  (2, true,  '09:00', '19:00'), -- Terca
  (3, true,  '09:00', '19:00'), -- Quarta
  (4, true,  '09:00', '19:00'), -- Quinta
  (5, true,  '09:00', '19:00'), -- Sexta
  (6, true,  '09:00', '18:00') -- Sabado
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
