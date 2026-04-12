-- ============================================================
-- Fase 4b: Otimização Bricks — remove obrigatoriedade de preferência MP
-- ============================================================

-- 1. Tornar mp_preference_id opcional em payment_intents
--    Checkout Bricks (transparente) não exige criação de preferência.
--    O campo era NOT NULL porque o fluxo antigo sempre criava a preferência.
ALTER TABLE public.payment_intents
  ALTER COLUMN mp_preference_id DROP NOT NULL;
