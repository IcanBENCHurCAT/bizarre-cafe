import { describe, it, expect, beforeEach, vi } from 'vitest';

const { tables, mockSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    verification_challenges: [],
    agent_verification: [],
    receipts: [],
    shop_items: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Quantum Espresso Beans',
        description: 'Beans roasted in multiple dimensions simultaneously',
        price: 50,
        currency: 'microUSDC',
        stock: 100,
        is_active: true,
        image_url: null,
        created_at: new Date().toISOString(),
      },
    ],
    owner_messages: [],
    owner_mood: [
      {
        id: '1',
        mood: 'mysterious',
        stress_level: 25,
        last_interaction: new Date().toISOString(),
        total_interactions: 0,
      },
    ],
  };

  class MockQueryBuilder {
    private tableName: string;
    private currentRows: any[];
    private currentData: any = null;
    private isSingle = false;

    constructor(tableName: string) {
      this.tableName = tableName;
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      this.currentRows = [...tables[tableName]];
    }

    select(_fields = '*') {
      if (!this.currentData) {
        this.currentData = this.currentRows;
      }
      return this;
    }

    insert(data: any) {
      const toInsert = Array.isArray(data) ? data : [data];
      tables[this.tableName].push(...toInsert);
      this.currentRows.push(...toInsert);
      this.currentData = data;
      return this;
    }

    update(updates: any) {
      for (const row of this.currentRows) {
        Object.assign(row, updates);
      }
      for (const row of tables[this.tableName]) {
        const match = this.currentRows.find((r) => r.id && r.id === row.id);
        if (match) {
          Object.assign(row, updates);
        }
      }
      this.currentData = this.currentRows;
      return this;
    }

    upsert(data: any) {
      const toUpsert = Array.isArray(data) ? data : [data];
      for (const item of toUpsert) {
        const idx = tables[this.tableName].findIndex(
          (r) => (item.id && r.id === item.id) || (item.user_id && r.user_id === item.user_id),
        );
        if (idx >= 0) {
          tables[this.tableName][idx] = { ...tables[this.tableName][idx], ...item };
        } else {
          tables[this.tableName].push(item);
        }
      }
      this.currentData = data;
      return this;
    }

    eq(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] === val);
      this.currentData = this.currentRows;
      return this;
    }

    gte(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] >= val);
      this.currentData = this.currentRows;
      return this;
    }

    order(col: string, opts?: { ascending?: boolean }) {
      const asc = opts?.ascending ?? true;
      this.currentRows.sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
      this.currentData = this.currentRows;
      return this;
    }

    limit(count: number) {
      this.currentRows = this.currentRows.slice(0, count);
      this.currentData = this.currentRows;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    then(resolve: (val: any) => any, reject?: (err: any) => any) {
      let result = this.currentData ?? this.currentRows;
      if (this.isSingle) {
        result = Array.isArray(result) ? (result[0] ?? null) : result;
      }
      return Promise.resolve({ data: result, error: null }).then(resolve, reject);
    }
  }

  const mockSupabase = {
    from: (tableName: string) => new MockQueryBuilder(tableName),
  };

  return { tables, mockSupabase };
});

