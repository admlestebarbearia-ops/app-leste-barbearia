-- Adiciona o status 'cancelado_falta_pagamento' ao CHECK constraint de appointments.
-- Diferencia cancelamentos por timeout de pagamento (cron) dos cancelamentos
-- voluntários pelo cliente ou admin.

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
      'cancelado_falta_pagamento'
    ));
END $$;
