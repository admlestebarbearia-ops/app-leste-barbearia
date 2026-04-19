-- ============================================================
-- Epic 1 + Epic 2: Grade Admin Interativa + Lembretes WhatsApp
-- ============================================================

-- ─── EPIC 1: Campos para grade administrativa ──────────────────────────────

-- checkout_payment_method: forma de pagamento confirmada no checkout presencial
-- (diferente do payment_intent do MP, que é para pagamentos online).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS checkout_payment_method TEXT
  CHECK (checkout_payment_method IN ('dinheiro', 'pix', 'credito', 'fiado'));

-- is_admin_block: sinaliza que este "appointment" é um bloqueio ad-hoc criado
-- pelo barbeiro, não um agendamento real de cliente. A função
-- calculateAvailableSlots (que lê de appointments) bloqueará o slot
-- normalmente sem precisar de nenhuma modificação na engine.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_admin_block BOOLEAN NOT NULL DEFAULT false;

-- ─── EPIC 2: Campos para opt-in e lembretes WhatsApp ──────────────────────

-- wa_opt_in: cliente abriu a janela de 24h/72h enviando mensagem para a barbearia.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN NOT NULL DEFAULT false;

-- last_wa_interaction: timestamp UTC da última mensagem recebida do cliente
-- via WA. O cron usa este campo para o kill-switch financeiro (RN23).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS last_wa_interaction TIMESTAMPTZ;

-- wa_hash: hash único por agendamento para o link de opt-in (wa.me/...?text=...ID_[HASH]).
-- Permite que o webhook identifique o agendamento sem expor o UUID no texto.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS wa_hash TEXT;

-- Índice para lookups rápidos do webhook por hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_wa_hash
  ON public.appointments(wa_hash)
  WHERE wa_hash IS NOT NULL;

-- ─── business_config: número WA da barbearia para dispatch ───────────────
-- (coluna whatsapp_number já existe das fases anteriores, nenhuma alteração)
-- As credenciais da Meta Cloud API (META_ACCESS_TOKEN, META_PHONE_ID, META_VERIFY_TOKEN)
-- são armazenadas como variáveis de ambiente no Vercel, não no banco de dados.
-- Nenhuma coluna nova em business_config.

-- ─── wa_reminder_sent: previne reenvio duplo de lembretes WA ─────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS wa_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- ─── CONSTRAINT client_identifier: relaxar para agendamentos admin ────────
-- A constraint original exige (client_id OR (client_name AND client_phone)).
-- Isso bloqueia agendamentos manuais do painel admin (telefone opcional) e
-- bloqueios de horário (is_admin_block=true, sem dados de cliente real).
-- Nova regra: basta ter client_id OU client_name preenchido.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS client_identifier;

ALTER TABLE public.appointments
  ADD CONSTRAINT client_identifier CHECK (
    client_id IS NOT NULL OR client_name IS NOT NULL
  );

-- ─── Recarregar schema cache do PostgREST (Supabase) ─────────────────────
-- Garante que a API reconheça imediatamente as colunas is_admin_block,
-- wa_opt_in, wa_hash, last_wa_interaction e wa_reminder_sent sem precisar
-- reiniciar o servidor Supabase manualmente.
NOTIFY pgrst, 'reload schema';
