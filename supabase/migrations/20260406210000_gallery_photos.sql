-- Cria tabela gallery_photos para galeria de fotos dos clientes
-- Permite admin fazer upload de fotos aprovadas e qualquer um enviar fotos para aprovação

CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  url         TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved')),
  user_name   TEXT,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

-- Política: leitura pública de fotos aprovadas (ou admin vê todas)
DROP POLICY IF EXISTS "Leitura publica de fotos aprovadas" ON public.gallery_photos;
CREATE POLICY "Leitura publica de fotos aprovadas" ON public.gallery_photos
  FOR SELECT USING (status = 'approved' OR public.is_admin());

-- Política: qualquer um pode enviar foto (entra como 'pending')
DROP POLICY IF EXISTS "Qualquer um pode enviar foto da galeria" ON public.gallery_photos;
CREATE POLICY "Qualquer um pode enviar foto da galeria" ON public.gallery_photos
  FOR INSERT WITH CHECK (true);

-- Política: admin pode gerenciar tudo (UPDATE, DELETE e SELECT já coberto acima)
DROP POLICY IF EXISTS "Admin gerencia fotos da galeria" ON public.gallery_photos;
CREATE POLICY "Admin gerencia fotos da galeria" ON public.gallery_photos
  FOR ALL USING (public.is_admin());
