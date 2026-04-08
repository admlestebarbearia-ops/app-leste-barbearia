-- ============================================================
-- LESTE BARBEARIA — Fase 3: Gestão de Clientes + Sistema Financeiro
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

-- ─── 1. Adicionar status 'concluido' em appointments ─────────────────────
-- Remove e recria o CHECK constraint incluindo o novo status
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('confirmado', 'cancelado', 'faltou', 'concluido'));

-- ─── 2. Taxa padrão da maquininha em business_config ─────────────────────
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS default_card_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ─── 3. Tabela client_ratings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_ratings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  score        INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia ratings" ON public.client_ratings;
CREATE POLICY "Admin gerencia ratings"
  ON public.client_ratings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 4. Tabela financial_entries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  source          TEXT NOT NULL CHECK (source IN ('agendamento', 'produto', 'maquininha', 'manual')),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description     TEXT NOT NULL,
  payment_method  TEXT,
  card_rate_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(10,2) NOT NULL,
  reference_id    UUID,
  date            DATE NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_date   ON public.financial_entries(date);
CREATE INDEX IF NOT EXISTS idx_financial_entries_type   ON public.financial_entries(type);
CREATE INDEX IF NOT EXISTS idx_financial_entries_source ON public.financial_entries(source);

DROP TRIGGER IF EXISTS financial_entries_updated_at ON public.financial_entries;
CREATE TRIGGER financial_entries_updated_at
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia entradas financeiras" ON public.financial_entries;
CREATE POLICY "Admin gerencia entradas financeiras"
  ON public.financial_entries FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
