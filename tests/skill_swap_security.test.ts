import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { memTrades, clearMemSkillSwap } from '../src/routes/skill-swap';
import { clearSqliteSkillSwap } from '../src/db/sqlite';

describe('Skill Swap Security & PostgREST Injection Protection', () => {
  beforeEach(async () => {
    clearMemSkillSwap();
    await clearSqliteSkillSwap();
  });

  it('should return 401 Unauthorized for unauthenticated requests to GET /api/skill-swap/trades', async () => {
    const res = await app.request('/api/skill-swap/trades');
    expect(res.status).toBe(401);
  });

  it('should return trades for authenticated agent without error', async () => {
    const res = await app.request('/api/skill-swap/trades', {
      headers: {
        'X-Agent-ID': 'test-agent-123',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades).toBeDefined();
    expect(Array.isArray(body.trades)).toBe(true);
  });

  it('should safely handle agentId containing PostgREST injection characters', async () => {
    const injectionAgentId = 'malicious-agent",from_agent_id.neq.0,to_user_id.eq."attacker';
    const res = await app.request('/api/skill-swap/trades', {
      headers: {
        'X-Agent-ID': injectionAgentId,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades).toBeDefined();
    expect(Array.isArray(body.trades)).toBe(true);
  });

  it('should safely handle search query containing PostgREST injection characters in GET /api/skill-swap/offers', async () => {
    const injectionSearch = 'python",skill_name.neq."safe';
    const res = await app.request(`/api/skill-swap/offers?search=${encodeURIComponent(injectionSearch)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offers).toBeDefined();
    expect(Array.isArray(body.offers)).toBe(true);
  });

  it('should safely handle search query containing PostgREST injection characters in GET /api/skill-swap/requests', async () => {
    const injectionSearch = 'coding",description.neq."safe';
    const res = await app.request(`/api/skill-swap/requests?search=${encodeURIComponent(injectionSearch)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toBeDefined();
    expect(Array.isArray(body.requests)).toBe(true);
  });

  describe('IDOR Protection on Trades Endpoints', () => {
    const tradeId = '123e4567-e89b-12d3-a456-426614174000';
    const sellerAgentId = 'seller-agent';
    const buyerAgentId = 'buyer-agent';
    const intruderAgentId = 'intruder-agent';

    beforeEach(() => {
      memTrades.set(tradeId, {
        id: tradeId,
        offerId: 'offer-1',
        requestId: null,
        fromAgentId: sellerAgentId,
        toAgentId: buyerAgentId,
        status: 'in_progress',
        priceMicroAlgos: 100,
        paymentStatus: 'unpaid',
        escrowId: null,
        notes: 'Confidential trade terms',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('should return 401 Unauthorized for unauthenticated requests to GET /api/skill-swap/trades/:id', async () => {
      const res = await app.request(`/api/skill-swap/trades/${tradeId}`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 Forbidden when an unauthorized agent attempts to view trade details via GET /api/skill-swap/trades/:id', async () => {
      const res = await app.request(`/api/skill-swap/trades/${tradeId}`, {
        headers: {
          'X-Agent-ID': intruderAgentId,
        },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Not involved in this trade');
    });

    it('should allow trade participants to view trade details via GET /api/skill-swap/trades/:id', async () => {
      // Seller can access
      const sellerRes = await app.request(`/api/skill-swap/trades/${tradeId}`, {
        headers: {
          'X-Agent-ID': sellerAgentId,
        },
      });
      expect(sellerRes.status).toBe(200);
      const sellerBody = await sellerRes.json();
      expect(sellerBody.trade).toBeDefined();
      expect(sellerBody.trade.id).toBe(tradeId);

      // Buyer can access
      const buyerRes = await app.request(`/api/skill-swap/trades/${tradeId}`, {
        headers: {
          'X-Agent-ID': buyerAgentId,
        },
      });
      expect(buyerRes.status).toBe(200);
      const buyerBody = await buyerRes.json();
      expect(buyerBody.trade).toBeDefined();
      expect(buyerBody.trade.id).toBe(tradeId);
    });

    it('should return 403 Forbidden when an unauthorized agent attempts to complete another agent trade', async () => {
      const res = await app.request(`/api/skill-swap/trades/${tradeId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-ID': intruderAgentId,
        },
        body: JSON.stringify({ notes: 'Intruder trying to complete' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Not involved in this trade');
    });

    it('should return 403 Forbidden when an unauthorized agent attempts to cancel another agent trade', async () => {
      const res = await app.request(`/api/skill-swap/trades/${tradeId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-ID': intruderAgentId,
        },
        body: JSON.stringify({ reason: 'Intruder trying to cancel' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Not involved in this trade');
    });
  });
});
