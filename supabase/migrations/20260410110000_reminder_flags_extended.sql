-- Adiciona flags de lembrete para os 4 novos intervalos
-- Sistema de lembretes: 90min, 75min, 60min, 45min, 30min e 15min antes

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_90min_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_75min_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_45min_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_15min_sent BOOLEAN NOT NULL DEFAULT FALSE;
