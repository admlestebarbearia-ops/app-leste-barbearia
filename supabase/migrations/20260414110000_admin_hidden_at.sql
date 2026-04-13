-- Separa o mecanismo de ocultação por origem:
-- admin_hidden_at → agendamento oculto do painel do admin (mas visível para o cliente)
-- deleted_at (existente) → usado pelo cliente ao dispensar alertas (visível para admin)
-- Com isso, se o admin "excluir" um agendamento, o cliente ainda vê no histórico.
-- Se o cliente dispensar um alerta, o admin ainda vê na lista.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS admin_hidden_at TIMESTAMPTZ;

-- Index para a query mais comum do painel admin
CREATE INDEX IF NOT EXISTS idx_appointments_admin_hidden ON public.appointments(admin_hidden_at)
  WHERE admin_hidden_at IS NULL;
