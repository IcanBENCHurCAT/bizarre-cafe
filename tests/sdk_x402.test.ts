import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createX402PaymentHeader,
  parse402Challenge,
  AgentClient,
  type X402Challenge,
} from '../packages/sdk/src/index';

describe('Agent SDK x402 Micropayments Protocol Helpers', () => {
  describe('createX402PaymentHeader', () => {
    it('should format a payment header with just a transaction ID', () => {
      const header = createX402PaymentHeader('ALGO_TX_1234567890ABCDEF');
      expect(header).toEqual({
        'x-x402-payment': 'ALGO_TX_1234567890ABCDEF',
      });
    });

    it('should format a payment header with receipt in options object', () => {
      const header = createX402PaymentHeader('ALGO_TX_1234567890ABCDEF', {
        receipt: 'receipt_signature_payload_xyz',
      });

      expect(header['x-402-receipt']).toBe('receipt_signature_payload_xyz');
      expect(header['x-x402-payment']).toBeDefined();

      const parsed = JSON.parse(header['x-x402-payment']);
      expect(parsed.txId).toBe('ALGO_TX_1234567890ABCDEF');
      expect(parsed.receipt).toBe('receipt_signature_payload_xyz');
    });

    it('should support string receipt argument', () => {
      const header = createX402PaymentHeader(
        'ALGO_TX_1234567890ABCDEF',
        'receipt_signature_legacy_string',
      );

      expect(header['x-402-receipt']).toBe('receipt_signature_legacy_string');
      const parsed = JSON.parse(header['x-x402-payment']);
      expect(parsed.txId).toBe('ALGO_TX_1234567890ABCDEF');
      expect(parsed.receipt).toBe('receipt_signature_legacy_string');
    });

    it('should format paymentId and receipt together', () => {
      const header = createX402PaymentHeader('ALGO_TX_1234567890ABCDEF', {
        paymentId: 'challenge-uuid-12345',
        receipt: 'receipt_abc',
      });

      const parsed = JSON.parse(header['x-x402-payment']);
      expect(parsed.txId).toBe('ALGO_TX_1234567890ABCDEF');
      expect(parsed.paymentId).toBe('challenge-uuid-12345');
      expect(parsed.receipt).toBe('receipt_abc');
    });
  });

  describe('parse402Challenge', () => {
    it('should extract structured challenge fields from error response body', () => {
      const payload = {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'x402 payment required for this endpoint',
          challenge: {
            paymentId: 'challenge-1111-2222',
            receiverWallet: 'CAFE_RECEIVER_WALLET_ALGORAND_XYZ',
            amount: 250000,
            currency: 'microAlgos',
            network: 'algorand-testnet',
            expiresAt: 1700000000000,
          },
        },
      };

      const parsed = parse402Challenge(payload);
      expect(parsed).toEqual({
        paymentId: 'challenge-1111-2222',
        receiverWallet: 'CAFE_RECEIVER_WALLET_ALGORAND_XYZ',
        amount: 250000,
        currency: 'microAlgos',
        network: 'algorand-testnet',
        expiresAt: 1700000000000,
      });
    });

    it('should handle alternative challenge field naming (snake_case fallbacks)', () => {
      const payload = {
        challenge: {
          proposal_id: 'challenge-3333-4444',
          receiver_wallet: 'CAFE_RECEIVER_FALLBACK_WALLET',
          amount_micro_algos: 100000,
          network: 'localnet',
          expires_at: 1710000000000,
        },
      };

      const parsed = parse402Challenge(payload);
      expect(parsed).toEqual({
        paymentId: 'challenge-3333-4444',
        receiverWallet: 'CAFE_RECEIVER_FALLBACK_WALLET',
        amount: 100000,
        currency: 'microAlgos',
        network: 'localnet',
        expiresAt: 1710000000000,
      });
    });

    it('should return null if challenge is absent or malformed', () => {
      expect(parse402Challenge(null)).toBeNull();
      expect(parse402Challenge(undefined)).toBeNull();
      expect(parse402Challenge({})).toBeNull();
      expect(parse402Challenge({ error: { message: 'Some error' } })).toBeNull();
      expect(parse402Challenge({ error: { challenge: {} } })).toBeNull();
    });
  });

  describe('AgentClient requestWithPayment & Auto-Retry Flow', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return successful response directly without triggering onPaymentRequired', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      globalThis.fetch = mockFetch;

      const onPaymentRequired = vi.fn();
      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
        onPaymentRequired,
      });

      const res = await client.requestWithPayment('http://localhost:3000/api/free');
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onPaymentRequired).not.toHaveBeenCalled();
    });

    it('should intercept 402 challenge, call onPaymentRequired, attach header, and retry', async () => {
      const challengeBody = {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'x402 payment required for this endpoint',
          challenge: {
            paymentId: 'challenge-abc-123',
            receiverWallet: 'CAFE_RECEIVER_WALLET_ALGORAND_XYZ',
            amount: 100000,
            currency: 'microAlgos',
            network: 'algorand-testnet',
            expiresAt: Date.now() + 60000,
          },
        },
      };

      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        attempt++;
        if (attempt === 1) {
          return new Response(JSON.stringify(challengeBody), {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Verify the retry request carries the payment header
        const headers = init?.headers as Headers;
        const paymentHeader = headers?.get('x-x402-payment');
        expect(paymentHeader).toBe('CONFIRMED_ALGO_TX_1234567890');

        return new Response(JSON.stringify({ success: true, item: 'Quantum Espresso Beans' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      globalThis.fetch = mockFetch;

      const paymentHandler = vi.fn(async (challenge: X402Challenge) => {
        expect(challenge.paymentId).toBe('challenge-abc-123');
        expect(challenge.amount).toBe(100000);
        return 'CONFIRMED_ALGO_TX_1234567890';
      });

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
        onPaymentRequired: paymentHandler,
      });

      const res = await client.requestWithPayment('http://localhost:3000/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(paymentHandler).toHaveBeenCalledTimes(1);

      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should return 402 when no payment handler is available', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code: 'PAYMENT_REQUIRED', message: 'Payment required' },
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }));
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-bob',
      });

      const res = await client.requestWithPayment('http://localhost:3000/api/shop/checkout');
      expect(res.status).toBe(402);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should allow per-request paymentHandler override', async () => {
      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          return new Response(JSON.stringify({
            error: {
              challenge: {
                paymentId: 'override-pid',
                receiverWallet: 'OVERRIDE_WALLET',
                amount: 50000,
              },
            },
          }), { status: 402 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      globalThis.fetch = mockFetch;

      const defaultHandler = vi.fn();
      const perRequestHandler = vi.fn().mockResolvedValue('TX_OVERRIDE_123');

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-override',
        onPaymentRequired: defaultHandler,
      });

      const res = await client.requestWithPayment(
        'http://localhost:3000/api/owner/action',
        {},
        perRequestHandler,
      );

      expect(res.status).toBe(200);
      expect(defaultHandler).not.toHaveBeenCalled();
      expect(perRequestHandler).toHaveBeenCalledTimes(1);
    });
  });
});
