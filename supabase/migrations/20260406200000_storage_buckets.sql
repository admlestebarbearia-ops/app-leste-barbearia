-- Cria os buckets de Storage necessários para upload de imagens no admin
-- Buckets: logo, barbeiro-foto, galeria

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('logo',          'logo',          true, 5242880,  ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('barbeiro-foto', 'barbeiro-foto', true, 5242880,  ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('galeria',       'galeria',       true, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Política: leitura pública (qualquer um pode ver as imagens)
CREATE POLICY "Leitura pública logo"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logo');

CREATE POLICY "Leitura pública barbeiro-foto"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barbeiro-foto');

CREATE POLICY "Leitura pública galeria"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'galeria');

-- Política: apenas admins autenticados podem fazer upload/delete
CREATE POLICY "Admin upload logo"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logo'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin upload barbeiro-foto"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'barbeiro-foto'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin upload galeria"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'galeria'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin delete logo"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logo'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin delete barbeiro-foto"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'barbeiro-foto'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin delete galeria"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'galeria'
    AND auth.role() = 'authenticated'
  );
