-- Previne overbooking por sobreposição de duração entre agendamentos do mesmo barbeiro.
-- O índice anterior (idx_appointments_no_overlap) bloqueava apenas start_time idêntico.
-- Este trigger verifica a sobreposição real: new_start < existing_end AND new_end > existing_start.
-- Usa service_duration_minutes_snapshot com fallback de 30 min para registros legados.

CREATE OR REPLACE FUNCTION prevent_appointment_time_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE barber_id = NEW.barber_id
      AND date = NEW.date
      AND id <> NEW.id
      AND status IN ('confirmado', 'aguardando_pagamento')
      AND deleted_at IS NULL
      -- Fórmula: novo_início < existente_fim AND novo_fim > existente_início
      AND NEW.start_time < start_time + (COALESCE(service_duration_minutes_snapshot, 30) * interval '1 minute')
      AND NEW.start_time + (COALESCE(NEW.service_duration_minutes_snapshot, 30) * interval '1 minute') > start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: o intervalo solicitado se sobrepõe a um agendamento existente'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dispara ANTES de INSERT e UPDATE, mas somente quando o agendamento resultante
-- está ativo (confirmado/aguardando) e não foi soft-deleted.
CREATE TRIGGER appointments_prevent_overlap
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  WHEN (NEW.status IN ('confirmado', 'aguardando_pagamento') AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION prevent_appointment_time_overlap();