vi.mock('../src/supabase/client', () => ({
  createSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

import app from '../src/index';
import { clearPayments } from '../src/services/x402/index';
import { clearState } from '../src/services/verification/index';
import { resetStore as resetNarrativeStore } from '../src/services/narrative/index';
import { config } from '../src/config';

describe('Service Integration Tests', () => {
  beforeEach(() => {
    clearPayments();
    clearState();
    resetNarrativeStore();
    tables.verification_challenges = [];
    tables.agent_verification = [];
    tables.receipts = [];
    tables.owner_messages = [];
  });

  const authHeaders = {
    'X-Agent-ID': 'test-agent-service-integration',
    'Content-Type': 'application/json',
  };

  it('should serve .well-known/agent.json', async () => {
    const res = await app.request('/.well-known/agent.json');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe('bizarre-cafe');
    expect(body.endpoints).toBeDefined();
    expect(body.x402.payment_endpoint).toBe('/api/shop/checkout');
    expect(body.x402.receipt_validation).toBe('/api/shop/receipts');
  });

  it('should interact with the Owner and receive narrative AI response', async () => {
    const res = await app.request('/api/owner/message', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'Hello, what kind of coffee do you brew here?',
        sentimentHint: 'positive',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Owner responded');
    expect(body.conversation).toBeDefined();
    expect(body.conversation.ownerResponse).toBeDefined();
    expect(typeof body.conversation.ownerResponse).toBe('string');
  });

  it('should initiate shop checkout with x402 payment promise', async () => {
    const res = await app.request('/api/shop/checkout', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-payment-receipt': 'receipt_test_initial_token',
      },
      body: JSON.stringify({
        itemId: '11111111-1111-1111-1111-111111111111',
        quantity: 2,
        paymentMethod: 'x402',
        agentId: 'test-agent-service-integration',
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.message).toBe('Checkout initiated');
    expect(body.checkout).toBeDefined();
    expect(body.checkout.promiseId).toBeDefined();
    expect(body.checkout.totalAmount).toBe(100);

    // Verify GET /checkout/:promiseId
    const statusRes = await app.request(`/api/shop/checkout/${body.checkout.promiseId}`, {
      headers: authHeaders,
    });
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.promiseId).toBe(body.checkout.promiseId);
    expect(statusBody.total).toBe(100);
  });

  it('should execute full verification flow: challenge -> verify -> log', async () => {
    // 1. Request challenge
    const challengeRes = await app.request('/api/verification/challenge', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        agentId: 'test-agent-service-integration',
      }),
    });

    expect(challengeRes.status).toBe(200);
    const challengeBody = await challengeRes.json();
    expect(challengeBody.challenge).toBeDefined();
    const nonce = challengeBody.challenge.challenge;
    expect(nonce).toBeDefined();

    // 2. Submit verification with valid signature format and nonce
    const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const verifyRes = await app.request('/api/verification/verify', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        agentId: 'test-agent-service-integration',
        challenge: nonce,
        signature: dummySignature,
        walletAddress: 'ALGO:TEST_WALLET_ADDRESS_123',
      }),
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.verification.isVerified).toBe(true);

    // 3. Query verification log
    const logRes = await app.request('/api/verification/log?agentId=test-agent-service-integration', {
      headers: authHeaders,
    });
    expect(logRes.status).toBe(200);
    const logBody = await logRes.json();
    expect(logBody.log).toBeDefined();
    expect(Array.isArray(logBody.log)).toBe(true);
    expect(logBody.log.length).toBeGreaterThan(0);
  });

  it('should reject shape-only ALGO signature in production mode with HTTP 400 INVALID_SIGNATURE', async () => {
    const originalEnv = config.nodeEnv;
    try {
      config.nodeEnv = 'production';

      // 1. Request challenge
      const challengeRes = await app.request('/api/verification/challenge', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          agentId: 'test-agent-service-prod-check',
        }),
      });

      expect(challengeRes.status).toBe(200);
      const challengeBody = await challengeRes.json();
      expect(challengeBody.challenge).toBeDefined();
      const nonce = challengeBody.challenge.challenge;
      expect(nonce).toBeDefined();

      // 2. Submit shape-only signature with ALGO: address
      const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const verifyRes = await app.request('/api/verification/verify', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          agentId: 'test-agent-service-prod-check',
          challenge: nonce,
          signature: dummySignature,
          walletAddress: 'ALGO:TEST_WALLET_ADDRESS_PROD',
        }),
      });

      expect(verifyRes.status).toBe(400);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.error).toBeDefined();
      expect(verifyBody.error.code).toBe('INVALID_SIGNATURE');
    } finally {
      config.nodeEnv = originalEnv;
    }
  });
});
