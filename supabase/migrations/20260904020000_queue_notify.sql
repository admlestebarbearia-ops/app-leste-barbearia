-- Alvo de notificação (push) da entrada na fila.
-- Guarda o userId da sessão de push (anônima ou logada) para que o aviso
-- "você é o próximo" / "é a sua vez" alcance também clientes sem login.
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS notify_user_id UUID;
