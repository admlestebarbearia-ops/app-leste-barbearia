-- Checkout pago da loja: reserva só é liberada para retirada após aprovação.

ALTER TABLE public.product_reservations
  DROP CONSTRAINT IF EXISTS product_reservations_status_check;

ALTER TABLE public.product_reservations
  ADD CONSTRAINT product_reservations_status_check
    CHECK (status IN ('aguardando_pagamento', 'reservado', 'cancelado', 'retirado'));

CREATE TABLE IF NOT EXISTS public.product_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.product_reservations(id) ON DELETE CASCADE,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  amount NUMERIC(10,2) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_payment_intents_reservation
  ON public.product_payment_intents(reservation_id);

CREATE INDEX IF NOT EXISTS idx_product_payment_intents_status_expires
  ON public.product_payment_intents(status, expires_at);

DROP TRIGGER IF EXISTS product_payment_intents_updated_at ON public.product_payment_intents;
CREATE TRIGGER product_payment_intents_updated_at
  BEFORE UPDATE ON public.product_payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_payment_intents ENABLE ROW LEVEL SECURITY;
