-- =============================================================
-- LESTE BARBEARIA — Reservas de produtos sem agendamento (loja direta)
-- Executar no SQL Editor do Supabase Dashboard
-- =============================================================

-- ─── 1. Torna appointment_id nullable ─────────────────────────────────────
-- Permite reservas de produtos feitas diretamente na loja (/loja)
-- sem precisar de um agendamento associado.
ALTER TABLE public.product_reservations
  ALTER COLUMN appointment_id DROP NOT NULL;

-- ─── 2. Política: cliente pode cancelar a própria reserva ─────────────────
DROP POLICY IF EXISTS "Cliente cancela propria reserva produto" ON public.product_reservations;
CREATE POLICY "Cliente cancela propria reserva produto"
  ON public.product_reservations FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- ─── 3. Adiciona coluna phone em profiles (se não existir) ────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
