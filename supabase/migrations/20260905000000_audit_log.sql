-- ============================================================
-- Trilha de auditoria — ADITIVO. Não altera nenhuma regra existente.
--
-- Motivo: hoje não há como saber QUEM cancelou, concluiu ou apagou um
-- agendamento, nem QUANDO. A tabela appointments só tem created_at (momento
-- da criação) e um booleano cancelled_by_admin — sem autor e sem data. Quando
-- o barbeiro pergunta "quem mexeu nisso?", não existe resposta.
--
-- Esta tabela só recebe INSERT. Nada aqui é editado ou apagado pela aplicação.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- QUEM fez
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('admin', 'cliente', 'convidado', 'sistema')),
  actor_id    UUID,   -- auth.users quando houver login; nulo para convidado/sistema
  actor_label TEXT,   -- e-mail, nome ou telefone — para leitura humana no painel

  -- O QUE fez
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'appointment',
  entity_id   UUID,

  -- Resumo legível gravado no momento do fato. É o que permite entender um
  -- registro DEPOIS que o agendamento foi apagado de vez: sem isso, entity_id
  -- apontaria para uma linha que não existe mais e o log seria inútil.
  summary     TEXT,

  -- Contexto extra (de/para status, motivo, valores) sem precisar de colunas novas
  details     JSONB,

  -- De onde veio
  ip          TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON public.audit_log(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON public.audit_log(action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Só o admin lê. Cliente nenhum enxerga a trilha.
DROP POLICY IF EXISTS "Admin le audit_log" ON public.audit_log;
CREATE POLICY "Admin le audit_log" ON public.audit_log
  FOR SELECT USING (public.is_admin());

-- Ninguém escreve pelo cliente do navegador: a gravação é sempre feita no
-- servidor com a service role, que ignora RLS. Sem policy de INSERT/UPDATE/
-- DELETE, a trilha não pode ser forjada nem adulterada a partir do front.
