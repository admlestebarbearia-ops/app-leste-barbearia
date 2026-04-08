-- Taxas separadas para cartão de débito e crédito
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS debit_rate_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Migra o valor antigo para ambos, se existir
UPDATE business_config
   SET debit_rate_pct  = default_card_rate_pct,
       credit_rate_pct = default_card_rate_pct
 WHERE default_card_rate_pct > 0;
