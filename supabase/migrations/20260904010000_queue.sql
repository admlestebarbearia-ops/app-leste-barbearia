-- ============================================================
-- Sistema de Fila (ordem de chegada) — ADITIVO.
-- Tabelas novas; não altera nada do fluxo de agendamento existente.
-- Ativado por data pelo admin (ex.: 24/12). Notificação "você é o próximo"
-- sai por PWA push; canal WhatsApp fica pré-cabeado e desligado.
-- ============================================================

-- Dias em modo fila (ativados pelo admin).
CREATE TABLE IF NOT EXISTS public.queue_days (
  date DATE PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'estimativa' CHECK (mode IN ('estimativa', 'recepcao')),
  avg_service_minutes INTEGER NOT NULL DEFAULT 30 CHECK (avg_service_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pessoas na fila do dia.
CREATE TABLE IF NOT EXISTS public.queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  -- Modo login: client_id preenchido. Modo livre: client_name + client_phone.
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name TEXT,
  client_phone TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name_snapshot TEXT,
  service_duration_minutes_snapshot INTEGER,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'chamado', 'atendido', 'desistiu', 'ausente')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT queue_client_identifier CHECK (
    client_id IS NOT NULL OR (client_name IS NOT NULL AND client_phone IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_date   ON public.queue_entries(date);
CREATE INDEX IF NOT EXISTS idx_queue_entries_status ON public.queue_entries(status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_client ON public.queue_entries(client_id);

ALTER TABLE public.queue_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

-- ─── RLS: queue_days ──────────────────────────────────────────────
-- Leitura pública: o cliente precisa saber se o dia está em modo fila.
DROP POLICY IF EXISTS "Leitura publica queue_days" ON public.queue_days;
CREATE POLICY "Leitura publica queue_days" ON public.queue_days
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia queue_days" ON public.queue_days;
CREATE POLICY "Admin gerencia queue_days" ON public.queue_days
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── RLS: queue_entries ───────────────────────────────────────────
DROP POLICY IF EXISTS "Autenticado entra na fila" ON public.queue_entries;
CREATE POLICY "Autenticado entra na fila" ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id OR public.is_admin());

DROP POLICY IF EXISTS "Anonimo entra na fila" ON public.queue_entries;
CREATE POLICY "Anonimo entra na fila" ON public.queue_entries
  FOR INSERT TO anon
  WITH CHECK (client_id IS NULL AND client_name IS NOT NULL AND client_phone IS NOT NULL);

-- Cliente vê apenas a PRÓPRIA entrada; admin vê todas.
-- A posição/estimativa do cliente é calculada por server action (sem expor a lista).
DROP POLICY IF EXISTS "Ve fila" ON public.queue_entries;
CREATE POLICY "Ve fila" ON public.queue_entries
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

DROP POLICY IF EXISTS "Admin gerencia fila" ON public.queue_entries;
CREATE POLICY "Admin gerencia fila" ON public.queue_entries
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Cliente desiste da fila" ON public.queue_entries;
CREATE POLICY "Cliente desiste da fila" ON public.queue_entries
  FOR UPDATE USING (auth.uid() = client_id)
  WITH CHECK (status = 'desistiu');
