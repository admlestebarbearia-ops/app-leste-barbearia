-- ============================================================
-- SEGURANÇA — fecha o IDOR de leitura em `appointments`.
--
-- ACHADO (medido em 13/09/2026): com a anon key pública, um
-- `GET /rest/v1/appointments` devolvia **695 agendamentos** de visitante com
-- `client_name` e `client_phone`. A policy vigente permitia ler linhas com
-- `client_id IS NULL` — e TODO visitante tem client_id nulo, então cada
-- visitante enxergava as reservas de todos os outros.
--
-- Medição: anônimo via 695 de 1581 linhas; exatamente o conjunto
-- `client_id IS NULL`, e 0 das 886 linhas de usuários logados.
--
-- POR QUE UMA POLICY RESTRICTIVE
-- Policies PERMISSIVE se somam com OR; RESTRICTIVE se combinam com AND. Usando
-- RESTRICTIVE nós apertamos o acesso sem precisar conhecer (nem remover) as
-- policies já existentes — reduz muito o risco de quebrar algo que não vimos.
--
-- POR QUE ISSO NÃO QUEBRA O APP
-- Todo fluxo legítimo que lê `appointments` já foi migrado para service_role
-- (que ignora RLS), sempre com filtro de posse na própria query:
--   - "Minhas reservas" e cancelamento  → ownershipFilter (IDs assinados HMAC)
--   - Telas de sucesso/pagamento        → getOwnedAppointment()
--   - Disponibilidade                   → service_role (só lê horário/status)
--   - Limites diários e INSERT          → service_role
--   - Painel admin                      → is_admin() abaixo + service_role
-- Ver commit correspondente e docs/SEGURANCA.md.
--
-- ORDEM DE IMPLANTAÇÃO: o código corrigido precisa estar NO AR antes deste SQL.
-- ============================================================

DROP POLICY IF EXISTS "appointments_restrict_select_owner" ON public.appointments;

CREATE POLICY "appointments_restrict_select_owner"
  ON public.appointments
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    -- o admin continua vendo a agenda inteira pelo painel
    public.is_admin()
    -- o usuário logado vê apenas o que é dele.
    -- `client_id IS NOT NULL` é essencial: sem isso, para o anônimo
    -- (auth.uid() = NULL) a comparação NULL = NULL não bloquearia como esperado.
    OR (client_id IS NOT NULL AND client_id = auth.uid())
  );

-- Verificação esperada depois de aplicar:
--   • anon  GET /rest/v1/appointments            -> 0 linhas (antes: 695)
--   • fluxo "Minhas Reservas" do visitante        -> continua funcionando
--   • painel admin                                -> continua vendo tudo
