-- Adiciona flag para exibir modal de aviso de tolerância no fluxo de agendamento
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS show_tolerance_modal BOOLEAN NOT NULL DEFAULT false;
