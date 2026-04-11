-- ─── Profiles: políticas RLS para usuários comuns ────────────────────────
--
-- Problema: a tabela profiles só tinha policy de UPDATE para admin,
-- impedindo que usuários autenticados salvassem phone/display_name.
-- Isso causava o erro "new row violates row-level security policy".
--
-- Solução:
--   1. UPDATE: usuário pode atualizar seu próprio perfil, mas não pode
--      alterar is_admin nem is_blocked (prevenção de escalada de privilégio).
--   2. INSERT: safety net caso o trigger on_auth_user_created não tenha
--      criado o perfil ainda.

-- UPDATE: próprio perfil, sem poder alterar is_admin ou is_blocked
DROP POLICY IF EXISTS "Usuario atualiza proprio perfil" ON public.profiles;
CREATE POLICY "Usuario atualiza proprio perfil" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin IS NOT DISTINCT FROM (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    AND is_blocked IS NOT DISTINCT FROM (SELECT is_blocked FROM public.profiles WHERE id = auth.uid())
  );

-- INSERT: safety net — usuário só insere registro próprio
DROP POLICY IF EXISTS "Usuario insere proprio perfil" ON public.profiles;
CREATE POLICY "Usuario insere proprio perfil" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);
