-- =============================================================
-- LESTE BARBEARIA — Campos adicionais em products
-- Executar no SQL Editor do Supabase Dashboard
-- =============================================================

-- ─── 1. Campos de detalhe do produto ──────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS full_description TEXT,
  ADD COLUMN IF NOT EXISTS size_info TEXT;        -- Ex: "50ml | 100ml | 150ml" ou "P / M / G"
