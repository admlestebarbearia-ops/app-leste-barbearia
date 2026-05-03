-- Bloqueio dinâmico de "Pagar na Barbearia" para agendamentos com muita antecedência.
-- Se ativo, o cliente só pode pagar presencialmente se o agendamento estiver
-- dentro da janela configurada (distant_booking_threshold_days dias).
-- Fallback seguro: DEFAULT false garante comportamento anterior caso a coluna
-- não seja lida corretamente.

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS require_advance_payment_distant_bookings BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distant_booking_threshold_days INTEGER NOT NULL DEFAULT 7;
