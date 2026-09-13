-- Migration 004: bring x402_payments up to the full column set used by the
-- x402 verification code (src/supabase/queries.ts, src/services/x402/).
--
-- Migration 003 created x402_payments as a stub (id, created_at, updated_at),
-- but recordPayment/getByTxnHash/hasTxnHash/confirmPayment read and write
-- txn_hash, proposal_id, amount, from_address, to_address, status, receipt,
-- and settled_at. Without these columns every paid request on the Supabase
-- backend fails with "column does not exist" after ledger verification.
-- Column list matches src/supabase/types/database.types.ts (generated from
-- the live project). All statements are idempotent.

ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS proposal_id TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS amount BIGINT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS to_address TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS receipt TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS txn_hash TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS is_micro_payment BOOLEAN;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS subscription_interval TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;

-- Uniqueness on txn_hash is the database-level backstop for the
-- anti-double-spend registry (mirrors the SQLite schema's TEXT UNIQUE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'x402_payments_txn_hash_key'
  ) THEN
    ALTER TABLE x402_payments ADD CONSTRAINT x402_payments_txn_hash_key UNIQUE (txn_hash);
  END IF;
END
$$;
