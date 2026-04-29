-- Adiciona o status 'cancelado_por_atraso' para agendamentos em que o cliente
-- não compareceu após mais de 10 minutos do horário marcado (auto-cancelado pelo cron).
-- Adiciona flags de lembrete de 20 e 10 minutos antes do agendamento.

DO $$
BEGIN
  ALTER TABLE public.appointments
    DROP CONSTRAINT IF EXISTS appointments_status_check;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_check
    CHECK (status IN (
      'confirmado',
      'cancelado',
      'faltou',
      'concluido',
      'aguardando_pagamento',
      'cancelado_falta_pagamento',
      'cancelado_por_atraso'
    ));
END $$;

-- Flags para lembretes push de 20min e 10min antes
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_20min_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_10min_sent BOOLEAN NOT NULL DEFAULT FALSE;
