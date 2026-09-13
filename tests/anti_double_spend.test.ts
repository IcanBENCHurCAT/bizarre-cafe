import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTransactionSpent,
  recordSpentTransaction,
  clearSpentTransactions,
  getSpentTransactionsCacheSize,
} from '../src/services/x402/antiDoubleSpend';
import {
  verifyPaymentSubmission,
  registerMockTransaction,
  clearMockTransactions,
  setMockVerificationMode,
} from '../src/services/x402/index';
import { clearSqlitePayments } from '../src/db/sqlite';

describe('Anti-Double-Spend Service', () => {
  const receiverWallet = 'CAFE_RECEIVER_ALGORAND_ADDRESS_XYZ12345';
  const payerWallet = 'PAYER_WALLET_ADDRESS_1234567890ABCDEF';

  beforeEach(async () => {
    clearSpentTransactions();
    clearMockTransactions();
    setMockVerificationMode(true);
    await clearSqlitePayments();
  });

  it('should report an unrecorded transaction as not spent', async () => {
    const txId = 'UNSPENT_TX_ID_1234567890ABCDEFGHIJKL';
    const spent = await isTransactionSpent(txId);
    expect(spent).toBe(false);
  });

  it('should record a spent transaction and detect it in cache and DB', async () => {
    const txId = 'SPENT_TX_ID_001_1234567890ABCDEFGHIJK';

    await recordSpentTransaction({
      txId,
      amount: 500000,
      payer: payerWallet,
      receiver: receiverWallet,
      serviceId: '/api/shop/checkout',
      proposalId: 'order-uuid-1',
    });

    const isSpent = await isTransactionSpent(txId);
    expect(isSpent).toBe(true);
    expect(getSpentTransactionsCacheSize()).toBeGreaterThanOrEqual(1);
  });

  it('should reject a duplicate spend with DOUBLE_SPEND_DETECTED error', async () => {
    const txId = 'DUPLICATE_TX_ID_002_1234567890ABCDEF';

    await recordSpentTransaction({
      txId,
      amount: 250000,
      payer: payerWallet,
      receiver: receiverWallet,
      serviceId: '/api/shop/checkout',
    });

    await expect(async () => {
      await recordSpentTransaction({
        txId,
        amount: 250000,
        payer: payerWallet,
        receiver: receiverWallet,
        serviceId: '/api/owner/action',
      });
    }).rejects.toThrow('DOUBLE_SPEND_DETECTED');
  });

  it('should persist spent transaction across memory cache flush via database record', async () => {
    const txId = 'PERSISTENT_TX_ID_003_1234567890ABCDEF';

    await recordSpentTransaction({
      txId,
      amount: 1000000,
      payer: payerWallet,
      receiver: receiverWallet,
      serviceId: '/api/events/join',
    });

    // Flush in-memory cache
    clearSpentTransactions();
    expect(getSpentTransactionsCacheSize()).toBe(0);

    // Should still detect as spent from SQLite database
    const isSpent = await isTransactionSpent(txId);
    expect(isSpent).toBe(true);

    // And re-populate memory cache
    expect(getSpentTransactionsCacheSize()).toBe(1);
  });

  it('should handle concurrent race conditions and allow only one transaction to succeed', async () => {
    const txId = 'CONCURRENT_RACE_TX_1234567890ABCDEF';

    const attempts = await Promise.allSettled([
      recordSpentTransaction({
        txId,
        amount: 300000,
        payer: payerWallet,
        receiver: receiverWallet,
        serviceId: '/api/shop/checkout',
      }),
      recordSpentTransaction({
        txId,
        amount: 300000,
        payer: payerWallet,
        receiver: receiverWallet,
        serviceId: '/api/shop/checkout',
      }),
      recordSpentTransaction({
        txId,
        amount: 300000,
        payer: payerWallet,
        receiver: receiverWallet,
        serviceId: '/api/shop/checkout',
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    // Exactly one should succeed
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);

    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason.message).toContain('DOUBLE_SPEND_DETECTED');
      }
    }
  });

  it('should safely handle empty or invalid txIds', async () => {
    expect(await isTransactionSpent('')).toBe(false);
    expect(await isTransactionSpent('   ')).toBe(false);
    expect(await isTransactionSpent(null as any)).toBe(false);
  });
});

describe('verifyPaymentSubmission Coordinator', () => {
  const receiverWallet = 'CAFE_RECEIVER_ALGORAND_ADDRESS_XYZ12345';
  const payerWallet = 'PAYER_WALLET_ADDRESS_1234567890ABCDEF';

  beforeEach(async () => {
    clearSpentTransactions();
    clearMockTransactions();
    setMockVerificationMode(true);
    await clearSqlitePayments();
  });

  it('should verify on-chain and record spent transaction when valid', async () => {
    const txId = 'COORDINATED_TX_001_1234567890ABCDEF';

    registerMockTransaction({
      txId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: 600000,
      confirmedRound: 500,
    });

    const outcome = await verifyPaymentSubmission(
      { txId, paymentId: 'pay-123' },
      { amountMicroAlgos: 500000, serviceId: '/api/shop/checkout', receiverWallet },
    );

    expect(outcome.verified).toBe(true);
    expect(outcome.txId).toBe(txId);
    expect(outcome.sender).toBe(payerWallet);

    // Subsequent check must show spent
    const isSpent = await isTransactionSpent(txId);
    expect(isSpent).toBe(true);
  });

  it('should immediately reject when replaying a previously verified payment submission', async () => {
    const txId = 'COORDINATED_REPLAY_TX_1234567890ABC';

    registerMockTransaction({
      txId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: 500000,
      confirmedRound: 500,
    });

    // First attempt succeeds
    const firstOutcome = await verifyPaymentSubmission(
      { txId },
      { amountMicroAlgos: 500000, serviceId: '/api/shop/checkout', receiverWallet },
    );
    expect(firstOutcome.verified).toBe(true);

    // Second attempt fails with DOUBLE_SPEND_DETECTED
    const replayOutcome = await verifyPaymentSubmission(
      { txId },
      { amountMicroAlgos: 500000, serviceId: '/api/shop/checkout', receiverWallet },
    );
    expect(replayOutcome.verified).toBe(false);
    expect(replayOutcome.reason).toBe('DOUBLE_SPEND_DETECTED');
  });

  it('should not record in anti-double-spend registry if Algorand verification fails', async () => {
    const txId = 'FAILED_ALGO_TX_1234567890ABCDEFGHIJK';

    registerMockTransaction({
      txId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: 100000, // required 500000
      confirmedRound: 500,
    });

    const outcome = await verifyPaymentSubmission(
      { txId },
      { amountMicroAlgos: 500000, serviceId: '/api/shop/checkout', receiverWallet },
    );

    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toContain('Insufficient payment amount');

    // Should NOT be recorded as spent
    const isSpent = await isTransactionSpent(txId);
    expect(isSpent).toBe(false);
  });
});
