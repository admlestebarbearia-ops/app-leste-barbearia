-- Adiciona flag para distinguir cancelamentos feitos pelo admin
-- Usado na tela de reservas do cliente para exibir aviso

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancelled_by_admin BOOLEAN NOT NULL DEFAULT false;
