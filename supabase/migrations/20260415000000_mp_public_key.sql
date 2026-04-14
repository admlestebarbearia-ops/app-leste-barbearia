-- Adiciona coluna mp_public_key à tabela business_config.
-- A chave pública é salva automaticamente durante o fluxo OAuth do Mercado Pago
-- e usada no frontend para inicializar o SDK (initMercadoPago).
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS mp_public_key TEXT;
