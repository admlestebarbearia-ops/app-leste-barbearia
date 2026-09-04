-- Controles da fila inteligente:
--  - accepting_joins: barbeiro abre/fecha a entrada de novos clientes (controle manual).
--  - call_message: mensagem (editável) que o cliente vê ao abrir a fila; se nula, usa padrão no app.
--  - lead_minutes: antecedência do aviso "você é o próximo, venha".
--  - tolerance_minutes: tolerância de chegada quando é chamado.
ALTER TABLE public.queue_days
  ADD COLUMN IF NOT EXISTS accepting_joins   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_message      TEXT,
  ADD COLUMN IF NOT EXISTS lead_minutes      INTEGER NOT NULL DEFAULT 15 CHECK (lead_minutes >= 0),
  ADD COLUMN IF NOT EXISTS tolerance_minutes INTEGER NOT NULL DEFAULT 10 CHECK (tolerance_minutes >= 0);
