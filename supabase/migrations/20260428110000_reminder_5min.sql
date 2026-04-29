-- Adiciona flag de lembrete push de 5 minutos antes do agendamento.
-- O cron push-reminders (GitHub Actions, a cada 5min) já suporta essa faixa.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_5min_sent BOOLEAN NOT NULL DEFAULT FALSE;
