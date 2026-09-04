-- Corrige o padrão das abas do rodapé para a escolha do dono do painel:
-- Agenda (fixa) + Preferências, Catálogo e Financeiro.
-- O padrão anterior (fila/financeiro/clientes) foi uma escolha equivocada.
ALTER TABLE public.business_config
  ALTER COLUMN admin_nav_tabs
  SET DEFAULT ARRAY['configuracoes', 'servicos', 'financeiro']::TEXT[];

-- Aplica na linha existente apenas se ainda estiver no padrão antigo,
-- para não sobrescrever uma escolha já feita no painel.
UPDATE public.business_config
   SET admin_nav_tabs = ARRAY['configuracoes', 'servicos', 'financeiro']::TEXT[]
 WHERE admin_nav_tabs = ARRAY['fila', 'financeiro', 'clientes']::TEXT[];
