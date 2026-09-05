-- ============================================================
-- Identificacao do convidado na trilha — ADITIVO.
--
-- Motivo: sem login a trilha so registrava "convidado", o que nao identifica
-- ninguem. No incidente de 05/09/2026 tres cancelamentos vieram do mesmo
-- celular e nao havia como provar isso. Com device_id, a pergunta "foi a mesma
-- pessoa?" passa a ter resposta.
--
-- device_id e um numero aleatorio gerado no primeiro agendamento e guardado
-- assinado no navegador. Nao deriva do aparelho e nao contem dado pessoal.
-- ============================================================

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS device_id   UUID,
  ADD COLUMN IF NOT EXISTS device_desc TEXT;

-- "me mostre tudo que saiu deste celular"
CREATE INDEX IF NOT EXISTS idx_audit_log_device
  ON public.audit_log(device_id, created_at DESC);
