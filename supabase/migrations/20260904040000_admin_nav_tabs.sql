-- Abas do rodapé do painel administrativo.
-- A aba "Agenda" (hoje) é sempre a primeira e não é configurável — é a tela
-- principal. As outras 3 o dono do painel escolhe em Preferências, sem
-- precisar de alteração no código.
-- Chaves válidas: fila, configuracoes, servicos, barbeiros, galeria,
--                 produtos, financeiro, clientes, admins
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS admin_nav_tabs TEXT[] NOT NULL
  DEFAULT ARRAY['fila', 'financeiro', 'clientes']::TEXT[];
