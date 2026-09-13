import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireX402Payment } from '../src/middleware/auth';
import { config } from '../src/config';
import {
  registerMockTransaction,
  clearMockTransactions,
  clearSpentTransactions,
  setMockVerificationMode,
  isTransactionSpent,
} from '../src/services/x402/index';
import { clearSqlitePayments } from '../src/db/sqlite';
import { AgentClient, type X402Challenge } from '../packages/sdk/src/index';

describe('x402 Protocol End-to-End Integration Flow', () => {
  const receiverWallet = config.algorandReceiverWallet;
  const payerWallet = 'ALGO_TEST_PAYER_WALLET_ADDRESS_12345';
  const minRequiredAmount = 250000; // 0.25 ALGO

  let app: Hono;

  beforeEach(async () => {
    clearSpentTransactions();
    clearMockTransactions();
    setMockVerificationMode(true);
    await clearSqlitePayments();

    app = new Hono();
    // Test paid route simulating e.g. /api/shop/checkout or /api/owner/action
    app.post('/api/shop/checkout', requireX402Payment({ minAmountMicroAlgos: minRequiredAmount }), async (c) => {
      const txId = c.get('x402TxId');
      const receipt = c.get('x402Receipt');
      return c.json({
        success: true,
        orderId: 'order-xyz-987',
        purchased: 'Quantum Espresso Beans',
        txId,
        receipt,
      });
    });
  });

  it('Step 1: Request without payment header returns 402 with structured challenge details', async () => {
    const res = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();

    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('PAYMENT_REQUIRED');
    expect(body.error.message).toBe('x402 payment required for this endpoint');
    expect(body.error.challenge).toBeDefined();

    const challenge = body.error.challenge;
    expect(typeof challenge.paymentId).toBe('string');
    expect(challenge.paymentId.length).toBeGreaterThan(0);
    expect(challenge.receiverWallet).toBe(receiverWallet);
    expect(challenge.amount).toBe(minRequiredAmount);
    expect(challenge.currency).toBe('microAlgos');
    expect(challenge.network).toBe(config.algorandNetwork || 'algorand-testnet');
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
  });

  it('Step 2: Submit a valid confirmed Algorand payment transaction returns 200 OK', async () => {
    const txId = 'VALID_CONFIRMED_ALGO_TX_001_ABCDEF123456';

    registerMockTransaction({
      txId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: minRequiredAmount,
      confirmedRound: 150,
    });

    const res = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderId).toBe('order-xyz-987');
    expect(body.txId).toBe(txId);
    expect(body.receipt.sender).toBe(payerWallet);

    // Verify recorded as spent
    const spent = await isTransactionSpent(txId);
    expect(spent).toBe(true);
  });

  it('Step 3: Re-submit the identical transaction returns 402 with DOUBLE_SPEND_DETECTED', async () => {
    const txId = 'DOUBLE_SPEND_ALGO_TX_002_ABCDEF123456';

    registerMockTransaction({
      txId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: minRequiredAmount,
      confirmedRound: 150,
    });

    // 1st attempt: Successful purchase
    const firstRes = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    });
    expect(firstRes.status).toBe(200);

    // 2nd attempt: Replay attack with same txId
    const replayRes = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-x402-payment': txId,
      },
      body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    });

    expect(replayRes.status).toBe(402);
    const replayBody = await replayRes.json();
    expect(replayBody.error.code).toBe('DOUBLE_SPEND_DETECTED');
    expect(replayBody.error.message).toContain('DOUBLE_SPEND_DETECTED');
    expect(replayBody.error.txId).toBe(txId);
  });

  it('Step 4: Submit underpayment returns 402 PAYMENT_VERIFICATION_FAILED', async () => {
    const underpaidTxId = 'UNDERPAID_ALGO_TX_003_ABCDEF123456';

    registerMockTransaction({
      txId: underpaidTxId,
      sender: payerWallet,
      receiver: receiverWallet,
      amount: minRequiredAmount - 50000, // 200,000 instead of 250,000
      confirmedRound: 150,
    });

    const res = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-x402-payment': underpaidTxId,
      },
      body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(body.error.message).toContain('Insufficient payment amount');
    expect(body.error.txId).toBe(underpaidTxId);

    // Underpayment transaction should NOT be marked spent
    const spent = await isTransactionSpent(underpaidTxId);
    expect(spent).toBe(false);
  });

  it('Step 5: Full automated SDK AgentClient payment retry loop with app.fetch', async () => {
    const autoTxId = 'AUTO_SDK_RESOLVED_TX_004_1234567890';

    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'autonomous-agent-007',
      onPaymentRequired: async (challenge: X402Challenge) => {
        expect(challenge.amount).toBe(minRequiredAmount);
        expect(challenge.receiverWallet).toBe(receiverWallet);

        // Sign/simulate payment on Algorand ledger matching challenge
        registerMockTransaction({
          txId: autoTxId,
          sender: payerWallet,
          receiver: challenge.receiverWallet,
          amount: challenge.amount,
          confirmedRound: 200,
        });

        return autoTxId;
      },
    });

    // Mock global fetch to dispatch directly to our test Hono app instance
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = url.replace('http://localhost:3000', '');
      return app.request(path, init);
    };

    try {
      const res = await client.requestWithPayment('http://localhost:3000/api/shop/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.txId).toBe(autoTxId);

      // Verify transaction was marked as spent
      expect(await isTransactionSpent(autoTxId)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
