import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import app from '../src/index';
import { config } from '../src/config';
import { clearMemSkillSwap, memOffers, memTrades } from '../src/routes/skill-swap';
import {
  clearSqliteSkillSwap,
  clearSqlitePayments,
  getSqliteTradeById,
  getSqliteEscrowRecord,
  getSqliteSkillOfferById,
} from '../src/db/sqlite';
import * as sqliteDb from '../src/db/sqlite';
import { clearMemEscrows, getEscrowRecord } from '../src/services/escrow';
import * as escrowService from '../src/services/escrow';
import {
  registerMockTransaction,
  clearMockTransactions,
  clearSpentTransactions,
  setMockVerificationMode,
} from '../src/services/x402/index';

describe('Feature 7 Phase 4: Trade Compensation & Escrow Rollback (US3)', () => {
  const sellerAgentId = 'agent-bob-seller';
  const buyerAgentId = 'agent-alice-buyer';

  const sellerHeaders = {
    'X-Agent-ID': sellerAgentId,
    'Content-Type': 'application/json',
  };

  const buyerHeaders = {
    'X-Agent-ID': buyerAgentId,
    'Content-Type': 'application/json',
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    clearMemSkillSwap();
    clearMemEscrows();
    clearSpentTransactions();
    clearMockTransactions();
    setMockVerificationMode(true);
    await clearSqliteSkillSwap();
    await clearSqlitePayments();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T012: should trigger automatic refundEscrow and revert offer status to available when trade persistence fails', async () => {
    // 1. Bob posts a priced offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Security Audit & Hardening',
        description: 'Comprehensive smart contract verification',
        priceMicroAlgos: 500000,
        currency: 'microAlgos',
        category: 'security',
      }),
    });
    expect(offerRes.status).toBe(201);
    const { offer } = await offerRes.json();
    expect(offer.status).toBe('available');

    // 2. Register mock Algorand payment transaction for Alice
    const txId = 'VALID_COMPENSATION_TX_1234567890';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET',
      receiver: config.algorandReceiverWallet,
      amount: 500000,
      confirmedRound: 200,
    });

    // 3. Spy on refundEscrow to verify it gets invoked
    const refundSpy = vi.spyOn(escrowService, 'refundEscrow');

    // 4. Mock SQLite trade persistence to simulate database failure AFTER escrow lock
    const sqliteError = new Error('SQLITE_IO_ERROR: Simulated disk write failure');
    const createTradeSpy = vi.spyOn(sqliteDb, 'createSqliteTrade').mockRejectedValueOnce(sqliteError);

    // 5. Alice attempts to accept the offer
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: {
        ...buyerHeaders,
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ notes: 'Initiating trade with escrow' }),
    });

    // 6. Assert HTTP 500 and structured error response
    expect(acceptRes.status).toBe(500);
    const errBody = await acceptRes.json();
    expect(errBody.error).toBeDefined();
    expect(errBody.error.code).toBe('TRADE_CREATION_FAILED');
    expect(errBody.error.message).toBe('Failed to create trade; escrowed funds refunded');

    // 7. Verify createSqliteTrade was attempted
    expect(createTradeSpy).toHaveBeenCalledTimes(1);

    // 8. Verify refundEscrow was automatically invoked with 'system' and reason
    expect(refundSpy).toHaveBeenCalledTimes(1);
    const [calledEscrowId, calledCaller, calledReason] = refundSpy.mock.calls[0];
    expect(calledCaller).toBe('system');
    expect(calledReason).toBe('Trade creation failed after escrow lock');

    // 9. Verify the escrow record status in memory and SQLite is 'refunded'
    const refundedEscrow = await getEscrowRecord(calledEscrowId);
    expect(refundedEscrow).not.toBeNull();
    expect(refundedEscrow?.status).toBe('refunded');
    expect(refundedEscrow?.refundedAt).toBeDefined();

    const sqliteEscrow = await getSqliteEscrowRecord(calledEscrowId);
    expect(sqliteEscrow).not.toBeNull();
    expect(sqliteEscrow?.status).toBe('refunded');

    // 10. Verify offer status was reverted to 'available' in memory and in SQLite
    const memOffer = memOffers.get(offer.id);
    expect(memOffer).toBeDefined();
    expect(memOffer?.status).toBe('available');

    const sqliteOffer = await getSqliteSkillOfferById(offer.id);
    expect(sqliteOffer).not.toBeNull();
    expect(sqliteOffer?.status).toBe('available');

    // 11. Verify no trade was added to memTrades
    expect(memTrades.size).toBe(0);
  });

  it('T012: normal trade creation succeeds without triggering compensation', async () => {
    // 1. Bob posts a priced offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Algorand Indexer Optimization',
        description: 'PostgreSQL query optimization for Algorand indexers',
        priceMicroAlgos: 350000,
        currency: 'microAlgos',
        category: 'database',
      }),
    });
    expect(offerRes.status).toBe(201);
    const { offer } = await offerRes.json();

    // 2. Register mock payment
    const txId = 'VALID_NORMAL_TX_9876543210';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET',
      receiver: config.algorandReceiverWallet,
      amount: 350000,
      confirmedRound: 201,
    });

    const refundSpy = vi.spyOn(escrowService, 'refundEscrow');

    // 3. Alice accepts with payment
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: {
        ...buyerHeaders,
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ notes: 'Normal flow acceptance' }),
    });

    expect(acceptRes.status).toBe(201);
    const acceptData = await acceptRes.json();
    expect(acceptData.message).toBe('Offer accepted with escrow');
    expect(acceptData.trade).toBeDefined();
    expect(acceptData.trade.status).toBe('in_progress');
    expect(acceptData.trade.paymentStatus).toBe('escrowed');
    expect(acceptData.trade.priceMicroAlgos).toBe(350000);
    expect(acceptData.escrow).toBeDefined();
    expect(acceptData.escrow.status).toBe('held');

    // 4. Verify refundEscrow was NEVER called
    expect(refundSpy).not.toHaveBeenCalled();

    // 5. Verify offer status is 'claimed'
    const sqliteOffer = await getSqliteSkillOfferById(offer.id);
    expect(sqliteOffer?.status).toBe('claimed');
  });

  it('T012: should revert unpriced offer status to available when trade persistence fails', async () => {
    // 1. Bob posts an unpriced barter offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Prompt Engineering Barter',
        description: 'Exchange prompt engineering for code review',
        priceMicroAlgos: 0,
        wantedSkill: 'Code Review',
      }),
    });
    expect(offerRes.status).toBe(201);
    const { offer } = await offerRes.json();
    expect(offer.status).toBe('available');

    // 2. Mock SQLite trade creation failure
    vi.spyOn(sqliteDb, 'createSqliteTrade').mockRejectedValueOnce(new Error('Simulated trade error'));

    // 3. Alice accepts unpriced offer
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({ notes: 'Accept barter' }),
    });

    expect(acceptRes.status).toBe(500);
    const data = await acceptRes.json();
    expect(data.error.code).toBe('TRADE_CREATION_FAILED');

    // 4. Verify offer status reverted back to 'available'
    const memOffer = memOffers.get(offer.id);
    expect(memOffer?.status).toBe('available');

    const sqliteOffer = await getSqliteSkillOfferById(offer.id);
    expect(sqliteOffer?.status).toBe('available');
  });

  it('T013: Supabase migration 004_escrow_and_marketplace.sql defines escrow_records and column extensions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/004_escrow_and_marketplace.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');
    // Verify skill_offers extensions
    expect(content).toContain('ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS category TEXT;');
    expect(content).toContain('ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS price_micro_algos BIGINT DEFAULT 0;');
    expect(content).toContain("ALTER TABLE skill_offers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'microAlgos';");

    // Verify trades extensions
    expect(content).toContain('ALTER TABLE trades ADD COLUMN IF NOT EXISTS price_micro_algos BIGINT DEFAULT 0;');
    expect(content).toContain("ALTER TABLE trades ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';");
    expect(content).toContain('ALTER TABLE trades ADD COLUMN IF NOT EXISTS escrow_id TEXT;');

    // Verify escrow_records table and indexes
    expect(content).toContain('CREATE TABLE IF NOT EXISTS escrow_records');
    expect(content).toContain('idx_escrow_records_trade_id');
    expect(content).toContain('idx_escrow_records_buyer');
    expect(content).toContain('idx_escrow_records_seller');

    // Verify skill_requests table
    expect(content).toContain('CREATE TABLE IF NOT EXISTS skill_requests');
  });
});
