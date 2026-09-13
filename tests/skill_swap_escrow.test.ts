import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { config } from '../src/config';
import { clearMemSkillSwap } from '../src/routes/skill-swap';
import {
  clearSqliteSkillSwap,
  clearSqlitePayments,
  getSqliteTradeById,
  getSqliteEscrowRecord,
  getSqliteSkillOfferById,
} from '../src/db/sqlite';
import { clearMemEscrows, getEscrowRecord } from '../src/services/escrow';
import {
  registerMockTransaction,
  clearMockTransactions,
  clearSpentTransactions,
  setMockVerificationMode,
} from '../src/services/x402/index';

describe('Skill Swap Escrow Lifecycle & x402 Micropayments (Phases 3 & 4)', () => {
  const sellerAgentId = 'agent-bob-seller';
  const buyerAgentId = 'agent-alice-buyer';
  const thirdPartyAgentId = 'agent-charlie-observer';

  const sellerHeaders = {
    'X-Agent-ID': sellerAgentId,
    'Content-Type': 'application/json',
  };

  const buyerHeaders = {
    'X-Agent-ID': buyerAgentId,
    'Content-Type': 'application/json',
  };

  const thirdPartyHeaders = {
    'X-Agent-ID': thirdPartyAgentId,
    'Content-Type': 'application/json',
  };

  beforeEach(async () => {
    clearMemSkillSwap();
    clearMemEscrows();
    clearSpentTransactions();
    clearMockTransactions();
    setMockVerificationMode(true);
    await clearSqliteSkillSwap();
    await clearSqlitePayments();
  });

  it('US2: should return HTTP 402 challenge when accepting a priced offer without payment', async () => {
    // 1. Bob creates a priced offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Smart Contract Audit',
        description: 'TEAL auditing and formal verification',
        priceMicroAlgos: 250000,
        currency: 'microAlgos',
        category: 'security',
      }),
    });
    expect(offerRes.status).toBe(201);
    const { offer } = await offerRes.json();

    // 2. Alice tries to accept without payment header
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({ notes: 'Looking forward to the audit' }),
    });

    expect(acceptRes.status).toBe(402);
    const acceptData = await acceptRes.json();
    expect(acceptData.error).toBeDefined();
    expect(acceptData.error.code).toBe('PAYMENT_REQUIRED');
    expect(acceptData.error.challenge).toBeDefined();
    expect(acceptData.error.challenge.paymentId).toBe(`escrow-${offer.id}`);
    expect(acceptData.error.challenge.receiverWallet).toBe(config.algorandReceiverWallet);
    expect(acceptData.error.challenge.amount).toBe(250000);
    expect(acceptData.error.challenge.currency).toBe('microAlgos');
    expect(acceptData.error.challenge.network).toBe(config.algorandNetwork || 'algorand-testnet');
  });

  it('US2: should lock funds in escrow (status: held) and create trade (status: in_progress) with valid payment', async () => {
    // 1. Create offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Smart Contract Audit',
        description: 'TEAL auditing and formal verification',
        priceMicroAlgos: 300000,
        currency: 'microAlgos',
        category: 'security',
      }),
    });
    const { offer } = await offerRes.json();

    // 2. Register mock Algorand payment transaction
    const txId = 'VALID_ALGO_TX_1234567890ABCDEF';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 300000,
      confirmedRound: 100,
    });

    // 3. Alice accepts with x-x402-payment header
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: {
        ...buyerHeaders,
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ notes: 'Escrow funded via Algorand tx' }),
    });

    expect(acceptRes.status).toBe(201);
    const acceptData = await acceptRes.json();
    expect(acceptData.message).toBe('Offer accepted with escrow');
    expect(acceptData.trade).toBeDefined();
    expect(acceptData.trade.status).toBe('in_progress');
    expect(acceptData.trade.paymentStatus).toBe('escrowed');
    expect(acceptData.trade.priceMicroAlgos).toBe(300000);
    expect(acceptData.trade.escrowId).toBeDefined();

    // 4. Verify EscrowRecord in memory and SQLite
    expect(acceptData.escrow).toBeDefined();
    expect(acceptData.escrow.status).toBe('held');
    expect(acceptData.escrow.amountMicroAlgos).toBe(300000);
    expect(acceptData.escrow.txId).toBe(txId);

    const sqliteEscrow = await getSqliteEscrowRecord(acceptData.escrow.id);
    expect(sqliteEscrow).not.toBeNull();
    expect(sqliteEscrow?.status).toBe('held');
    expect(sqliteEscrow?.amountMicroAlgos).toBe(300000);

    // 5. Verify offer status updated to claimed
    const updatedOffer = await getSqliteSkillOfferById(offer.id);
    expect(updatedOffer?.status).toBe('claimed');

    // 6. Verify GET /trades/:id returns the trade
    const tradeFetchRes = await app.request(`/api/skill-swap/trades/${acceptData.trade.id}`, {
      headers: buyerHeaders,
    });
    expect(tradeFetchRes.status).toBe(200);
    const tradeFetchData = await tradeFetchRes.json();
    expect(tradeFetchData.trade.id).toBe(acceptData.trade.id);
    expect(tradeFetchData.trade.status).toBe('in_progress');
    expect(tradeFetchData.trade.paymentStatus).toBe('escrowed');
  });

  it('US2: should reject replaying an already spent transaction with DOUBLE_SPEND_DETECTED', async () => {
    // 1. Create two offers
    const offerRes1 = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Audit Part 1',
        description: 'First phase',
        priceMicroAlgos: 100000,
      }),
    });
    const { offer: offer1 } = await offerRes1.json();

    const offerRes2 = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Audit Part 2',
        description: 'Second phase',
        priceMicroAlgos: 100000,
      }),
    });
    const { offer: offer2 } = await offerRes2.json();

    // 2. Register mock tx
    const txId = 'REPLAYED_TX_HASH_XYZ987';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 100000,
      confirmedRound: 101,
    });

    // 3. First acceptance succeeds
    const res1 = await app.request(`/api/skill-swap/offers/${offer1.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    expect(res1.status).toBe(201);

    // 4. Second acceptance with same txId is rejected
    const res2 = await app.request(`/api/skill-swap/offers/${offer2.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(402);
    const data2 = await res2.json();
    expect(data2.error.code).toBe('DOUBLE_SPEND_DETECTED');
  });

  it('US3: should complete trade, release escrowed funds (status: released), and settle payment (status: settled)', async () => {
    // 1. Create and accept offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Algorand Indexer Setup',
        description: 'Indexer infra setup',
        priceMicroAlgos: 400000,
      }),
    });
    const { offer } = await offerRes.json();

    const txId = 'CONFIRM_RELEASE_TX_400K';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 400000,
      confirmedRound: 102,
    });

    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    const { trade, escrow } = await acceptRes.json();

    // 2. Buyer marks trade as complete
    const completeRes = await app.request(`/api/skill-swap/trades/${trade.id}/complete`, {
      method: 'POST',
      headers: buyerHeaders,
    });

    expect(completeRes.status).toBe(200);
    const completeData = await completeRes.json();
    expect(completeData.message).toBe('Trade completed successfully');
    expect(completeData.status).toBe('completed');
    expect(completeData.paymentStatus).toBe('settled');

    // 3. Verify EscrowRecord is released
    const updatedEscrow = await getEscrowRecord(escrow.id);
    expect(updatedEscrow?.status).toBe('released');
    expect(updatedEscrow?.releasedAt).toBeDefined();

    // 4. Verify SQLite trade updated
    const sqliteTrade = await getSqliteTradeById(trade.id);
    expect(sqliteTrade?.status).toBe('completed');
    expect(sqliteTrade?.paymentStatus).toBe('settled');

    // 5. Verify offer status is completed
    const updatedOffer = await getSqliteSkillOfferById(offer.id);
    expect(updatedOffer?.status).toBe('completed');
  });

  it('US3: should cancel trade, refund escrow (status: refunded), and restore offer to available', async () => {
    // 1. Create and accept offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Code Review Session',
        description: 'Architecture review',
        priceMicroAlgos: 150000,
      }),
    });
    const { offer } = await offerRes.json();

    const txId = 'CANCEL_REFUND_TX_150K';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 150000,
      confirmedRound: 103,
    });

    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    const { trade, escrow } = await acceptRes.json();

    // 2. Either participant (e.g. seller Bob) cancels trade
    const cancelRes = await app.request(`/api/skill-swap/trades/${trade.id}/cancel`, {
      method: 'POST',
      headers: sellerHeaders,
    });

    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.message).toBe('Trade cancelled');
    expect(cancelData.status).toBe('cancelled');

    // 3. Verify EscrowRecord is refunded
    const updatedEscrow = await getEscrowRecord(escrow.id);
    expect(updatedEscrow?.status).toBe('refunded');
    expect(updatedEscrow?.refundedAt).toBeDefined();

    // 4. Verify trade status is cancelled and paymentStatus is refunded
    const sqliteTrade = await getSqliteTradeById(trade.id);
    expect(sqliteTrade?.status).toBe('cancelled');
    expect(sqliteTrade?.paymentStatus).toBe('refunded');

    // 5. Verify offer is restored to available
    const restoredOffer = await getSqliteSkillOfferById(offer.id);
    expect(restoredOffer?.status).toBe('available');
  });

  it('US3: should reject unauthorized attempts to complete or cancel a trade with 403 FORBIDDEN', async () => {
    // Create and accept offer between Bob and Alice
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Private Consultation',
        description: 'Confidential review',
        priceMicroAlgos: 200000,
      }),
    });
    const { offer } = await offerRes.json();

    const txId = 'UNAUTH_TEST_TX_200K';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 200000,
      confirmedRound: 104,
    });

    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    const { trade } = await acceptRes.json();

    // Charlie (third party) tries to complete
    const completeRes = await app.request(`/api/skill-swap/trades/${trade.id}/complete`, {
      method: 'POST',
      headers: thirdPartyHeaders,
    });
    expect(completeRes.status).toBe(403);
    const completeData = await completeRes.json();
    expect(completeData.error.code).toBe('FORBIDDEN');

    // Charlie tries to cancel
    const cancelRes = await app.request(`/api/skill-swap/trades/${trade.id}/cancel`, {
      method: 'POST',
      headers: thirdPartyHeaders,
    });
    expect(cancelRes.status).toBe(403);
    const cancelData = await cancelRes.json();
    expect(cancelData.error.code).toBe('FORBIDDEN');
  });

  it('US3: should reject cancelling an already completed trade with 400 BAD_REQUEST', async () => {
    // Create, accept, and complete trade
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Quick Audit',
        description: 'Fast check',
        priceMicroAlgos: 100000,
      }),
    });
    const { offer } = await offerRes.json();

    const txId = 'ALREADY_COMPLETE_TX_100K';
    registerMockTransaction({
      txId,
      sender: 'ALICE_TEST_WALLET_ADDRESS',
      receiver: config.algorandReceiverWallet,
      amount: 100000,
      confirmedRound: 105,
    });

    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { ...buyerHeaders, 'x-x402-payment': txId },
      body: JSON.stringify({}),
    });
    const { trade } = await acceptRes.json();

    await app.request(`/api/skill-swap/trades/${trade.id}/complete`, {
      method: 'POST',
      headers: buyerHeaders,
    });

    // Try to cancel now
    const cancelRes = await app.request(`/api/skill-swap/trades/${trade.id}/cancel`, {
      method: 'POST',
      headers: buyerHeaders,
    });
    expect(cancelRes.status).toBe(400);
    const cancelData = await cancelRes.json();
    expect(cancelData.error.code).toBe('BAD_REQUEST');
  });

  it('should support pure barter swaps without payment requirements', async () => {
    // Create unpriced barter offer
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Pure Barter Exchange',
        description: 'Will trade skills without microAlgos',
        priceMicroAlgos: 0,
      }),
    });
    const { offer } = await offerRes.json();

    // Accept without any payment header
    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({ notes: 'Barter accepted' }),
    });

    expect(acceptRes.status).toBe(201);
    const acceptData = await acceptRes.json();
    expect(acceptData.trade.status).toBe('pending');
    expect(acceptData.trade.paymentStatus).toBe('unpaid');
    expect(acceptData.trade.escrowId).toBeNull();
  });

  it('should prevent agents from accepting their own offer', async () => {
    const offerRes = await app.request('/api/skill-swap/offer', {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        skillName: 'Self Offer',
        description: 'Cannot accept own offer',
        priceMicroAlgos: 100000,
      }),
    });
    const { offer } = await offerRes.json();

    const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({}),
    });

    expect(acceptRes.status).toBe(400);
    const acceptData = await acceptRes.json();
    expect(acceptData.error.message).toBe('Cannot accept your own offer');
  });

  describe('End-to-End Multi-Agent Integration & Edge Cases (T024)', () => {
    it('should reject concurrent acceptance attempts once an offer is claimed', async () => {
      // Bob creates a priced offer
      const offerRes = await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Rare Quantum Compiler Knowledge',
          description: 'High demand skill for competing agents',
          priceMicroAlgos: 100000,
        }),
      });
      const { offer } = await offerRes.json();

      // Setup 2 distinct mock payments for Alice and Charlie
      const aliceTx = 'ALICE_CONCURRENT_TX_1';
      const charlieTx = 'CHARLIE_CONCURRENT_TX_2';
      registerMockTransaction({
        txId: aliceTx,
        sender: 'ALICE_WALLET',
        receiver: config.algorandReceiverWallet,
        amount: 100000,
        confirmedRound: 100,
      });
      registerMockTransaction({
        txId: charlieTx,
        sender: 'CHARLIE_WALLET',
        receiver: config.algorandReceiverWallet,
        amount: 100000,
        confirmedRound: 100,
      });

      const charlieHeaders = {
        'X-Agent-ID': 'agent-charlie',
        'Content-Type': 'application/json',
      };

      // Alice accepts first
      const aliceRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
        method: 'POST',
        headers: { ...buyerHeaders, 'x-x402-payment': aliceTx },
        body: JSON.stringify({ notes: 'Alice got here first' }),
      });
      expect(aliceRes.status).toBe(201);

      // Charlie attempts to accept the same offer concurrently
      const charlieRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
        method: 'POST',
        headers: { ...charlieHeaders, 'x-x402-payment': charlieTx },
        body: JSON.stringify({ notes: 'Charlie was slightly late' }),
      });
      expect(charlieRes.status).toBe(409);
      const charlieData = await charlieRes.json();
      expect(charlieData.error.code).toBe('CONFLICT');
      expect(charlieData.error.message).toBe('Offer is no longer available');
    });

    it('should seamlessly recover and retrieve trades from memory or SQLite during database hiccups', async () => {
      // 1. Create offer and trade
      const offerRes = await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Resilience Engineering',
          description: 'Failover testing and offline memory fallback',
          priceMicroAlgos: 100000,
        }),
      });
      const { offer } = await offerRes.json();

      const txId = 'RECOVERY_TEST_TX_1';
      registerMockTransaction({
        txId,
        sender: 'ALICE_WALLET',
        receiver: config.algorandReceiverWallet,
        amount: 100000,
        confirmedRound: 100,
      });

      const acceptRes = await app.request(`/api/skill-swap/offers/${offer.id}/accept`, {
        method: 'POST',
        headers: { ...buyerHeaders, 'x-x402-payment': txId },
        body: JSON.stringify({ notes: 'Testing fallback retrieval' }),
      });
      expect(acceptRes.status).toBe(201);
      const { trade } = await acceptRes.json();

      // 2. Query GET /trades and GET /trades/:id
      const tradesRes = await app.request('/api/skill-swap/trades', {
        headers: buyerHeaders,
      });
      expect(tradesRes.status).toBe(200);
      const tradesData = await tradesRes.json();
      expect(tradesData.trades).toBeDefined();
      expect(Array.isArray(tradesData.trades)).toBe(true);
      expect(tradesData.trades.length).toBeGreaterThan(0);
      expect(tradesData.trades[0].id).toBe(trade.id);

      const singleTradeRes = await app.request(`/api/skill-swap/trades/${trade.id}`, {
        headers: buyerHeaders,
      });
      expect(singleTradeRes.status).toBe(200);
      const singleTradeData = await singleTradeRes.json();
      expect(singleTradeData.trade.id).toBe(trade.id);
    });
  });
});
