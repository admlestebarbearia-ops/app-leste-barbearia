-- Adiciona flag para permitir pagamento em dinheiro mesmo no modo online_obrigatorio
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS aceita_dinheiro BOOLEAN NOT NULL DEFAULT true;
