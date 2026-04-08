-- ─── Fase 2: Controles de Agenda ─────────────────────────────────────────
-- Adiciona colunas de controle de agenda na tabela business_config

ALTER TABLE public.business_config
ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER DEFAULT NULL;
-- NULL = sem limite. Quando definido, bloqueia novos agendamentos quando
-- o total de confirmados no dia atingir esse número.

ALTER TABLE public.business_config
ADD COLUMN IF NOT EXISTS block_multi_day_booking BOOLEAN NOT NULL DEFAULT FALSE;
-- TRUE = cliente não pode ter mais de 1 agendamento confirmado em datas diferentes

ALTER TABLE public.business_config
ADD COLUMN IF NOT EXISTS calendar_max_days_ahead INTEGER NOT NULL DEFAULT 30;
-- Quantos dias à frente o calendário fica aberto. Ex: 30 = só pode agendar
-- até 30 dias no futuro.

ALTER TABLE public.business_config
ADD COLUMN IF NOT EXISTS calendar_open_until_date DATE DEFAULT NULL;
-- Data limite absoluta de abertura do calendário. NULL = usa calendar_max_days_ahead.
-- Quando definida, o calendário fecha após essa data independente de max_days_ahead.

-- ─── Fase 2: Push Notifications ──────────────────────────────────────────
-- Tabela para armazenar subscriptions de push web

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- RLS: cada usuário só vê e gerencia suas próprias subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_own_select"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_own_insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_own_delete"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role pode SELECT/INSERT/DELETE (necessário para cron de lembretes)
CREATE POLICY "push_subscriptions_service_role"
  ON public.push_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
