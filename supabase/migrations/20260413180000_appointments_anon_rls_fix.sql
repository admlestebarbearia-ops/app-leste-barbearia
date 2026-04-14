-- ─── Fix: RLS para sessões anônimas Supabase em appointments ────────────────
--
-- Problema: usuários com sessão anônima Supabase (is_anonymous: true) têm papel
-- Postgres 'authenticated', mas o código os trata como guests (client_id = null).
-- A policy INSERT de 'authenticated' exige auth.uid() = client_id, então falhava
-- com "new row violates row-level security policy for table appointments".
--
-- Correção no código (actions.ts): include client_id = user.id para sessões
-- anônimas, de forma que a policy 'authenticated' passe normalmente.
--
-- Esta migration adiciona uma policy de segurança extra como fallback: permite que
-- usuários anônimos (JWT com is_anonymous = true) também possam inserir com
-- client_name + client_phone, caso o cliente seja chamado sem client_id.

DROP POLICY IF EXISTS "Anonimo autenticado insere agendamento livre" ON public.appointments;
CREATE POLICY "Anonimo autenticado insere agendamento livre"
  ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE
    AND client_name IS NOT NULL
    AND client_phone IS NOT NULL
  );
