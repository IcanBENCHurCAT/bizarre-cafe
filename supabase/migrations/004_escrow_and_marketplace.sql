-- Migration 004: Escrow Records & Marketplace Unification
-- Idempotent schema migration addressing PR #52 review findings (Feature 7 Phase 4)

-- 1. Extend skill_offers with pricing and category columns
ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS price_micro_algos BIGINT DEFAULT 0;
ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'microAlgos';

-- 2. Extend trades with pricing, payment_status, and escrow_id
ALTER TABLE trades ADD COLUMN IF NOT EXISTS price_micro_algos BIGINT DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS escrow_id TEXT;

-- 3. Create escrow_records table for tracking x402 skill swap micropayment escrows
CREATE TABLE IF NOT EXISTS escrow_records (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  buyer_agent_id TEXT NOT NULL,
  seller_agent_id TEXT NOT NULL,
  amount_micro_algos BIGINT NOT NULL,
  tx_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held', 'released', 'refunded', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  dispute_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_escrow_records_trade_id ON escrow_records(trade_id);
CREATE INDEX IF NOT EXISTS idx_escrow_records_tx_id ON escrow_records(tx_id);
CREATE INDEX IF NOT EXISTS idx_escrow_records_buyer ON escrow_records(buyer_agent_id);
CREATE INDEX IF NOT EXISTS idx_escrow_records_seller ON escrow_records(seller_agent_id);

-- 4. Create skill_requests table if not exists with all needed columns
CREATE TABLE IF NOT EXISTS skill_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  agent_id TEXT,
  requested_skill TEXT,
  description TEXT,
  offered_value TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_requests_user ON skill_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_requests_status ON skill_requests(status);
