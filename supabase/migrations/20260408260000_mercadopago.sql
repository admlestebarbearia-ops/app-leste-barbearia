-- ============================================================
-- Fase 4: Integração Mercado Pago
-- ============================================================

-- 1. Adicionar status 'aguardando_pagamento' ao CHECK de appointments
--    O Postgres não suporta ALTER TABLE ... DROP CONSTRAINT por nome direto,
--    então precisamos recriar a constraint com o novo valor.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('confirmado', 'cancelado', 'faltou', 'concluido', 'aguardando_pagamento'));

-- 2. Adicionar colunas de MP na business_config
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'presencial'
    CHECK (payment_mode IN ('presencial', 'online_obrigatorio')),
  ADD COLUMN IF NOT EXISTS mp_access_token TEXT,
  ADD COLUMN IF NOT EXISTS mp_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS payment_expiry_minutes INTEGER NOT NULL DEFAULT 15;

-- 3. Criar tabela payment_intents
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  mp_preference_id TEXT NOT NULL,
  mp_payment_id TEXT,            -- preenchido pelo webhook após pagamento
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  amount NUMERIC(10,2) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para cron de expiração
CREATE INDEX IF NOT EXISTS idx_payment_intents_status_expires ON public.payment_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_intents_appointment ON public.payment_intents(appointment_id);

-- RLS: apenas service_role acessa payment_intents (nenhuma leitura pública)
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- Admin lê via service_role (sem policy pública necessária)
-- Service role bypassa RLS automaticamente

-- 4. Adicionar 'concluido' ao check caso ainda não exista (compatibilidade)
--    (já pode ter sido adicionado em migration anterior da Fase 3)
--    O DROP/ADD acima já inclui 'concluido', então ok.
