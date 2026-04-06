-- =============================================================
-- LESTE BARBEARIA — Produtos e Reservas de Produtos
-- Executar no SQL Editor do Supabase Dashboard
-- =============================================================

-- ─── 1. Coluna enable_products em business_config ──────────────────────────
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS enable_products BOOLEAN NOT NULL DEFAULT false;

-- ─── 1b. Coluna display_name em profiles (para página /perfil) ─────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ─── 2. Tabela products ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT -1, -- -1 = ilimitado
  is_active BOOLEAN NOT NULL DEFAULT true,
  reserve_enabled BOOLEAN NOT NULL DEFAULT true,
  cover_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Tabela product_reservations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_phone TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reservado'
    CHECK (status IN ('reservado', 'cancelado', 'retirado')),
  product_name_snapshot TEXT NOT NULL,
  product_price_snapshot NUMERIC(10,2) NOT NULL,
  product_image_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Trigger: atualiza updated_at automaticamente ──────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS product_reservations_updated_at ON public.product_reservations;
CREATE TRIGGER product_reservations_updated_at
  BEFORE UPDATE ON public.product_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reservations ENABLE ROW LEVEL SECURITY;

-- Products: leitura pública para produtos ativos; escrita só admin
DROP POLICY IF EXISTS "Produto ativo visivel" ON public.products;
CREATE POLICY "Produto ativo visivel"
  ON public.products FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin gerencia produtos" ON public.products;
CREATE POLICY "Admin gerencia produtos"
  ON public.products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Product reservations: cliente vê as próprias; admin vê tudo
DROP POLICY IF EXISTS "Cliente ve proprias reservas produto" ON public.product_reservations;
CREATE POLICY "Cliente ve proprias reservas produto"
  ON public.product_reservations FOR SELECT
  USING (
    auth.uid() = client_id
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin gerencia reservas produto" ON public.product_reservations;
CREATE POLICY "Admin gerencia reservas produto"
  ON public.product_reservations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- INSERT permitido para qualquer um (cliente ou visitante cria reserva via server action)
-- A validação de posse é feita no código (actions.ts)
DROP POLICY IF EXISTS "Qualquer um pode inserir reserva produto" ON public.product_reservations;
CREATE POLICY "Qualquer um pode inserir reserva produto"
  ON public.product_reservations FOR INSERT
  WITH CHECK (true);

-- ─── 6. Realtime para notificação admin ───────────────────────────────────
-- Habilita realtime na tabela product_reservations
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reservations;
