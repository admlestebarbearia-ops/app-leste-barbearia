-- Fix: adiciona 'estorno' ao CHECK constraint de financial_entries.source
-- O código em actions.ts insere source='estorno' mas o constraint original não o incluia,
-- causando falha silenciosa em todos os estornos.

ALTER TABLE financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_check;

ALTER TABLE financial_entries
  ADD CONSTRAINT financial_entries_source_check
  CHECK (source IN ('agendamento', 'produto', 'maquininha', 'estorno', 'manual'));
