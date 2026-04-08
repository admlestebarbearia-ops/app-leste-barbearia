-- Adiciona coluna para armazenar o refresh token do OAuth do Mercado Pago
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS mp_refresh_token TEXT;
