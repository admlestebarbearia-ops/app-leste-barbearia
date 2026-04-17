-- Previne overbooking: garante que não existam dois agendamentos ativos
-- (confirmado ou aguardando_pagamento) para o mesmo barbeiro, data e horário.
-- Usa partial unique index para ignorar agendamentos cancelados/expirados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_overlap
  ON public.appointments (barber_id, date, start_time)
  WHERE status IN ('confirmado', 'aguardando_pagamento')
    AND deleted_at IS NULL;
