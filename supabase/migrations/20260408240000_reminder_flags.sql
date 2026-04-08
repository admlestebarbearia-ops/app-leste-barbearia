-- ─── Flags de lembrete em appointments ───────────────────────────────────────
-- Evitam reenvio duplicado quando o cron roda a cada 15 minutos

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS reminder_1h_sent   BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_30min_sent BOOLEAN NOT NULL DEFAULT FALSE;
