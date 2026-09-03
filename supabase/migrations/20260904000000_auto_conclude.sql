-- Auto-concluir atendimentos de dias passados.
-- Flag em business_config; desligada por padrão (o barbeiro ativa quando quiser).
-- Quando ligada, um cron diário conclui os agendamentos confirmados de dias
-- anteriores e cria o lançamento financeiro (valor cheio; forma "a definir"
-- para pagamentos presenciais, corrigível depois no painel).
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS auto_conclude_enabled BOOLEAN NOT NULL DEFAULT false;
