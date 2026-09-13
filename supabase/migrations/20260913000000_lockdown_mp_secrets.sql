-- ============================================================
-- SEGURANÇA — fecha o vazamento dos tokens do Mercado Pago.
--
-- Achado (medido em 13/09/2026): a chave anônima pública conseguia ler
-- business_config.mp_access_token, mp_refresh_token e mp_public_key via REST
-- (GET /rest/v1/business_config). O mp_access_token dá controle sobre a conta
-- Mercado Pago da barbearia — é o achado mais grave da auditoria.
--
-- Causa: a RLS de business_config permitia SELECT público (o fluxo de
-- agendamento lia o token com o cliente anônimo). O código já foi corrigido
-- para ler o token SOMENTE com service_role — então revogar o acesso das
-- colunas secretas para anon/authenticated NÃO quebra nada.
--
-- IMPORTANTE: rode isto DEPOIS de o deploy do código corrigido estar no ar.
-- ============================================================

-- Privilégio de coluna: anon e authenticated deixam de poder ler as colunas
-- secretas. service_role (usado pelo servidor no pagamento) não é afetado —
-- ele é dono da tabela e ignora GRANTs de coluna.
REVOKE SELECT (mp_access_token, mp_refresh_token, mp_webhook_secret)
  ON public.business_config
  FROM anon, authenticated;

-- Garante que o restante das colunas continua legível (o fluxo público precisa
-- de barber_name, logo_url, payment_mode, etc.). REVOKE de coluna acima não
-- mexe nas demais, mas deixamos explícito para quem ler depois.
-- (nada a fazer aqui — as outras colunas seguem no GRANT de tabela existente)

-- Verificação (rode e confira que retorna erro de permissão para anon):
--   set role anon;
--   select mp_access_token from public.business_config;   -- deve FALHAR
--   select barber_name    from public.business_config;    -- deve funcionar
--   reset role;
