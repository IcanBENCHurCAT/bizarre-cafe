import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { memReceipts, clearMemReceipts } from '../src/routes/shop';

describe('Shop Security - IDOR Protection', () => {
  beforeEach(() => {
    clearMemReceipts();
  });

  describe('GET /api/shop/checkout/:promiseId', () => {
    it('should prevent an authenticated agent from accessing another agent checkout status (403 Forbidden)', async () => {
      const promiseId = 'promise-agent-a-123';
      memReceipts.set(promiseId, {
        id: promiseId,
        user_id: 'agent-a',
        item_id: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
        total_amount: 50,
        currency: 'microUSDC',
        payment_method: 'x402',
        status: 'pending',
        x402_promise_id: promiseId,
        created_at: new Date().toISOString(),
      });

      // Request as agent-b
      const res = await app.request(`/api/shop/checkout/${promiseId}`, {
        headers: {
          'X-Agent-ID': 'agent-b',
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should allow an authenticated agent to access their own checkout status (200 OK)', async () => {
      const promiseId = 'promise-agent-a-123';
      memReceipts.set(promiseId, {
        id: promiseId,
        user_id: 'agent-a',
        item_id: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
        total_amount: 50,
        currency: 'microUSDC',
        payment_method: 'x402',
        status: 'pending',
        x402_promise_id: promiseId,
        created_at: new Date().toISOString(),
      });

      // Request as agent-a
      const res = await app.request(`/api/shop/checkout/${promiseId}`, {
        headers: {
          'X-Agent-ID': 'agent-a',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.promiseId).toBe(promiseId);
      expect(body.receipt.user_id).toBe('agent-a');
    });

    it('should return 401 Unauthorized when unauthenticated request is made', async () => {
      const promiseId = 'promise-agent-a-123';
      const res = await app.request(`/api/shop/checkout/${promiseId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/shop/receipts/:id', () => {
    it('should prevent an authenticated agent from accessing another agent receipt details (403 Forbidden)', async () => {
      const receiptId = 'receipt-agent-a-456';
      memReceipts.set(receiptId, {
        id: receiptId,
        user_id: 'agent-a',
        item_id: '11111111-1111-1111-1111-111111111111',
        quantity: 2,
        total_amount: 100,
        currency: 'microUSDC',
        payment_method: 'x402',
        status: 'completed',
        x402_promise_id: receiptId,
        created_at: new Date().toISOString(),
      });

      // Request as agent-b
      const res = await app.request(`/api/shop/receipts/${receiptId}`, {
        headers: {
          'X-Agent-ID': 'agent-b',
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Access denied');
    });

    it('should allow an authenticated agent to access their own receipt details (200 OK)', async () => {
      const receiptId = 'receipt-agent-a-456';
      memReceipts.set(receiptId, {
        id: receiptId,
        user_id: 'agent-a',
        item_id: '11111111-1111-1111-1111-111111111111',
        quantity: 2,
        total_amount: 100,
        currency: 'microUSDC',
        payment_method: 'x402',
        status: 'completed',
        x402_promise_id: receiptId,
        created_at: new Date().toISOString(),
      });

      // Request as agent-a
      const res = await app.request(`/api/shop/receipts/${receiptId}`, {
        headers: {
          'X-Agent-ID': 'agent-a',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.receipt.id).toBe(receiptId);
      expect(body.receipt.agentId).toBe('agent-a');
    });

    it('should return 401 Unauthorized when unauthenticated request is made to GET /api/shop/receipts/:id', async () => {
      const receiptId = 'receipt-agent-a-456';
      const res = await app.request(`/api/shop/receipts/${receiptId}`);
      expect(res.status).toBe(401);
    });
  });
});
