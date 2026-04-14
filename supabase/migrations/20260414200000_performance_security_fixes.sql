-- ============================================================
-- Performance & Security fixes
-- 1. Índices para chaves estrangeiras sem cobertura
-- 2. Políticas mínimas para payment_intents e product_payment_intents
--    (RLS habilitado sem policy = tabela inacessível para roles públicas,
--     o que é correto, mas remove o aviso do Security Advisor)
-- ============================================================

-- ─── 1. Índices FK — public.appointments ─────────────────────────────────
-- client_id já tem idx_appointments_client_id
CREATE INDEX IF NOT EXISTS idx_appointments_barber_id
  ON public.appointments(barber_id);

CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON public.appointments(service_id);

-- ─── 2. Índice FK — public.client_ratings ────────────────────────────────
-- appointment_id já é coberto pelo UNIQUE
CREATE INDEX IF NOT EXISTS idx_client_ratings_client_id
  ON public.client_ratings(client_id);

-- ─── 3. Índice FK — public.financial_entries ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_financial_entries_created_by
  ON public.financial_entries(created_by);

-- ─── 4. Índice FK — public.gallery_photos ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gallery_photos_user_id
  ON public.gallery_photos(user_id);

-- ─── 5. Índices FK — public.product_reservations ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_reservations_product_id
  ON public.product_reservations(product_id);

CREATE INDEX IF NOT EXISTS idx_product_reservations_appointment_id
  ON public.product_reservations(appointment_id);

CREATE INDEX IF NOT EXISTS idx_product_reservations_client_id
  ON public.product_reservations(client_id);

-- ─── 6. Políticas RLS explícitas (apenas service_role acessa) ────────────
-- payment_intents: sem acesso público, service_role já bypassa via RLS
-- Adicionar política de negação explícita elimina o aviso "RLS Enabled No Policy"
DROP POLICY IF EXISTS "Sem acesso publico payment_intents" ON public.payment_intents;
CREATE POLICY "Sem acesso publico payment_intents"
  ON public.payment_intents
  FOR ALL
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Sem acesso publico product_payment_intents" ON public.product_payment_intents;
CREATE POLICY "Sem acesso publico product_payment_intents"
  ON public.product_payment_intents
  FOR ALL
  USING (false)
  WITH CHECK (false);
