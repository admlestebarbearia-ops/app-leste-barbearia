ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('dinheiro', 'pix', 'debito', 'credito', 'mercado_pago'));

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE public.product_payment_intents
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('dinheiro', 'pix', 'debito', 'credito', 'mercado_pago'));

ALTER TABLE public.product_payment_intents
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;