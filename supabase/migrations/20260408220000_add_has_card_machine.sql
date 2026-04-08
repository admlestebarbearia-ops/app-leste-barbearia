-- Adiciona flag de maquininha ao business_config
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS has_card_machine BOOLEAN NOT NULL DEFAULT FALSE;
